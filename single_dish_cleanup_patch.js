(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__singleDishCleanupPatch) return;
    window.__singleDishCleanupPatch=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const arraysFor=m=>[
      Array.isArray(m&&m.recipeIds)?m.recipeIds:[],
      Array.isArray(m&&m.recipes)?m.recipes:[],
      Array.isArray(m&&m.items)?m.items:[],
      Array.isArray(m&&m.dishes)?m.dishes:[],
      Array.isArray(m&&m.content&&m.content.dishes)?m.content.dishes:[]
    ];
    const dishCount=m=>Math.max(0,...arraysFor(m).map(a=>a.length));
    const menuName=m=>String((m&& (m.name||m.title||m.menuName))||'').trim();
    const matchingRecipe=m=>(state.recipes||[]).find(r=>norm(r.name||r.title)===norm(menuName(m)));

    function clean(){
      state.menus=Array.isArray(state.menus)?state.menus:[];
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      const before=state.menus.length;
      state.menus=state.menus.filter(m=>{
        const count=dishCount(m);
        const sameRecipe=matchingRecipe(m);
        // A menu must contain at least two dishes. A single item, an empty AI
        // record matching a recipe, or a dish-only record belongs in Recipes.
        if(count>=2) return true;
        if(sameRecipe) return false;
        if(count===1) return false;
        const c=m&&m.content||{};
        if(c.recipe||c.ingredients||c.method) return false;
        return true;
      });
      if(state.menus.length!==before){
        if(typeof audit==='function') audit('cleanup','menu',{message:'Removed single-dish records from menus'});
        save();
        if(typeof render==='function') render();
      }
    }

    // Prevent the UI from displaying invalid one-dish menus even before save finishes.
    const oldMenusView=window.VIEWS&&VIEWS.menus;
    if(window.VIEWS&&typeof oldMenusView==='function'){
      VIEWS.menus=function(){ clean(); return oldMenusView.apply(this,arguments); };
    }

    clean();
    setInterval(clean,1000);
  }
  boot();
})();
