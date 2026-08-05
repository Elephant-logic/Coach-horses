(function(){
  function install(){
    if(typeof VIEWS==='undefined'||typeof page!=='function'||typeof modal!=='function'||typeof state==='undefined'){
      return setTimeout(install,150);
    }
    if(window.__deliveryChecksInstalled) return;
    window.__deliveryChecksInstalled=true;

    const css=document.createElement('style');
    css.textContent=`
      .modal-wrap{align-items:center!important;justify-content:center!important;padding:12px!important;overflow-y:auto!important}
      .modal-wrap[hidden],.modal-wrap.hidden,.modal-wrap[aria-hidden="true"]{display:none!important}
      .modal{width:min(760px,100%)!important;max-height:calc(100dvh - 24px)!important;overflow:auto!important;overscroll-behavior:contain}
      .delivery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .delivery-grid .full{grid-column:1/-1}
      @media(max-width:640px){.delivery-grid{grid-template-columns:1fr}.delivery-grid .full{grid-column:auto}}
    `;
    document.head.appendChild(css);

    VIEWS.deliverychecks=function(){
      state.deliveryChecks=state.deliveryChecks||[];
      const rows=state.deliveryChecks.slice().sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')));
      page('Delivery checks','Record supplier deliveries, temperatures, condition and acceptance',`
        <div class="card">
          <div class="card-head">
            <div><h2>Delivery intake</h2><p class="muted">Use this when goods arrive.</p></div>
            <button class="btn sm" onclick="deliveryCheckForm()">Record delivery</button>
          </div>
          ${rows.length?`<div class="twrap"><table class="tbl"><thead><tr><th>Date/time</th><th>Supplier</th><th>Reference</th><th>Items</th><th>Chilled</th><th>Frozen</th><th>Condition</th><th>Decision</th><th>By</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${fmtDT(x.time)}</td><td>${esc(x.supplier||'—')}</td><td>${esc(x.reference||'—')}</td><td>${esc(x.items||'—')}</td><td>${x.chilledTemp!==''&&x.chilledTemp!=null?esc(x.chilledTemp)+'°C':'—'}</td><td>${x.frozenTemp!==''&&x.frozenTemp!=null?esc(x.frozenTemp)+'°C':'—'}</td><td>${esc(x.condition||'—')}</td><td>${esc(x.decision||'Accepted')}</td><td>${esc(x.staff||'—')}</td><td><button class="btn sm ghost" onclick="deliveryCheckForm('${x.id}')">Open</button></td></tr>`).join('')}</tbody></table></div>`:emptyState('No delivery checks yet','Tap Record delivery when the next supplier delivery arrives.')}
        </div>`);
    };

    window.deliveryCheckForm=function(id=''){
      state.deliveryChecks=state.deliveryChecks||[];
      const x=id?state.deliveryChecks.find(r=>r.id===id):null;
      const readOnly=!!x;
      modal(`<h2>${readOnly?'Delivery check':'Record delivery check'}</h2><form id="deliveryCheckForm" class="delivery-grid">
        <label>Supplier<input name="supplier" value="${esc(x?.supplier||'')}" ${readOnly?'readonly':''} required></label>
        <label>Delivery note / reference<input name="reference" value="${esc(x?.reference||'')}" ${readOnly?'readonly':''}></label>
        <label class="full">Items received<textarea name="items" ${readOnly?'readonly':''} required>${esc(x?.items||'')}</textarea></label>
        <label>Chilled temperature °C<input name="chilledTemp" type="number" step="0.1" value="${x?.chilledTemp??''}" ${readOnly?'readonly':''}></label>
        <label>Frozen temperature °C<input name="frozenTemp" type="number" step="0.1" value="${x?.frozenTemp??''}" ${readOnly?'readonly':''}></label>
        <label>Packaging / vehicle condition<select name="condition" ${readOnly?'disabled':''}><option>Good</option><option>Damaged</option><option>Contaminated</option><option>Other issue</option></select></label>
        <label>Decision<select name="decision" ${readOnly?'disabled':''}><option>Accepted</option><option>Accepted with action</option><option>Rejected</option></select></label>
        <label class="full">Corrective action / notes<textarea name="action" ${readOnly?'readonly':''}>${esc(x?.action||'')}</textarea></label>
        ${readOnly?`<div class="notice full">Recorded by <b>${esc(x.staff||'')}</b> on ${fmtDT(x.time)}.</div>`:`<button class="btn full" type="submit">Save delivery check</button>`}
      </form>`);
      if(readOnly){
        const form=document.getElementById('deliveryCheckForm');
        if(form){form.condition.value=x.condition||'Good';form.decision.value=x.decision||'Accepted';}
        return;
      }
      const form=document.getElementById('deliveryCheckForm');
      if(!form) return;
      form.onsubmit=async function(e){
        e.preventDefault();
        const f=Object.fromEntries(new FormData(e.target));
        const chilled=f.chilledTemp===''?'':Number(f.chilledTemp);
        const frozen=f.frozenTemp===''?'':Number(f.frozenTemp);
        const concern=(chilled!==''&&chilled>8)||(frozen!==''&&frozen>-12)||f.condition!=='Good'||f.decision!=='Accepted';
        if(concern&&!String(f.action||'').trim()) return toast('Add the corrective action or rejection reason.','bad');
        const rec={id:uid(),time:nowISO(),date:today(),supplier:f.supplier.trim(),reference:f.reference.trim(),items:f.items.trim(),chilledTemp:chilled,frozenTemp:frozen,condition:f.condition,decision:f.decision,action:String(f.action||'').trim(),staff:me.name};
        state.deliveryChecks.push(rec);
        await audit('create','delivery_check',{supplier:rec.supplier,decision:rec.decision,by:me.name});
        save();closeModal();toast('Delivery check saved','ok');render();
      };
    };

    if(typeof route!=='undefined'&&route==='deliverychecks') render();
  }
  install();
})();

(function(){
  function installPaperworkDelete(){
    if(typeof state==='undefined'||typeof esc!=='function'||typeof save!=='function'||typeof audit!=='function'){
      return setTimeout(installPaperworkDelete,150);
    }
    if(window.__paperworkDeleteInstalled) return;
    window.__paperworkDeleteInstalled=true;

    window.deletePaperwork=async function(id){
      if(!window.me||me.role!=='manager') return toast('Manager access required.','bad');
      const p=(state.paperwork||[]).find(x=>x.id===id);
      if(!p) return toast('Document not found.','bad');
      const ok=confirm(`Delete “${p.title||'this document'}”?\n\nThis removes the uploaded document image. Any temperature readings already imported into the digital register will remain for audit history.`);
      if(!ok) return;
      state.paperwork=state.paperwork.filter(x=>x.id!==id);
      await audit('delete','paperwork',{id,title:p.title||'',deletedBy:me.name});
      save();
      if(typeof closeModal==='function') closeModal();
      toast('Uploaded document deleted.','ok');
      render();
    };

    const managerDeleteButton=p=>(window.me&&me.role==='manager')?`<button class="btn sm ghost" onclick="deletePaperwork('${p.id}')" style="color:#a33;border-color:#c99">Delete</button>`:'';
    paperCard=function(p){
      return `<article class="paper-card" data-search="${esc(((p.title||'')+' '+(p.type||'')+' '+(p.notes||'')+' '+(p.recordDate||'')).toLowerCase())}" data-year="${esc(String(p.recordDate||'').slice(0,4))}">
        <img src="${p.image}" alt="${esc(p.title||'Document')}" loading="lazy" onclick="viewPaper('${p.id}')">
        <div class="body"><h3>${esc(p.title||'Document')}</h3><div class="muted">${esc(p.recordDate||'Undated')} · ${esc(p.type||'Document')}</div>
        <p class="muted" style="font-size:12.5px">${esc(p.notes||'')}</p>
        <div class="btn-row"><button class="btn sm" onclick="viewPaper('${p.id}')">Open</button>
          <button class="btn sm ghost" onclick="editPaper('${p.id}')">Edit</button>
          <button class="btn sm ghost" onclick="aiPaper('${p.id}')">AI review</button>${managerDeleteButton(p)}</div></div></article>`;
    };
  }
  installPaperworkDelete();
})();
