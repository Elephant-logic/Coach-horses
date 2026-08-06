(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof modal!=='function'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__menuPrepWorkflowV1) return;
    window.__menuPrepWorkflowV1=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
    const round=n=>Math.round((Number(n)||0)*100)/100;
    const now=()=>typeof nowISO==='function'?nowISO():new Date().toISOString();
    const manager=()=>{try{return !!(typeof me!=='undefined'&&me&&norm(me.role)==='manager');}catch(_){return false;}};
    const staff=['Keith Davies','Ian Park','Harry Duckworth'];
    let draft=null;

    function recipesFor(menu){
      const ids=(Array.isArray(menu?.recipeIds)?menu.recipeIds:[]).map(String);
      if(ids.length) return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
      return [].concat(menu?.recipes||[],menu?.items||[],menu?.dishes||[]).map(x=>typeof x==='string'?(state.recipes||[]).find(r=>String(r.id)===x||norm(r.name)===norm(x)):x).filter(Boolean);
    }

    function openRecipe(id){
      if(typeof window.recipeForm==='function') return window.recipeForm(id);
      if(typeof window.openRecipe==='function') return window.openRecipe(id);
      if(typeof toast==='function') toast('Recipe editor is unavailable','bad');
    }

    window.menuWorkflowBuilder=function(id=''){
      if(!manager()) return toast('Manager access required','bad');
      const existing=id?(state.menus||[]).find(m=>String(m.id)===String(id)):null;
      const chosen=new Set((existing?.recipeIds||[]).map(String));
      const choices=(state.recipes||[]).map(r=>`<label class="card" style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;padding:12px"><input type="checkbox" name="recipeIds" value="${escv(r.id)}" ${chosen.has(String(r.id))?'checked':''} style="width:22px;height:22px"><span><b>${escv(r.name)}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portions${r.needsVerification?' · VERIFY':''}</small></span></label>`).join('');
      modal(`<h2>${existing?'Edit':'Create'} menu</h2><form id="workflowMenuForm" class="form"><label>Menu name<input name="name" required value="${escv(existing?.name||'')}"></label><label>Description<textarea name="description">${escv(existing?.description||'')}</textarea></label><h3>Select dishes</h3><div style="max-height:50vh;overflow:auto">${choices||'<p class="muted">No recipes available.</p>'}</div><p id="workflowMenuCount" class="muted"></p><button class="btn" type="submit">${existing?'Update menu':'Create menu'}</button></form>`);
      const f=document.getElementById('workflowMenuForm');
      const refresh=()=>{const n=f.querySelectorAll('input[name="recipeIds"]:checked').length;document.getElementById('workflowMenuCount').textContent=n+' dishes selected';};
      f.addEventListener('change',refresh);refresh();
      f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),recipeIds=fd.getAll('recipeIds').map(String);if(recipeIds.length<1)return toast('Select at least one dish','bad');const data={name:String(fd.get('name')||'').trim(),description:String(fd.get('description')||'').trim(),recipeIds,updatedAt:now()};if(existing)Object.assign(existing,data);else(state.menus=state.menus||[]).push({id:uid(),...data,createdAt:now(),createdBy:me?.name||'Manager'});save();closeModal();toast(existing?'Menu updated':'Menu created','ok');menusView();};
    };

    window.openWorkflowMenu=function(id){
      const m=(state.menus||[]).find(x=>String(x.id)===String(id));if(!m)return;
      const rows=recipesFor(m).map(r=>`<div class="row"><span></span><div><b>${escv(r.name)}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portions${r.needsVerification?' · VERIFY':''}</small></div><button class="btn sm" type="button" onclick="workflowOpenRecipe('${escv(r.id)}')">Open recipe</button></div>`).join('');
      modal(`<h2>${escv(m.name)}</h2><p class="muted">${escv(m.description||'')}</p><div class="rows">${rows||'<p>No dishes attached.</p>'}</div><div class="btn-row mt"><button class="btn" onclick="closeModal();menuWorkflowBuilder('${escv(m.id)}')">Edit dishes</button></div>`);
    };
    window.workflowOpenRecipe=openRecipe;
    window.deleteWorkflowMenu=function(id){if(!manager())return toast('Manager access required','bad');const m=(state.menus||[]).find(x=>String(x.id)===String(id));if(!m)return;if(!confirm('Delete menu “'+(m.name||'Menu')+'”? Recipes will be kept.'))return;state.menus=state.menus.filter(x=>String(x.id)!==String(id));save();toast('Menu deleted','ok');menusView();};

    window.importWorkflowMenuPhotos=function(){
      if(!manager()) return toast('Manager access required','bad');
      let files=[];
      modal(`<h2>Import complete menu</h2><p class="muted">Take every page with the rear camera or choose several photos. All pages are read together and every dish becomes an editable draft recipe.</p><form id="workflowPhotoForm" class="form"><label>Menu name<input name="name" required placeholder="Coach menu"></label><input id="workflowCamera" type="file" accept="image/*" capture="environment" hidden><input id="workflowGallery" type="file" accept="image/*" multiple hidden><div class="btn-row"><button class="btn" id="workflowTake" type="button">Take menu photo</button><button class="btn ghost" id="workflowChoose" type="button">Choose photos</button></div><div class="card" style="padding:12px"><b id="workflowPhotoCount">0 pages added</b><div id="workflowPhotoNames" class="muted"></div></div><div class="btn-row"><button class="btn ghost" id="workflowAnother" type="button">Take another page</button><button class="btn" id="workflowRead" type="submit" disabled>Read all pages</button></div></form>`);
      const cam=document.getElementById('workflowCamera'),gal=document.getElementById('workflowGallery'),read=document.getElementById('workflowRead');
      const add=list=>{for(const f of list){const k=[f.name,f.size,f.lastModified].join('|');if(!files.some(x=>[x.name,x.size,x.lastModified].join('|')===k))files.push(f);}document.getElementById('workflowPhotoCount').textContent=files.length+' page'+(files.length===1?'':'s')+' added';document.getElementById('workflowPhotoNames').textContent=files.map((f,i)=>(i+1)+'. '+f.name).join(' · ');read.disabled=!files.length;};
      cam.onchange=()=>{add([...cam.files]);cam.value='';};gal.onchange=()=>{add([...gal.files]);gal.value='';};
      document.getElementById('workflowTake').onclick=()=>cam.click();document.getElementById('workflowAnother').onclick=()=>cam.click();document.getElementById('workflowChoose').onclick=()=>gal.click();
      document.getElementById('workflowPhotoForm').onsubmit=async e=>{e.preventDefault();if(!files.length)return toast('Add at least one photo','bad');const menuName=String(new FormData(e.target).get('name')||'').trim();read.disabled=true;try{toast('Reading '+files.length+' menu pages…','ok');const dataUrls=await Promise.all(files.map(f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);})));const content=[{type:'input_text',text:'Read ALL attached images as ONE menu. Return ONLY JSON with keys menuName, description, dishes. Include every distinct dish from every page. Each dish must have name, category, description, price, allergens, portions, ingredients, method. portions must be 10 unless clearly stated. ingredients must be an array of objects with name, qty as a positive number, and unit. Estimate sensible commercial-kitchen quantities for 10 portions when not printed, and set needsVerification true. Never merge separate dishes.'},...dataUrls.map(image_url=>({type:'input_image',image_url}))];const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content}]})});const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'Menu reading failed');let text=data.output_text||'';if(!text&&Array.isArray(data.output))for(const item of data.output)for(const part of(item.content||[]))if(part.text)text+=part.text;const match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error('No menu data returned');const obj=JSON.parse(match[0]),dishes=Array.isArray(obj.dishes)?obj.dishes:[];if(!dishes.length)throw new Error('No dishes found');state.recipes=state.recipes||[];state.menus=state.menus||[];const recipeIds=[];for(const d of dishes){let r=state.recipes.find(x=>norm(x.name)===norm(d.name));const ingredients=(Array.isArray(d.ingredients)?d.ingredients:[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'each'}:{name:i.name||'Ingredient',qty:Math.max(0.01,num(i.qty||i.quantity)||1),unit:i.unit||'each'});const recipeData={name:d.name||'Untitled dish',category:d.category||'Menu item',course:d.category||'Other',portions:Math.max(1,num(d.portions)||10),ingredients,method:Array.isArray(d.method)?d.method.join('\n'):String(d.method||d.description||''),allergens:Array.isArray(d.allergens)?d.allergens.join(', '):String(d.allergens||'VERIFY'),sellingPrice:num(d.price),needsVerification:true,source:'Menu photo import',updatedAt:now()};if(r)Object.assign(r,recipeData);else{r={id:uid(),...recipeData,createdAt:now(),createdBy:me?.name||'Manager'};state.recipes.push(r);}recipeIds.push(r.id);}const menu={id:uid(),name:menuName||obj.menuName||'Imported menu',description:obj.description||'',recipeIds:[...new Set(recipeIds)],createdAt:now(),createdBy:me?.name||'Manager',source:'Menu photos',pageCount:files.length};state.menus.push(menu);save();closeModal();toast('Imported '+menu.recipeIds.length+' dishes from '+files.length+' pages','ok');menusView();}catch(err){read.disabled=false;toast(err.message,'bad');}};
    };

    function menusView(){
      const menus=state.menus||[];
      const rows=menus.map(m=>`<div class="row"><span></span><div><b>${escv(m.name||'Menu')}</b><br><small>${recipesFor(m).length} dishes${m.pageCount?' · '+m.pageCount+' pages':''}</small></div><div class="btn-row"><button class="btn sm" type="button" onclick="openWorkflowMenu('${escv(m.id)}')">Open menu</button><button class="btn sm ghost" type="button" onclick="menuWorkflowBuilder('${escv(m.id)}')">Edit dishes</button><button class="btn sm bad" type="button" onclick="deleteWorkflowMenu('${escv(m.id)}')">Delete</button></div></div>`).join('');
      page('Menus & recipes','Import menu pages, review editable draft recipes and manage saved menus.',`<div class="card"><div class="card-head"><h2>Menu tools</h2><div class="btn-row"><button class="btn" onclick="importWorkflowMenuPhotos()">Import menu photos</button><button class="btn ghost" onclick="menuWorkflowBuilder()">Create menu</button></div></div><p class="muted">Imported dishes are saved in the recipe library and can be edited before prep and ordering.</p></div><div class="card mt"><h2>Saved menus</h2><div class="rows">${rows||'<p class="muted">No menus saved.</p>'}</div></div>`);
    }

    function calculate(menu,covers,stock={}){
      const order=new Map(),jobs=[];
      for(const r of recipesFor(menu)){
        const factor=covers/Math.max(1,num(r.portions||r.yield)||10),ingredients=(r.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'each'}:i).filter(i=>i&&i.name);
        jobs.push({id:uid(),recipeId:r.id,recipeName:r.name||'Dish',portions:covers,assignedTo:'',status:'open',method:r.method||'',ingredients:ingredients.map(i=>({name:i.name,qty:round((num(i.qty||i.quantity)||1)*factor),unit:i.unit||'each'}))});
        for(const i of ingredients){const name=String(i.name).trim(),unit=String(i.unit||'each').trim(),key=norm(name)+'|'+norm(unit),need=round((num(i.qty||i.quantity)||1)*factor),row=order.get(key)||{key,name,unit,required:0,inStock:0,toBuy:0};row.required=round(row.required+need);order.set(key,row);}
      }
      for(const row of order.values()){row.inStock=Math.max(0,num(stock[row.key]));row.toBuy=round(Math.max(0,row.required-row.inStock));}
      return {jobs,order:[...order.values()]};
    }

    function prepView(){
      const options=(state.menus||[]).map(m=>`<option value="${escv(m.id)}">${escv(m.name)} (${recipesFor(m).length} dishes)</option>`).join('');
      const saved=(state.prepPlans||[]).slice().reverse().map(p=>`<button type="button" class="row" onclick="openSavedWorkflowPrep('${escv(p.id)}')" style="width:100%;border:0;background:transparent;text-align:left"><span></span><div><b>${escv(p.menuName)}</b><br><small>${escv(p.date)} · ${p.covers} covers · ${(p.items||[]).length} jobs</small></div></button>`).join('');
      page('Prep Lists','A saved menu and covers create the prep list and combined order list. Missing stock counts as zero.',`<div class="card"><div class="card-head"><h2>Build prep and order</h2><button class="btn ghost" onclick="importWorkflowMenuPhotos()">Upload menu photos</button></div><div class="form"><label>Saved menu<select id="wfPrepMenu"><option value="">Select menu</option>${options}</select></label><label>Projected covers<input id="wfPrepCovers" type="number" min="1" value="40"></label><label>Service date<input id="wfPrepDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><button class="btn" id="wfBuildPrep" type="button">Build prep list and order list</button></div></div><div id="wfPrepOutput"></div><div class="card mt"><h2>Saved prep plans</h2><div class="rows">${saved||'<p class="muted">No prep plans created.</p>'}</div></div>`);
      setTimeout(()=>{const b=document.getElementById('wfBuildPrep');if(b)b.onclick=buildDraft;},0);
    }

    function buildDraft(){const id=String(document.getElementById('wfPrepMenu')?.value||''),menu=(state.menus||[]).find(m=>String(m.id)===id);if(!menu)return toast('Select a saved menu','bad');const covers=Math.max(1,Math.round(num(document.getElementById('wfPrepCovers')?.value)||1)),date=document.getElementById('wfPrepDate')?.value||new Date().toISOString().slice(0,10);const result=calculate(menu,covers,{});if(!result.jobs.length)return toast('This menu has no recipes attached','bad');draft={menu,covers,date,result};renderDraft();}
    function renderDraft(){const host=document.getElementById('wfPrepOutput');if(!host||!draft)return;const opts=staff.map(n=>`<option>${escv(n)}</option>`).join(''),jobs=draft.result.jobs.map(j=>`<div class="row"><span></span><div><b>${escv(j.recipeName)}</b><br><small>${j.portions} portions</small></div><select class="wfAssign" data-name="${escv(j.recipeName)}"><option value="">Unassigned</option>${opts}</select></div>`).join(''),rows=draft.result.order.map(i=>`<tr><td>${escv(i.name)}</td><td>${i.required} ${escv(i.unit)}</td><td><input class="wfStock" data-key="${escv(i.key)}" type="number" min="0" step="0.01" value="${i.inStock}"></td><td><b>${i.toBuy} ${escv(i.unit)}</b></td></tr>`).join('');host.innerHTML=`<div class="card mt"><h2>Prep list</h2><div class="rows">${jobs}</div></div><div class="card mt"><h2>Order list</h2><p class="muted">Leave stock at zero when none is available.</p><div class="twrap"><table class="tbl"><thead><tr><th>Ingredient</th><th>Required</th><th>In stock</th><th>Order</th></tr></thead><tbody>${rows}</tbody></table></div><div class="btn-row mt"><button class="btn ghost" id="wfRecalc">Recalculate</button><button class="btn" id="wfSave">Save prep and order</button></div></div>`;document.getElementById('wfRecalc').onclick=recalc;document.getElementById('wfSave').onclick=savePrep;}
    function recalc(){const stock={};document.querySelectorAll('.wfStock').forEach(i=>stock[i.dataset.key]=i.value);const assigned={};document.querySelectorAll('.wfAssign').forEach(s=>assigned[s.dataset.name]=s.value);draft.result=calculate(draft.menu,draft.covers,stock);draft.result.jobs.forEach(j=>j.assignedTo=assigned[j.recipeName]||'');renderDraft();}
    function savePrep(){recalc();const createdAt=now(),plan={id:uid(),menuId:draft.menu.id,menuName:draft.menu.name,date:draft.date,covers:draft.covers,items:draft.result.jobs,status:'open',createdAt,source:'unified-menu-prep'},list={id:uid(),prepPlanId:plan.id,menuId:draft.menu.id,menuName:draft.menu.name,date:draft.date,covers:draft.covers,items:draft.result.order,createdAt,source:'unified-menu-order'};state.prepPlans=state.prepPlans||[];state.shoppingLists=state.shoppingLists||[];state.prepPlans.push(plan);state.shoppingLists.push(list);save();toast('Prep and order saved','ok');showSaved(plan,list);}
    function showSaved(plan,list){const host=document.getElementById('wfPrepOutput');if(!host)return;const jobs=(plan.items||[]).map(j=>`<div class="row"><span></span><div><b>${escv(j.recipeName)}</b><br><small>${j.portions} portions · ${escv(j.assignedTo||'Unassigned')}</small></div></div>`).join(''),order=(list.items||[]).filter(i=>i.toBuy>0).map(i=>`<tr><td>${escv(i.name)}</td><td>${i.toBuy}</td><td>${escv(i.unit)}</td></tr>`).join('');host.innerHTML=`<div class="card mt"><h2>Saved prep list</h2><div class="rows">${jobs}</div></div><div class="card mt"><div class="card-head"><h2>Saved order list</h2><button class="btn" onclick="downloadWorkflowOrder('${escv(list.id)}')">Download CSV</button></div><table class="tbl"><thead><tr><th>Ingredient</th><th>Order</th><th>Unit</th></tr></thead><tbody>${order||'<tr><td colspan="3">Nothing to order</td></tr>'}</tbody></table></div>`;}
    window.openSavedWorkflowPrep=id=>{const p=(state.prepPlans||[]).find(x=>String(x.id)===String(id)),l=(state.shoppingLists||[]).find(x=>String(x.prepPlanId)===String(id));if(p&&l)showSaved(p,l);};
    window.downloadWorkflowOrder=id=>{const l=(state.shoppingLists||[]).find(x=>String(x.id)===String(id));if(!l)return;const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"',rows=[['Ingredient','Order','Unit'],...(l.items||[]).filter(i=>i.toBuy>0).map(i=>[i.name,i.toBuy,i.unit])],blob=new Blob([rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='order-'+(l.date||'list')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);};

    VIEWS.menus=menusView;VIEWS.prep=prepView;VIEWS.prepLists=prepView;VIEWS.preplists=prepView;
    window.openPrepLists=prepView;
  }
  boot();
})();
