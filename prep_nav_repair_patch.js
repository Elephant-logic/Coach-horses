(function(){
  function boot(){
    if(typeof page!=='function'||typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__prepNavRepairPatchV4) return;
    window.__prepNavRepairPatchV4=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
    const round=n=>Math.round((Number(n)||0)*100)/100;
    const staff=['Keith Davies','Ian Park','Harry Duckworth'];
    let draft=null;

    function recipesFor(menu){
      const ids=Array.isArray(menu&&menu.recipeIds)?menu.recipeIds.map(String):[];
      if(ids.length) return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
      const embedded=[].concat(menu&&menu.recipes||[],menu&&menu.items||[],menu&&menu.dishes||[]);
      return embedded.map(x=>typeof x==='string'?(state.recipes||[]).find(r=>String(r.id)===x||norm(r.name)===norm(x)):x).filter(Boolean);
    }

    function build(menu,covers,stock={}){
      const recipes=recipesFor(menu),order=new Map(),jobs=[];
      for(const r of recipes){
        const yieldQty=Math.max(1,num(r.portions||r.yield)||10),factor=covers/yieldQty;
        const ingredients=(Array.isArray(r.ingredients)?r.ingredients:[]).map(i=>typeof i==='string'?{name:i,qty:0,unit:''}:i).filter(i=>i&&i.name);
        jobs.push({id:uid(),recipeId:r.id,recipeName:r.name||'Untitled dish',portions:covers,assignedTo:'',status:'open',method:r.method||'',ingredients:ingredients.map(i=>({name:i.name,qty:round(num(i.qty||i.quantity)*factor),unit:i.unit||''}))});
        for(const i of ingredients){
          const name=String(i.name||'').trim(),unit=String(i.unit||'').trim(),key=norm(name)+'|'+norm(unit),need=round(num(i.qty||i.quantity)*factor);
          const row=order.get(key)||{key,name,unit,required:0,inStock:0,toBuy:0};
          row.required=round(row.required+need); order.set(key,row);
        }
      }
      for(const row of order.values()){
        row.inStock=Math.max(0,num(stock[row.key]));
        row.toBuy=round(Math.max(0,row.required-row.inStock));
      }
      return {recipes,jobs,order:[...order.values()]};
    }

    function mainView(){
      const menus=Array.isArray(state.menus)?state.menus:[];
      const options=menus.map(m=>`<option value="${escv(m.id)}">${escv(m.name||'Saved menu')}</option>`).join('');
      const plans=Array.isArray(state.prepPlans)?state.prepPlans:[];
      const saved=plans.length?plans.slice().reverse().map(p=>`<button type="button" class="row" style="width:100%;text-align:left;border:0;background:transparent" onclick="openSavedPrep('${escv(p.id)}')"><span></span><div><b>${escv(p.menuName||'Prep plan')}</b><br><small>${escv(p.date||'')} · ${Number(p.covers||0)} covers · ${(p.items||[]).length} prep jobs</small></div></button>`).join(''):'<p class="muted">No prep plans created yet.</p>';
      page('Prep Lists','Choose the menu and covers. The menu creates both the prep list and the order list.',`
        <div class="card"><h2>Build today’s prep and order</h2>
          <div class="form">
            <label>Saved menu<select id="prepMenu"><option value="">Select a menu</option>${options}</select></label>
            <label>Projected covers<input id="prepCovers" type="number" min="1" value="40"></label>
            <label>Service date<input id="prepDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
            <button class="btn" id="prepCreate" type="button">Create prep list and order list</button>
          </div>
          <p class="muted" style="margin-top:10px">No stock entered means zero stock, so the full ingredient requirement goes onto the order list.</p>
        </div>
        <div id="prepOutput"></div>
        <div class="card mt"><h2>Saved prep plans</h2><div class="rows">${saved}</div></div>`);
      setTimeout(()=>{const b=document.getElementById('prepCreate');if(b)b.onclick=createDraft;},0);
    }

    function createDraft(){
      const menuId=String(document.getElementById('prepMenu')?.value||''),menu=(state.menus||[]).find(m=>String(m.id)===menuId);
      if(!menu) return typeof toast==='function'&&toast('Select a saved menu first','bad');
      const covers=Math.max(1,Math.round(num(document.getElementById('prepCovers')?.value)||1));
      const date=document.getElementById('prepDate')?.value||new Date().toISOString().slice(0,10);
      const result=build(menu,covers,{});
      if(!result.recipes.length) return typeof toast==='function'&&toast('That menu has no recipes attached','bad');
      draft={menu,covers,date,result};
      renderDraft();
    }

    function renderDraft(){
      const host=document.getElementById('prepOutput'); if(!host||!draft)return;
      const assignmentOptions=staff.map(n=>`<option value="${escv(n)}">${escv(n)}</option>`).join('');
      const jobs=draft.result.jobs.map(j=>`<div class="card mt"><div class="card-head"><div><h3>${escv(j.recipeName)}</h3><small>${j.portions} portions</small></div><label style="min-width:180px">Assign to<select class="draftAssign" data-id="${escv(j.id)}"><option value="">Unassigned</option>${assignmentOptions}</select></label></div><div class="rows">${j.ingredients.map(i=>`<div class="row"><span></span><div><b>${escv(i.name)}</b><br><small>${escv(i.qty)} ${escv(i.unit)}</small></div></div>`).join('')}</div>${j.method?`<details class="mt"><summary>Method</summary><p>${escv(j.method)}</p></details>`:''}</div>`).join('');
      const orderRows=draft.result.order.map(i=>`<tr><td>${escv(i.name)}</td><td>${escv(i.required)} ${escv(i.unit)}</td><td><input class="orderStock" data-key="${escv(i.key)}" type="number" min="0" step="0.01" value="${escv(i.inStock)}"></td><td><b>${escv(i.toBuy)} ${escv(i.unit)}</b></td></tr>`).join('');
      host.innerHTML=`<div class="card mt"><div class="card-head"><div><h2>Prep list</h2><p class="muted">${escv(draft.menu.name)} · ${draft.covers} covers · ${escv(draft.date)}</p></div></div>${jobs}</div><div class="card mt"><div class="card-head"><div><h2>Order list</h2><p class="muted">Leave stock at zero when nothing is in stock. Entering stock only reduces what must be ordered.</p></div></div><div class="twrap"><table class="tbl"><thead><tr><th>Ingredient</th><th>Required</th><th>In stock</th><th>Order</th></tr></thead><tbody>${orderRows}</tbody></table></div><div class="btn-row mt"><button class="btn ghost" id="orderRecalc">Recalculate order</button><button class="btn" id="savePrepOrder">Save prep and order lists</button></div></div>`;
      document.getElementById('orderRecalc').onclick=recalculate;
      document.getElementById('savePrepOrder').onclick=saveLists;
    }

    function recalculate(){
      const stock={};document.querySelectorAll('.orderStock').forEach(i=>stock[i.dataset.key]=i.value);
      const assigned={};document.querySelectorAll('.draftAssign').forEach(s=>assigned[s.dataset.id]=s.value);
      draft.result=build(draft.menu,draft.covers,stock);
      draft.result.jobs.forEach(j=>j.assignedTo=assigned[j.id]||'');
      renderDraft();
    }

    async function saveLists(){
      const stock={};document.querySelectorAll('.orderStock').forEach(i=>stock[i.dataset.key]=i.value);
      const assigned={};document.querySelectorAll('.draftAssign').forEach(s=>assigned[s.dataset.id]=s.value);
      draft.result=build(draft.menu,draft.covers,stock);
      draft.result.jobs.forEach(j=>j.assignedTo=assigned[j.id]||'');
      const createdAt=new Date().toISOString();
      const plan={id:uid(),menuId:draft.menu.id,menuName:draft.menu.name,date:draft.date,covers:draft.covers,items:draft.result.jobs,status:'open',createdAt,source:'menu-driven-prep'};
      const list={id:uid(),prepPlanId:plan.id,menuId:draft.menu.id,menuName:draft.menu.name,date:draft.date,covers:draft.covers,items:draft.result.order,createdAt,source:'menu-driven-order'};
      state.prepPlans=Array.isArray(state.prepPlans)?state.prepPlans:[];state.shoppingLists=Array.isArray(state.shoppingLists)?state.shoppingLists:[];
      state.prepPlans.push(plan);state.shoppingLists.push(list);save();
      if(typeof audit==='function')try{await audit('create','prep-and-order',{menu:plan.menuName,covers:plan.covers});}catch(_){ }
      renderSaved(plan,list);
      if(typeof toast==='function')toast('Prep list and order list saved','ok');
    }

    function renderSaved(plan,list){
      const host=document.getElementById('prepOutput');if(!host)return;
      const jobs=(plan.items||[]).map(j=>`<div class="row"><span></span><div><b>${escv(j.recipeName)}</b><br><small>${j.portions} portions${j.assignedTo?' · '+escv(j.assignedTo):' · Unassigned'}</small></div></div>`).join('');
      const order=(list.items||[]).filter(i=>i.toBuy>0).map(i=>`<tr><td>${escv(i.name)}</td><td>${escv(i.toBuy)}</td><td>${escv(i.unit)}</td></tr>`).join('');
      host.innerHTML=`<div class="card mt"><h2>Saved prep list</h2><div class="rows">${jobs}</div></div><div class="card mt"><div class="card-head"><h2>Saved order list</h2><button class="btn" onclick="downloadOrderList('${escv(list.id)}')">Download CSV</button></div><div class="twrap"><table class="tbl"><thead><tr><th>Ingredient</th><th>Order</th><th>Unit</th></tr></thead><tbody>${order||'<tr><td colspan="3">Nothing to order</td></tr>'}</tbody></table></div></div>`;
    }

    window.openSavedPrep=function(id){const p=(state.prepPlans||[]).find(x=>String(x.id)===String(id));if(!p)return;const l=(state.shoppingLists||[]).find(x=>String(x.prepPlanId)===String(id));if(l)renderSaved(p,l);};
    window.downloadOrderList=function(id){const l=(state.shoppingLists||[]).find(x=>String(x.id)===String(id));if(!l)return;const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const rows=[['Ingredient','Order','Unit'],...(l.items||[]).filter(i=>i.toBuy>0).map(i=>[i.name,i.toBuy,i.unit])];const blob=new Blob([rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=((l.menuName||'order-list')+'-'+(l.date||'')).replace(/[^a-z0-9_-]+/gi,'-')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),500);};

    if(typeof VIEWS!=='undefined'){VIEWS.prep=mainView;VIEWS.prepLists=mainView;VIEWS.preplists=mainView;}
    document.addEventListener('click',function(e){const el=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');if(!el)return;const t=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase(),d=String((el.dataset&&(el.dataset.route||el.dataset.view||el.dataset.tab))||'').toLowerCase();if(t.includes('prep list')||d.includes('prep')){e.preventDefault();e.stopImmediatePropagation();mainView();}},true);
    window.openPrepLists=mainView;
  }
  boot();
})();
