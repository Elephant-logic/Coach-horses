(function(){
  function boot(){
    if(typeof state==='undefined'||typeof modal!=='function') return setTimeout(boot,150);
    if(window.__menuRecipeSelectorFixV1) return;
    window.__menuRecipeSelectorFixV1=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();

    function recipesFor(menu){
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      if(ids.length) return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
      return [].concat(menu&&menu.recipes||[],menu&&menu.items||[],menu&&menu.dishes||[]).map(x=>{
        if(typeof x!=='string') return x;
        return (state.recipes||[]).find(r=>String(r.id)===x||norm(r.name)===norm(x));
      }).filter(Boolean);
    }

    function openSelectedRecipe(id){
      const recipe=(state.recipes||[]).find(r=>String(r.id)===String(id));
      if(!recipe){ if(typeof toast==='function') toast('Recipe not found','bad'); return; }
      if(typeof closeModal==='function') closeModal();
      setTimeout(()=>{
        if(typeof window.recipeForm==='function') return window.recipeForm(recipe.id);
        if(typeof window.openRecipe==='function') return window.openRecipe(recipe.id);
        if(typeof toast==='function') toast('Recipe editor is unavailable','bad');
      },50);
    }

    window.workflowOpenRecipe=openSelectedRecipe;

    window.openWorkflowMenu=function(id){
      const menu=(state.menus||[]).find(m=>String(m.id)===String(id));
      if(!menu){ if(typeof toast==='function') toast('Menu not found','bad'); return; }
      const recipes=recipesFor(menu);
      const rows=recipes.map((r,index)=>`<div class="card" style="padding:12px;margin:8px 0">
        <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap">
          <div style="min-width:0;flex:1"><b>${index+1}. ${escv(r.name||'Untitled recipe')}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portions${r.needsVerification?' · VERIFY':''}</small></div>
          <button class="btn sm" type="button" data-open-menu-recipe="${escv(r.id)}">Edit this recipe</button>
        </div>
      </div>`).join('');
      modal(`<h2>${escv(menu.name||'Menu')}</h2>
        <p class="muted">Choose any dish below. Every dish is stored as its own editable recipe in the recipe library.</p>
        <div id="workflowMenuRecipeList">${rows||'<p>No dishes attached.</p>'}</div>
        <div class="btn-row mt"><button class="btn ghost" type="button" id="workflowEditMenuDishes">Add or remove dishes</button></div>`);
      const list=document.getElementById('workflowMenuRecipeList');
      if(list) list.addEventListener('click',e=>{
        const button=e.target.closest('[data-open-menu-recipe]');
        if(!button) return;
        e.preventDefault();e.stopPropagation();
        openSelectedRecipe(button.getAttribute('data-open-menu-recipe'));
      });
      const edit=document.getElementById('workflowEditMenuDishes');
      if(edit) edit.onclick=()=>{ if(typeof closeModal==='function') closeModal(); setTimeout(()=>window.menuWorkflowBuilder&&window.menuWorkflowBuilder(menu.id),50); };
    };
  }
  boot();
})();