(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__menuOwnedRecipesV1) return;
    window.__menuOwnedRecipesV1=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const manager=()=>{try{return typeof me!=='undefined'&&me&&norm(me.role)==='manager';}catch(_){return false;}};

    function linkedIds(exceptMenuId=''){
      const ids=new Set();
      for(const menu of (state.menus||[])){
        if(exceptMenuId&&String(menu.id)===String(exceptMenuId)) continue;
        for(const id of (Array.isArray(menu.recipeIds)?menu.recipeIds:[])) ids.add(String(id));
      }
      return ids;
    }

    function removeUnlinkedRecipes(){
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      const keep=linkedIds();
      const before=state.recipes.length;
      state.recipes=state.recipes.filter(r=>keep.has(String(r.id)));
      if(state.recipes.length!==before){
        save();
        if(typeof render==='function') render();
      }
    }

    window.deleteWorkflowMenu=function(id){
      if(!manager()) return typeof toast==='function'&&toast('Manager access required','bad');
      const menu=(state.menus||[]).find(m=>String(m.id)===String(id));
      if(!menu) return;
      const recipeIds=(Array.isArray(menu.recipeIds)?menu.recipeIds:[]).map(String);
      const message='Delete menu “'+(menu.name||'Menu')+'” and its '+recipeIds.length+' linked recipes?';
      if(!confirm(message)) return;

      const usedElsewhere=linkedIds(id);
      state.menus=(state.menus||[]).filter(m=>String(m.id)!==String(id));
      state.recipes=(state.recipes||[]).filter(r=>!recipeIds.includes(String(r.id))||usedElsewhere.has(String(r.id)));
      save();
      if(typeof toast==='function') toast('Menu and its recipes deleted','ok');
      if(typeof VIEWS!=='undefined'&&typeof VIEWS.menus==='function') VIEWS.menus();
      else if(typeof render==='function') render();
    };

    removeUnlinkedRecipes();
  }
  boot();
})();
