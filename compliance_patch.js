(function(){
  const ALLERGENS=['Celery','Cereals containing gluten','Crustaceans','Eggs','Fish','Lupin','Milk','Molluscs','Mustard','Peanuts','Sesame','Soya','Sulphur dioxide / sulphites','Tree nuts'];

  function waitForApp(){
    if(typeof VIEWS==='undefined'||typeof page!=='function'||typeof modal!=='function'||typeof state==='undefined') return setTimeout(waitForApp,150);
    if(window.__compliancePatchInstalled) return;
    window.__compliancePatchInstalled=true;

    state.allergenRecords=state.allergenRecords||[];
    state.managerSignoffs=state.managerSignoffs||[];

    const isManager=()=>me&&String(me.role||'').toLowerCase()==='manager';
    const recordName=r=>r.name||r.title||r.dish||r.product||'Unnamed item';
    const currentAllergens=r=>Array.isArray(r.allergens)?r.allergens:(typeof r.allergens==='string'?r.allergens.split(',').map(x=>x.trim()).filter(Boolean):[]);

    function allMenuItems(){
      const out=[];
      (state.recipes||[]).forEach(r=>out.push({source:'recipe',id:r.id,name:recordName(r),record:r}));
      (state.menus||[]).forEach(m=>{
        (m.items||m.dishes||[]).forEach(i=>out.push({source:'menu',id:i.id||`${m.id}-${recordName(i)}`,name:recordName(i),record:i,menu:m.name||m.title||'Menu'}));
      });
      return out;
    }

    function statusBadge(x){
      const verified=!!x.allergenVerified;
      return verified?'<span class="pill ok">Verified</span>':'<span class="pill warn">Needs verification</span>';
    }

    VIEWS.allergens=function(){
      const items=allMenuItems();
      page('Allergen management','Maintain and verify allergen information for every dish and product',`
        <div class="notice"><b>Important:</b> allergen information must be checked against actual ingredients, packaging and supplier specifications. AI suggestions are drafts only.</div>
        <div class="card">
          <div class="card-head"><div><h2>Dish and recipe allergen register</h2><p class="muted">${items.length} menu/recipe items</p></div>${isManager()?'<button class="btn sm" onclick="addAllergenItem()">Add item</button>':''}</div>
          ${items.length?`<div class="twrap"><table class="tbl"><thead><tr><th>Item</th><th>Source</th><th>Declared allergens</th><th>Status</th><th>Verified by</th><th></th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc(x.name)}</b>${x.menu?`<div class="muted">${esc(x.menu)}</div>`:''}</td><td>${esc(x.source)}</td><td>${currentAllergens(x.record).length?currentAllergens(x.record).map(a=>`<span class="pill">${esc(a)}</span>`).join(' '):'<span class="muted">None recorded</span>'}</td><td>${statusBadge(x.record)}</td><td>${esc(x.record.allergenVerifiedBy||'—')} ${x.record.allergenVerifiedAt?`<div class="muted">${fmtDT(x.record.allergenVerifiedAt)}</div>`:''}</td><td><button class="btn sm ghost" onclick="allergenForm('${x.source}','${x.id}')">${isManager()?'Edit / verify':'View'}</button></td></tr>`).join('')}</tbody></table></div>`:emptyState('No recipes or menu items','Add recipes or upload a menu first.')}
        </div>
        <div class="card"><h2>Allergen controls</h2><p class="muted">Use separate utensils and preparation areas where required, prevent cross-contact, keep supplier specifications, and re-check records whenever ingredients or suppliers change.</p></div>`);
    };

    window.allergenForm=function(source,id){
      const item=allMenuItems().find(x=>x.source===source&&String(x.id)===String(id));
      if(!item) return toast('Item not found','bad');
      const r=item.record;
      const selected=new Set(currentAllergens(r));
      modal(`<h2>${esc(item.name)}</h2><form id="allergenForm">
        <div class="notice">Tick only allergens confirmed from the recipe, labels or supplier information.</div>
        <div class="check-grid">${ALLERGENS.map(a=>`<label class="check"><input type="checkbox" name="allergen" value="${esc(a)}" ${selected.has(a)?'checked':''} ${isManager()?'':'disabled'}> ${esc(a)}</label>`).join('')}</div>
        <label>Cross-contact / kitchen notes<textarea name="notes" ${isManager()?'':'readonly'}>${esc(r.allergenNotes||'')}</textarea></label>
        <label>Evidence / supplier specification reference<input name="evidence" value="${esc(r.allergenEvidence||'')}" ${isManager()?'':'readonly'}></label>
        ${isManager()?'<label class="check"><input type="checkbox" name="verified" '+(r.allergenVerified?'checked':'')+'> I have checked this against the current recipe and ingredient information</label><button class="btn" type="submit">Save allergen record</button>':''}
      </form>`);
      if(!isManager()) return;
      document.getElementById('allergenForm').onsubmit=async e=>{
        e.preventDefault();
        const fd=new FormData(e.target);
        r.allergens=fd.getAll('allergen');
        r.allergenNotes=String(fd.get('notes')||'').trim();
        r.allergenEvidence=String(fd.get('evidence')||'').trim();
        r.allergenVerified=fd.get('verified')==='on';
        r.allergenVerifiedBy=r.allergenVerified?me.name:'';
        r.allergenVerifiedAt=r.allergenVerified?nowISO():'';
        await audit('update','allergen_record',{item:item.name,verified:r.allergenVerified,allergens:r.allergens,by:me.name});
        save();closeModal();toast('Allergen record saved','ok');render();
      };
    };

    window.addAllergenItem=function(){
      if(!isManager()) return;
      modal(`<h2>Add allergen-only item</h2><form id="newAllergenItem"><label>Item name<input name="name" required></label><button class="btn" type="submit">Add</button></form>`);
      document.getElementById('newAllergenItem').onsubmit=async e=>{
        e.preventDefault(); const name=new FormData(e.target).get('name').trim();
        const rec={id:uid(),name,category:'Allergen register',ingredients:[],allergens:[],allergenVerified:false};
        state.recipes=state.recipes||[];state.recipes.push(rec);
        await audit('create','allergen_item',{name,by:me.name});save();closeModal();render();
      };
    };

    function pendingItems(){
      const rows=[];
      (state.checks||[]).forEach(x=>{if(x.exception||x.needsSignoff||x.status==='exception') rows.push({kind:'Temperature exception',id:x.id,when:x.time||x.createdAt||x.date,summary:`${x.applianceName||x.unit||'Temperature'} ${x.value??x.temp??''}°C`,source:x});});
      (state.dailyChecks||[]).forEach(x=>{if(x.needsSignoff||x.managerVerificationRequired||x.status==='awaiting-signoff') rows.push({kind:'Daily check',id:x.id,when:x.time||x.createdAt||x.date,summary:x.title||x.check||x.name||'Daily check',source:x});});
      (state.deliveryChecks||[]).forEach(x=>{if(x.decision&&x.decision!=='Accepted'&&!x.managerSignedOffAt) rows.push({kind:'Delivery issue',id:x.id,when:x.time||x.date,summary:`${x.supplier||'Supplier'} — ${x.decision}`,source:x});});
      (state.operations||[]).forEach(x=>{if(x.needsSignoff||x.managerVerificationRequired||x.status==='awaiting-signoff') rows.push({kind:'Operational check',id:x.id,when:x.time||x.createdAt||x.date,summary:x.title||x.task||x.name||'Operational check',source:x});});
      (state.scheduleCompletions||[]).forEach(x=>{if(x.managerVerificationRequired&&!x.managerSignedOffAt) rows.push({kind:'Cleaning verification',id:x.id,when:x.completedAt||x.date,summary:x.task||x.title||'Cleaning task',source:x});});
      return rows.filter(x=>!x.source.managerSignedOffAt&&!x.source.managerRejectedAt);
    }

    VIEWS.signoffs=function(){
      const pending=pendingItems();
      const completed=(state.managerSignoffs||[]).slice().sort((a,b)=>String(b.time).localeCompare(String(a.time)));
      page('Manager sign-offs','Review exceptions and verification-required records',`
        <div class="card"><div class="card-head"><div><h2>Awaiting manager review</h2><p class="muted">${pending.length} outstanding</p></div></div>
        ${pending.length?`<div class="twrap"><table class="tbl"><thead><tr><th>Type</th><th>Date/time</th><th>Record</th><th>Recorded by</th><th></th></tr></thead><tbody>${pending.map((x,i)=>`<tr><td>${esc(x.kind)}</td><td>${x.when?fmtDT(x.when):'—'}</td><td>${esc(x.summary)}</td><td>${esc(x.source.staff||x.source.by||x.source.completedBy||'—')}</td><td>${isManager()?`<button class="btn sm" onclick="reviewSignoff(${i})">Review</button>`:'Manager required'}</td></tr>`).join('')}</tbody></table></div>`:emptyState('Nothing awaiting sign-off','Exceptions and verification-required checks will appear here.')}
        </div>
        <div class="card"><h2>Sign-off history</h2>${completed.length?`<div class="twrap"><table class="tbl"><thead><tr><th>Date/time</th><th>Decision</th><th>Record</th><th>Manager</th><th>Notes</th></tr></thead><tbody>${completed.map(x=>`<tr><td>${fmtDT(x.time)}</td><td>${esc(x.decision)}</td><td>${esc(x.kind)} — ${esc(x.summary)}</td><td>${esc(x.manager)}</td><td>${esc(x.notes||'—')}</td></tr>`).join('')}</tbody></table></div>`:emptyState('No sign-offs yet','Completed manager reviews will be retained here.')}</div>`);
    };
    VIEWS.signoff=VIEWS.signoffs;

    window.reviewSignoff=function(index){
      if(!isManager()) return toast('Manager access required','bad');
      const item=pendingItems()[index]; if(!item) return render();
      modal(`<h2>Manager review</h2><div class="notice"><b>${esc(item.kind)}</b><br>${esc(item.summary)}</div><form id="signoffReview"><label>Decision<select name="decision"><option>Approved</option><option>Rejected / corrective action required</option></select></label><label>Manager notes<textarea name="notes" required></textarea></label><button class="btn" type="submit">Complete sign-off</button></form>`);
      document.getElementById('signoffReview').onsubmit=async e=>{
        e.preventDefault(); const f=Object.fromEntries(new FormData(e.target)); const approved=f.decision==='Approved'; const t=nowISO();
        item.source.managerSignedOffAt=approved?t:'';item.source.managerSignedOffBy=approved?me.name:'';item.source.managerRejectedAt=approved?'':t;item.source.managerRejectedBy=approved?'':me.name;item.source.managerSignoffNotes=f.notes.trim();
        state.managerSignoffs.push({id:uid(),time:t,decision:f.decision,kind:item.kind,recordId:item.id,summary:item.summary,manager:me.name,notes:f.notes.trim()});
        await audit(approved?'approve':'reject','manager_signoff',{kind:item.kind,recordId:item.id,summary:item.summary,notes:f.notes.trim(),by:me.name});
        save();closeModal();toast('Manager review saved','ok');render();
      };
    };

    if(typeof route!=='undefined'&&(route==='allergens'||route==='signoffs'||route==='signoff')) render();
  }
  waitForApp();
})();