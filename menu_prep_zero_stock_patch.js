(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__menuPrepZeroStockPatchV2) return;
    window.__menuPrepZeroStockPatchV2=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const round=n=>Math.round((Number(n)||0)*100)/100;
    const csv=v=>'"'+String(v??'').replace(/"/g,'""')+'"';

    function staffNames(){
      const names=['Keith Davies','Ian Park','Harry Duckworth'];
      for(const list of [state.users,state.staff,state.team]) for(const u of (Array.isArray(list)?list:[])){
        const n=String((u&& (u.name||u.fullName||u.username))||'').trim(); if(n&&!names.includes(n)) names.push(n);
      }
      return names;
    }
    function findForm(){
      const heading=[...document.querySelectorAll('h1,h2,h3,h4')].find(x=>/morning production check|build today.?s prep/i.test(x.textContent||''));
      return heading&&(heading.closest('form')||heading.closest('.card'));
    }
    function selectedMenu(box){
      const sel=box&&box.querySelector('select'); if(!sel) return null;
      const value=String(sel.value||''),label=String(sel.options&&sel.selectedIndex>=0?sel.options[sel.selectedIndex].textContent:'').trim();
      return (state.menus||[]).find(m=>String(m.id)===value)||(state.menus||[]).find(m=>norm(m.name)===norm(label))||null;
    }
    function covers(box){
      const inputs=[...(box?box.querySelectorAll('input'):[])];
      const i=inputs.find(x=>/cover/i.test((x.closest('label')&&x.closest('label').textContent)||x.name||x.placeholder||''));
      return Math.max(1,Math.round(num(i&&i.value)||1));
    }
    function serviceDate(box){const d=box&&box.querySelector('input[type="date"]');return d&&d.value||new Date().toISOString().slice(0,10);}
    function menuRecipes(menu){
      const ids=Array.isArray(menu&&menu.recipeIds)?menu.recipeIds.map(String):[];
      if(ids.length) return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
      const embedded=[].concat(menu&&menu.recipes||[],menu&&menu.items||[],menu&&menu.dishes||[],menu&&menu.content&&menu.content.dishes||[]);
      return embedded.map(x=>typeof x==='string'?(state.recipes||[]).find(r=>String(r.id)===x||norm(r.name)===norm(x)):x).filter(Boolean);
    }
    function build(menu,coverCount){
      const recipes=menuRecipes(menu),shopping=new Map(),prep=[];
      for(const r of recipes){
        const factor=coverCount/Math.max(1,num(r.portions||r.yield)||10);
        const ingredients=(r.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:0,unit:''}:i).filter(i=>i&&i.name);
        prep.push({id:uid(),recipeId:r.id,recipeName:r.name||'Untitled dish',portions:coverCount,method:r.method||'',assignedTo:'',status:'open',ingredients:ingredients.map(i=>({name:i.name,qty:round(num(i.qty||i.quantity)*factor),unit:i.unit||''}))});
        for(const i of ingredients){
          const name=String(i.name||'').trim(),unit=String(i.unit||'').trim(),key=norm(name)+'|'+norm(unit),required=round(num(i.qty||i.quantity)*factor);
          const old=shopping.get(key)||{name,unit,required:0,inStock:0,toBuy:0}; old.required=round(old.required+required); old.toBuy=old.required; shopping.set(key,old);
        }
      }
      return {recipes,prep,shopping:[...shopping.values()]};
    }
    function downloadShopping(list){
      const rows=[['Ingredient','Required','Unit','In stock','To buy'],...(list.items||[]).map(i=>[i.name,i.required,i.unit,i.inStock||0,i.toBuy])];
      const text=rows.map(r=>r.map(csv).join(',')).join('\r\n');
      const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
      a.href=URL.createObjectURL(blob); a.download=((list.menuName||'shopping-list')+'-'+(list.date||'')).replace(/[^a-z0-9_-]+/gi,'-')+'.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
    }
    window.downloadShoppingList=id=>{const l=(state.shoppingLists||[]).find(x=>String(x.id)===String(id));if(l) downloadShopping(l);};
    window.assignPrepJob=async function(planId,itemId,name){
      const p=(state.prepPlans||[]).find(x=>String(x.id)===String(planId)); if(!p) return;
      const item=(p.items||[]).find(x=>String(x.id)===String(itemId)); if(!item) return;
      item.assignedTo=String(name||''); item.assignedAt=new Date().toISOString();
      if(typeof audit==='function') await audit('assign','prep-job',{planId,itemId,recipe:item.recipeName,assignedTo:item.assignedTo});
      save(); if(typeof toast==='function') toast(item.assignedTo?item.recipeName+' assigned to '+item.assignedTo:'Assignment cleared','ok');
    };
    function renderResult(box,menu,coverCount,date,result,plan,list){
      let host=document.getElementById('zeroStockPlanOutput');
      if(!host){host=document.createElement('div');host.id='zeroStockPlanOutput';(box.closest('main')||box.parentElement||document.body).appendChild(host);}
      const options=staffNames().map(n=>`<option value="${escv(n)}">${escv(n)}</option>`).join('');
      const prepHtml=result.prep.map(p=>`<div class="card mt"><div class="card-head"><div><h3>${escv(p.recipeName)} — ${coverCount} portions</h3></div><label style="min-width:180px">Assign to<select onchange="assignPrepJob('${plan.id}','${p.id}',this.value)"><option value="">Unassigned</option>${options}</select></label></div><div class="rows">${p.ingredients.map(i=>`<div class="row"><span></span><div><b>${escv(i.name)}</b><br><small>${escv(i.qty)} ${escv(i.unit)}</small></div></div>`).join('')}</div>${p.method?`<details class="mt"><summary>Method</summary><div style="white-space:pre-wrap;margin-top:8px">${escv(p.method)}</div></details>`:''}</div>`).join('');
      const shopHtml=result.shopping.map(i=>`<tr><td>${escv(i.name)}</td><td>${escv(i.required)} ${escv(i.unit)}</td><td>0 ${escv(i.unit)}</td><td><b>${escv(i.toBuy)} ${escv(i.unit)}</b></td></tr>`).join('');
      host.innerHTML=`<div class="card mt"><div class="card-head"><div><h2>Production plan</h2><p class="muted">${escv(menu.name||'Menu')} · ${coverCount} covers · ${escv(date)}</p></div></div>${prepHtml||'<p class="muted">No recipes are attached to this menu.</p>'}</div><div class="card mt"><div class="card-head"><div><h2>Shopping list</h2><p class="muted">No stock count means zero stock. Any later count only reduces the quantities to buy.</p></div><button class="btn" onclick="downloadShoppingList('${list.id}')">Download CSV</button></div>${shopHtml?`<div class="twrap"><table class="tbl"><thead><tr><th>Ingredient</th><th>Required</th><th>In stock</th><th>Buy</th></tr></thead><tbody>${shopHtml}</tbody></table></div>`:'<p class="muted">No ingredients found.</p>'}</div>`;
      host.scrollIntoView({behavior:'smooth',block:'start'});
    }
    async function createPlan(e){
      const box=findForm(); if(!box) return; const menu=selectedMenu(box);
      if(!menu){e&&e.preventDefault();return typeof toast==='function'&&toast('Select a saved menu first','bad');}
      const coverCount=covers(box),date=serviceDate(box),result=build(menu,coverCount);
      if(!result.recipes.length){e&&e.preventDefault();return typeof toast==='function'&&toast('That menu has no recipes attached','bad');}
      e&&e.preventDefault();e&&e.stopImmediatePropagation();
      const createdAt=new Date().toISOString(),plan={id:uid(),menuId:menu.id,menuName:menu.name,date,covers:coverCount,items:result.prep,status:'open',createdAt,source:'menu-zero-stock'};
      const list={id:uid(),prepPlanId:plan.id,menuId:menu.id,menuName:menu.name,date,covers:coverCount,items:result.shopping,createdAt,source:'menu-zero-stock'};
      state.prepPlans=Array.isArray(state.prepPlans)?state.prepPlans:[]; state.shoppingLists=Array.isArray(state.shoppingLists)?state.shoppingLists:[];
      state.prepPlans.push(plan); state.shoppingLists.push(list);
      if(typeof audit==='function') await audit('create','prep-plan',{menu:menu.name,covers:coverCount,zeroStock:true});
      save(); renderResult(box,menu,coverCount,date,result,plan,list); if(typeof toast==='function') toast('Prep plan and shopping list created','ok');
    }
    document.addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;const t=norm(b.textContent);if(/load menu and count prepared stock|confirm count and create jobs|create prep|build prep|generate prep/.test(t))createPlan(e);},true);
  }
  boot();
})();
