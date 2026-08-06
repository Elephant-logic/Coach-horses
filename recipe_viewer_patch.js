(function(){
  function boot(){
    if(typeof state==='undefined'||typeof modal!=='function') return setTimeout(boot,150);
    if(window.__recipeViewerPatchV1) return;
    window.__recipeViewerPatchV1=true;

    const escv=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();
    const getRecipe=id=>(state.recipes||[]).find(r=>String(r.id)===String(id));
    const recipesFor=menu=>{
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
    };

    window.viewRecipeOnly=function(id){
      const r=getRecipe(id);
      if(!r){ if(typeof toast==='function') toast('Recipe not found','bad'); return; }
      const ingredients=(Array.isArray(r.ingredients)?r.ingredients:[]).map(i=>{
        if(typeof i==='string') return `<li>${escv(i)}</li>`;
        const qty=i.qty??i.quantity??'';
        return `<li>${escv(qty)} ${escv(i.unit||'')} ${escv(i.name||'Ingredient')}</li>`;
      }).join('');
      const method=Array.isArray(r.method)?r.method.join('\n'):String(r.method||'');
      modal(`<h2>${escv(r.name||'Recipe')}</h2>
        <div class="card" style="padding:12px"><b>${escv(r.course||r.category||'Other')}</b><br><small>${Number(r.portions||r.yield||10)} portions${r.needsVerification?' · VERIFY':''}</small></div>
        <h3>Ingredients</h3><ul>${ingredients||'<li>No ingredients entered.</li>'}</ul>
        <h3>Method</h3><div style="white-space:pre-wrap">${escv(method||'No method entered.')}</div>
        <h3>Allergens</h3><p>${escv(r.allergens||'Not entered')}</p>
        <div class="btn-row mt"><button class="btn" type="button" id="recipeViewerEdit">Edit recipe</button><button class="btn ghost" type="button" onclick="closeModal()">Close</button></div>`);
      const edit=document.getElementById('recipeViewerEdit');
      if(edit) edit.onclick=()=>{
        closeModal();
        if(typeof window.recipeForm==='function') window.recipeForm(r.id);
        else if(typeof window.openRecipe==='function') window.openRecipe(r.id);
        else if(typeof toast==='function') toast('Recipe editor unavailable','bad');
      };
    };

    window.openWorkflowMenu=function(id){
      const menu=(state.menus||[]).find(m=>String(m.id)===String(id));
      if(!menu) return;
      const recipes=recipesFor(menu);
      const rows=recipes.map(r=>`<div class="row" data-view-recipe-row="${escv(r.id)}"><span></span><div><b>${escv(r.name||'Recipe')}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portions${r.needsVerification?' · VERIFY':''}</small></div><button class="btn sm" type="button" data-view-recipe="${escv(r.id)}">View recipe</button></div>`).join('');
      modal(`<h2>${escv(menu.name||'Menu')}</h2><p class="muted">Choose any dish to view its recipe. Recipes are stored separately from the menu.</p><div class="rows">${rows||'<p>No dishes attached.</p>'}</div><div class="btn-row mt"><button class="btn ghost" type="button" id="menuEditDishes">Add or remove dishes</button></div>`);
      document.querySelectorAll('[data-view-recipe]').forEach(btn=>{
        btn.onclick=e=>{e.preventDefault();e.stopPropagation();window.viewRecipeOnly(btn.dataset.viewRecipe);};
      });
      const edit=document.getElementById('menuEditDishes');
      if(edit) edit.onclick=()=>{closeModal(); if(typeof window.menuWorkflowBuilder==='function') window.menuWorkflowBuilder(menu.id);};
    };

    function repairRecipeButtons(){
      document.querySelectorAll('button').forEach(btn=>{
        const text=norm(btn.textContent);
        if(text!=='open recipe'&&text!=='edit this recipe') return;
        const row=btn.closest('.row');
        if(!row) return;
        const name=(row.querySelector('b,strong')?.textContent||'').trim();
        const recipe=(state.recipes||[]).find(r=>norm(r.name)===norm(name));
        if(!recipe) return;
        btn.textContent='View recipe';
        btn.onclick=e=>{e.preventDefault();e.stopPropagation();window.viewRecipeOnly(recipe.id);};
      });
    }
    new MutationObserver(repairRecipeButtons).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(repairRecipeButtons,600);
    repairRecipeButtons();
  }
  boot();
})();