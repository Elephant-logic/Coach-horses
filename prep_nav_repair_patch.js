(function(){
  function boot(){
    if(typeof page!=='function'||typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__prepNavRepairPatchV3) return;
    window.__prepNavRepairPatchV3=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
    const round=n=>Math.round((Number(n)||0)*100)/100;
    const staff=()=>['Keith Davies','Ian Park','Harry Duckworth'];
    let current=null;

    function menuRecipes(menu){
      const ids=Array.isArray(menu&&menu.recipeIds)?menu.recipeIds.map(String):[];
      if(ids.length) return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
      const embedded=[].concat(menu&&menu.recipes||[],menu&&menu.items||[],menu&&menu.dishes||[]);
      return embedded.map(x=>typeof x==='string'?(state.recipes||[]).find(r=>String(r.id)===x||norm(r.name)===norm(x)):x).filter(Boolean);
    }

    function calculate(menu,covers,counts={}){
      const prep=[],shopping=new Map();
      for(const r of menuRecipes(menu)){
        const factor=covers/Math.max(1,num(r.portions||r.yield)||10);
        const ingredients=(r.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:0,unit:''}:i).filter(i=>i&&i.name);
        prep.push({id:uid(),recipeId:r.id,recipeName:r.name||'Untitled dish',portions:covers,assignedTo:'',status:'open',method:r.method||'',ingredients:ingredients.map(i=>({name:i.name,qty:round(num(i.qty||i.quantity)*factor),unit:i.unit||''}))});
        for(const i of ingredients){
          const name=String(i.name||'').trim(),unit=String(i.unit||'').trim(),key=norm(name)+'|'+norm(unit);
          const required=round(num(i.qty||i.quantity)*factor),old=shopping.get(key)||{key,name,unit,required:0,inStock:0,toBuy:0};
          old.required=round(old.required+required); shopping.set(key,old);
        }
      }
      for(const item of shopping.values()){
        item.inStock=Math.max(0,num(counts[item.key]));
        item.toBuy=round(Math.max(0,item.required-item.inStock));
      }
      return {prep,shopping:[...shopping.values()]};
    }

    function prepView(){
      const menus=Array.isArray(state.menus)?state.menus:[];
      const menuOptions=menus.map(m=>`<option value="${escv(m.id)}">${escv(m.name||'Saved menu')}</option>`).join('');
      const plans=Array.isArray(state.prepPlans)?state.prepPlans:[];
      const planHtml=plans.length?plans.slice().reverse().map(p=>`<div class="row"><span></span><div><b>${escv(p.menuName||'Prep plan')}</b><br><small>${escv(p.date||'')} · ${Number(p.covers||0)} covers · ${(p.items||[]).length} jobs</small></div></div>`).join(''):'<p class="muted">No live prep plans.</p>';
      page('Prep Lists','Count what is ready, forecast demand and assign only the work that is needed.',`
        <div class="card"><h2>Morning production check</h2><p class="muted">Build today’s prep from actual stock.</p>
          <div class="form">
            <label>Saved menu<select id="prepMenu"><option value="">Select a menu</option>${menuOptions}</select></label>
            <label>Service date<input id="prepDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
            <label>Projected covers<input id="prepCovers" type="number" min="1" value="40"></label>
            <label>Forecast basis<input id="prepBasis" value="On-book bookings and expected walk-ins"></label>
            <button class="btn" id="prepLoad" type="button">Load menu and count prepared stock</button>
          </div>
        </div>
        <div id="prepWork"></div>
        <div class="card mt"><h2>Live prep plans</h2><div class="rows">${planHtml}</div></div>`);
      setTimeout(bindBase,0);
    }

    function bindBase(){
      const b=document.getElementById('prepLoad'); if(!b) return;
      b.onclick=()=>{
        const menuId=String(document.getElementById('prepMenu').value||''),menu=(state.menus||[]).find(m=>String(m.id)===menuId);
        if(!menu) return typeof toast==='function'&&toast('Select a saved menu first','bad');
        const covers=Math.max(1,Math.round(num(document.getElementById('prepCovers').value)||1));
        const date=document.getElementById('prepDate').value||new Date().toISOString().slice(0,10);
        current={menu,covers,date,basis:document.getElementById('prepBasis').value||'',result:calculate(menu,covers,{})};
        renderCount();
      };
    }

    function renderCount(){
      const host=document.getElementById('prepWork'); if(!host||!current) return;
      const rows=current.result.shopping.map(i=>`<tr><td>${escv(i.name)}</td><td>${escv(i.required)} ${escv(i.unit)}</td><td><input class="prepCount" data-key="${escv(i.key)}" type="number" min="0" step="0.01" value="${escv(i.inStock||0)}"></td><td><b>${escv(i.toBuy)} ${escv(i.unit)}</b></td></tr>`).join('');
      host.innerHTML=`<div class="card mt"><h2>Coach — stock check</h2><p class="muted">Change the usable amounts to match what is physically ready. Zero means none in stock.</p><div class="twrap"><table class="tbl"><thead><tr><th>Recipe / product</th><th>System requirement</th><th>Usable counted</th><th>To make / buy</th></tr></thead><tbody>${rows}</tbody></table></div><div class="btn-row mt"><button class="btn ghost" id="prepRecalc">Recalculate</button><button class="btn" id="prepConfirm">Confirm count and create jobs</button></div></div>`;
      document.getElementById('prepRecalc').onclick=recalc;
      document.getElementById('prepConfirm').onclick=createPlan;
    }

    function recalc(){
      const counts={}; document.querySelectorAll('.prepCount').forEach(i=>counts[i.dataset.key]=i.value);
      current.result=calculate(current.menu,current.covers,counts); renderCount();
    }

    async function createPlan(){
      recalc();
      const plan={id:uid(),menuId:current.menu.id,menuName:current.menu.name,date:current.date,covers:current.covers,basis:current.basis,items:current.result.prep,status:'open',createdAt:new Date().toISOString(),source:'prep-lists'};
      const list={id:uid(),prepPlanId:plan.id,menuId:current.menu.id,menuName:current.menu.name,date:current.date,covers:current.covers,items:current.result.shopping,createdAt:new Date().toISOString()};
      state.prepPlans=Array.isArray(state.prepPlans)?state.prepPlans:[]; state.shoppingLists=Array.isArray(state.shoppingLists)?state.shoppingLists:[];
      state.prepPlans.push(plan); state.shoppingLists.push(list); save();
      if(typeof audit==='function') try{await audit('create','prep-plan',{menu:plan.menuName,covers:plan.covers});}catch(_){ }
      renderPlan(plan,list);
      if(typeof toast==='function') toast('Prep jobs and shopping list created','ok');
    }

    function renderPlan(plan,list){
      const host=document.getElementById('prepWork');
      const opts=staff().map(n=>`<option value="${escv(n)}">${escv(n)}</option>`).join('');
      const jobs=(plan.items||[]).map(j=>`<div class="card mt"><div class="card-head"><div><h3>${escv(j.recipeName)}</h3><small>${j.portions} portions</small></div><label>Assign to<select onchange="assignPrep('${plan.id}','${j.id}',this.value)"><option value="">Unassigned</option>${opts}</select></label></div>${j.method?`<details><summary>Method</summary><p>${escv(j.method)}</p></details>`:''}</div>`).join('');
      const shop=(list.items||[]).filter(i=>i.toBuy>0).map(i=>`<tr><td>${escv(i.name)}</td><td>${escv(i.toBuy)}</td><td>${escv(i.unit)}</td></tr>`).join('');
      host.innerHTML=`<div class="card mt"><div class="card-head"><div><h2>Production plan</h2><p class="muted">${escv(plan.menuName)} · ${plan.covers} covers · ${escv(plan.date)}</p></div></div>${jobs}</div><div class="card mt"><div class="card-head"><h2>Shopping list</h2><button class="btn" onclick="downloadPrepShopping('${list.id}')">Download CSV</button></div><div class="twrap"><table class="tbl"><thead><tr><th>Ingredient</th><th>Buy</th><th>Unit</th></tr></thead><tbody>${shop||'<tr><td colspan="3">Nothing to buy</td></tr>'}</tbody></table></div></div>`;
    }

    window.assignPrep=function(planId,itemId,name){const p=(state.prepPlans||[]).find(x=>String(x.id)===String(planId));const j=p&&(p.items||[]).find(x=>String(x.id)===String(itemId));if(j){j.assignedTo=name;j.assignedAt=new Date().toISOString();save();}};
    window.downloadPrepShopping=function(id){const l=(state.shoppingLists||[]).find(x=>String(x.id)===String(id));if(!l)return;const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const rows=[['Ingredient','To buy','Unit'],...(l.items||[]).filter(i=>i.toBuy>0).map(i=>[i.name,i.toBuy,i.unit])];const blob=new Blob([rows.map(r=>r.map(q).join(',')).join('\r\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='shopping-'+(l.date||'list')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);};

    if(typeof VIEWS!=='undefined'){VIEWS.prep=prepView;VIEWS.prepLists=prepView;VIEWS.preplists=prepView;}
    document.addEventListener('click',function(e){const el=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');if(!el)return;const t=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase(),d=String((el.dataset&&(el.dataset.route||el.dataset.view||el.dataset.tab))||'').toLowerCase();if(t.includes('prep list')||d.includes('prep')){e.preventDefault();e.stopImmediatePropagation();prepView();}},true);
    window.openPrepLists=prepView;
  }
  boot();
})();
