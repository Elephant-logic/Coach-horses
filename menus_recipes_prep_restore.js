(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof modal!=='function'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__menusRecipesPrepRestoreV2) return;
    window.__menusRecipesPrepRestoreV2=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const recipesFor=menu=>{
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
    };

    window.viewStoredRecipe=function(id){
      if(typeof window.viewRecipeOnly==='function') return window.viewRecipeOnly(id);
      if(typeof window.recipeForm==='function') return window.recipeForm(id);
      if(typeof toast==='function') toast('Recipe viewer unavailable','bad');
    };
    window.editStoredRecipe=function(id){
      if(typeof window.recipeForm==='function') return window.recipeForm(id);
      if(typeof window.openRecipe==='function') return window.openRecipe(id);
      if(typeof toast==='function') toast('Recipe editor unavailable','bad');
    };

    window.openSavedMenuDirect=function(id){
      const menu=(state.menus||[]).find(m=>String(m.id)===String(id));
      if(!menu) return typeof toast==='function'&&toast('Menu not found','bad');
      const rows=recipesFor(menu).map(r=>`<div class="row"><span></span><div><b>${escv(r.name||'Recipe')}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portions</small></div><div class="btn-row"><button class="btn sm" type="button" data-view-recipe="${escv(r.id)}">View recipe</button><button class="btn sm ghost" type="button" data-edit-recipe="${escv(r.id)}">Edit recipe</button></div></div>`).join('');
      modal(`<h2>${escv(menu.name||'Menu')}</h2><p class="muted">This menu links to the separately stored recipes below.</p><div class="rows">${rows||'<p>No recipes are linked to this menu.</p>'}</div><div class="btn-row mt"><button class="btn ghost" type="button" id="directEditMenu">Edit dishes</button><button class="btn bad" type="button" id="directDeleteMenu">Delete this menu</button></div>`);
      document.querySelectorAll('[data-view-recipe]').forEach(b=>b.onclick=()=>window.viewStoredRecipe(b.dataset.viewRecipe));
      document.querySelectorAll('[data-edit-recipe]').forEach(b=>b.onclick=()=>window.editStoredRecipe(b.dataset.editRecipe));
      const edit=document.getElementById('directEditMenu');
      if(edit) edit.onclick=()=>{closeModal();if(typeof window.menuWorkflowBuilder==='function')window.menuWorkflowBuilder(menu.id);};
      const del=document.getElementById('directDeleteMenu');
      if(del) del.onclick=()=>window.deleteSavedMenuDirect(menu.id);
    };

    window.deleteSavedMenuDirect=function(id){
      const menu=(state.menus||[]).find(m=>String(m.id)===String(id));
      if(!menu) return;
      if(!confirm('Delete menu “'+(menu.name||'Menu')+'”? The separate recipes will be kept.')) return;
      state.menus=(state.menus||[]).filter(m=>String(m.id)!==String(id));
      Promise.resolve(save()).then(()=>{
        if(typeof closeModal==='function') closeModal();
        if(typeof toast==='function') toast('Menu deleted. Recipes were kept.','ok');
        menusAndRecipesView();
      });
    };

    function menusAndRecipesView(){
      const menus=(state.menus||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      const recipes=(state.recipes||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      const menuRows=menus.map(m=>`<div class="row"><span></span><div><b>${escv(m.name||'Menu')}</b><br><small>${recipesFor(m).length} linked recipes${m.pageCount?' · '+m.pageCount+' pages':''}</small></div><div class="btn-row"><button class="btn sm" type="button" data-open-menu="${escv(m.id)}">Open menu</button><button class="btn sm ghost" type="button" data-edit-menu="${escv(m.id)}">Edit menu</button><button class="btn sm bad" type="button" data-delete-menu="${escv(m.id)}">Delete</button></div></div>`).join('');
      const recipeRows=recipes.map(r=>`<div class="row"><span></span><div><b>${escv(r.name||'Recipe')}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portion base recipe${r.needsVerification?' · VERIFY':''}</small></div><div class="btn-row"><button class="btn sm" type="button" data-view-stored="${escv(r.id)}">View</button><button class="btn sm ghost" type="button" data-edit-stored="${escv(r.id)}">Edit</button></div></div>`).join('');
      page('Menus & Recipes','Menus choose which separately stored recipes are used. Recipes can be viewed and edited without opening a menu.',
        `<div class="card"><div class="card-head"><h2>Menu tools</h2><div class="btn-row"><button class="btn" type="button" id="directUploadMenu">Upload menu photos</button><button class="btn ghost" type="button" id="directCreateMenu">Create menu</button></div></div></div>
         <div class="card mt"><h2>Saved menus</h2><p class="muted">Delete a bad menu here and upload it again. Deleting a menu does not delete its separate recipes.</p><div class="rows">${menuRows||'<p class="muted">No menus saved.</p>'}</div></div>
         <div class="card mt"><h2>Recipe library</h2><p class="muted">These recipes are stored separately and can be viewed or edited.</p><div class="rows">${recipeRows||'<p class="muted">No recipes saved.</p>'}</div></div>`);
      document.querySelectorAll('[data-open-menu]').forEach(b=>b.onclick=()=>window.openSavedMenuDirect(b.dataset.openMenu));
      document.querySelectorAll('[data-edit-menu]').forEach(b=>b.onclick=()=>typeof window.menuWorkflowBuilder==='function'&&window.menuWorkflowBuilder(b.dataset.editMenu));
      document.querySelectorAll('[data-delete-menu]').forEach(b=>b.onclick=()=>window.deleteSavedMenuDirect(b.dataset.deleteMenu));
      document.querySelectorAll('[data-view-stored]').forEach(b=>b.onclick=()=>window.viewStoredRecipe(b.dataset.viewStored));
      document.querySelectorAll('[data-edit-stored]').forEach(b=>b.onclick=()=>window.editStoredRecipe(b.dataset.editStored));
      const up=document.getElementById('directUploadMenu');if(up)up.onclick=()=>window.importWorkflowMenuPhotos();
      const create=document.getElementById('directCreateMenu');if(create)create.onclick=()=>window.menuWorkflowBuilder();
    }

    VIEWS.menus=menusAndRecipesView;
  }
  boot();
})();