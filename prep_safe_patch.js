(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function') return setTimeout(boot,150);
    if(window.__prepSafePatchV1) return;
    window.__prepSafePatchV1=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0;};
    const norm=v=>String(v||'').trim().toLowerCase();
    const round=n=>Math.round((Number(n)||0)*100)/100;

    function recipesFor(menu){
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (Array.isArray(state.recipes)?state.recipes:[]).filter(r=>ids.includes(String(r.id)));
    }

    function build(){
      try{
        const menuId=String(document.getElementById('safePrepMenu')?.value||'');
        const menu=(Array.isArray(state.menus)?state.menus:[]).find(m=>String(m.id)===menuId);
        if(!menu) return typeof toast==='function'&&toast('Select a saved menu','bad');
        const covers=Math.max(1,Math.round(num(document.getElementById('safePrepCovers')?.value)||1));
        const recipes=recipesFor(menu);
        if(!recipes.length) return typeof toast==='function'&&toast('This menu has no recipes','bad');
        const order=new Map();
        const jobs=[];
        for(const r of recipes){
          const base=Math.max(1,num(r.portions||r.yield)||10);
          const factor=covers/base;
          const ingredients=Array.isArray(r.ingredients)?r.ingredients:[];
          jobs.push(`<div class="row"><span></span><div><b>${escv(r.name||'Recipe')}</b><br><small>${covers} portions</small></div><select><option>Unassigned</option><option>Keith Davies</option><option>Ian Park</option><option>Harry Duckworth</option></select></div>`);
          for(const raw of ingredients){
            const i=typeof raw==='string'?{name:raw,qty:1,unit:'each'}:raw;
            if(!i||!String(i.name||'').trim()) continue;
            const name=String(i.name).trim(),unit=String(i.unit||'each').trim();
            const key=norm(name)+'|'+norm(unit);
            const need=round(Math.max(0,num(i.qty??i.quantity))*factor);
            const row=order.get(key)||{key,name,unit,required:0};
            row.required=round(row.required+need);order.set(key,row);
          }
        }
        const rows=[...order.values()].map(r=>`<tr><td>${escv(r.name)}</td><td>${r.required} ${escv(r.unit)}</td><td><input type="number" min="0" step="0.01" value="0" data-stock="${escv(r.key)}" style="max-width:110px"></td><td data-buy="${escv(r.key)}"><b>${r.required} ${escv(r.unit)}</b></td></tr>`).join('');
        const out=document.getElementById('safePrepOutput');
        out.innerHTML=`<div class="card mt"><h2>Prep jobs</h2><div class="rows">${jobs.join('')}</div></div><div class="card mt"><h2>Order list</h2><p class="muted">Enter stock on hand. Missing stock counts as zero.</p><div style="overflow:auto"><table><thead><tr><th>Ingredient</th><th>Required</th><th>In stock</th><th>Order</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
        out.querySelectorAll('[data-stock]').forEach(input=>input.addEventListener('input',()=>{
          const key=input.dataset.stock,row=order.get(key),have=Math.max(0,num(input.value)),buy=round(Math.max(0,row.required-have));
          const cell=out.querySelector('[data-buy="'+CSS.escape(key)+'"]');if(cell)cell.innerHTML='<b>'+buy+' '+escv(row.unit)+'</b>';
        }));
      }catch(err){
        console.error('Prep build failed',err);
        if(typeof toast==='function') toast('Prep could not open: '+(err.message||'Unknown error'),'bad');
      }
    }

    function prepView(){
      try{
        const menus=Array.isArray(state.menus)?state.menus:[];
        const options=menus.map(m=>`<option value="${escv(m.id)}">${escv(m.name||'Menu')} (${recipesFor(m).length} dishes)</option>`).join('');
        page('Prep Lists','Select a saved menu, enter covers, then compare required ingredients with stock.',`<div class="card"><h2>Build prep and order</h2><div class="form"><label>Saved menu<select id="safePrepMenu"><option value="">Select menu</option>${options}</select></label><label>Projected covers<input id="safePrepCovers" type="number" min="1" value="40"></label><button class="btn" id="safePrepBuild" type="button">Build prep and order list</button></div></div><div id="safePrepOutput"></div>`);
        setTimeout(()=>{const b=document.getElementById('safePrepBuild');if(b)b.onclick=build;},0);
      }catch(err){
        console.error('Prep view failed',err);
        page('Prep Lists','Prep is temporarily unavailable.',`<div class="notice bad"><b>Prep could not load.</b><br>${escv(err.message||'Unknown error')}</div>`);
      }
    }

    VIEWS.prep=prepView;
    VIEWS.prepLists=prepView;
  }
  boot();
})();