(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__menuOwnedRecipesV2) return;
    window.__menuOwnedRecipesV2=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const manager=()=>{try{return typeof me!=='undefined'&&me&&norm(me.role)==='manager';}catch(_){return false;}};
    let reconciling=false;

    function linkedIds(exceptMenuId=''){
      const ids=new Set();
      for(const menu of (Array.isArray(state.menus)?state.menus:[])){
        if(exceptMenuId&&String(menu.id)===String(exceptMenuId)) continue;
        for(const id of (Array.isArray(menu.recipeIds)?menu.recipeIds:[])) ids.add(String(id));
      }
      return ids;
    }

    async function removeUnlinkedRecipes(refresh=false){
      if(reconciling) return;
      const recipes=Array.isArray(state.recipes)?state.recipes:[];
      const keep=linkedIds();
      const filtered=recipes.filter(r=>keep.has(String(r.id)));
      if(filtered.length===recipes.length) return;
      reconciling=true;
      state.recipes=filtered;
      try{await Promise.resolve(save());}finally{reconciling=false;}
      if(refresh){
        if(typeof VIEWS!=='undefined'&&typeof VIEWS.menus==='function') VIEWS.menus();
        else if(typeof render==='function') render();
      }
    }

    window.deleteWorkflowMenu=async function(id){
      if(!manager()) return typeof toast==='function'&&toast('Manager access required','bad');
      const menu=(state.menus||[]).find(m=>String(m.id)===String(id));
      if(!menu) return;
      const recipeIds=(Array.isArray(menu.recipeIds)?menu.recipeIds:[]).map(String);
      if(!confirm('Delete menu “'+(menu.name||'Menu')+'” and its '+recipeIds.length+' linked recipes?')) return;

      const usedElsewhere=linkedIds(id);
      state.menus=(state.menus||[]).filter(m=>String(m.id)!==String(id));
      state.recipes=(state.recipes||[]).filter(r=>!recipeIds.includes(String(r.id))||usedElsewhere.has(String(r.id)));
      await Promise.resolve(save());
      await removeUnlinkedRecipes(false);
      if(typeof toast==='function') toast('Menu and its recipes deleted','ok');
      if(typeof VIEWS!=='undefined'&&typeof VIEWS.menus==='function') VIEWS.menus();
      else if(typeof render==='function') render();
    };

    removeUnlinkedRecipes(true);
    setInterval(()=>removeUnlinkedRecipes(false),1500);
  }
  boot();
})();
