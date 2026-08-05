(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__singleDishCleanupPatchV2) return;
    window.__singleDishCleanupPatchV2=true;

    const norm=v=>String(v==null?'':v).trim().toLowerCase();
    const text=v=>String(v==null?'':v).trim();
    const menuName=m=>text(m&&(m.name||m.title||m.menuName||m.dish||(m.content&&m.content.title)))||'Untitled dish';
    const arraysFor=m=>[
      Array.isArray(m&&m.recipeIds)?m.recipeIds:[],
      Array.isArray(m&&m.recipes)?m.recipes:[],
      Array.isArray(m&&m.items)?m.items:[],
      Array.isArray(m&&m.dishes)?m.dishes:[],
      Array.isArray(m&&m.content&&m.content.dishes)?m.content.dishes:[]
    ];
    const dishCount=m=>Math.max(0,...arraysFor(m).map(a=>a.filter(Boolean).length));

    function ingredientsFrom(m){
      const c=(m&&m.content&&typeof m.content==='object')?m.content:{};
      const r=(c.recipe&&typeof c.recipe==='object')?c.recipe:c;
      const dish=Array.isArray(c.dishes)&&c.dishes.length===1&&typeof c.dishes[0]==='object'?c.dishes[0]:{};
      const raw=m.ingredients||r.ingredients||dish.ingredients||[];
      if(Array.isArray(raw)) return raw.map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:{name:text(x&& (x.name||x.ingredient)),qty:text(x&&(x.qty||x.quantity)),unit:text(x&&x.unit)}).filter(x=>x.name);
      if(typeof raw==='string') return raw.split(/\n|,/).map(x=>({name:text(x),qty:'',unit:''})).filter(x=>x.name);
      return [];
    }

    function ensureRecipe(m){
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      const name=menuName(m);
      let r=state.recipes.find(x=>norm(x.name||x.title)===norm(name));
      const c=(m&&m.content&&typeof m.content==='object')?m.content:{};
      const source=(c.recipe&&typeof c.recipe==='object')?c.recipe:c;
      const dish=Array.isArray(c.dishes)&&c.dishes.length===1&&typeof c.dishes[0]==='object'?c.dishes[0]:{};
      const ing=ingredientsFrom(m);
      const method=text(m.method||source.method||source.instructions||dish.method||dish.description);
      if(!r){
        r={
          id:uid(),
          name,
          category:text(m.category||source.category||dish.course)||'Main course',
          portions:Number(m.portions||source.portions||source.yield||10)||10,
          ingredients:ing,
          method,
          allergens:Array.isArray(source.allergens)?source.allergens.join(', '):text(m.allergens||source.allergens||dish.allergens)||'VERIFY',
          cost:Number(m.cost||source.cost||0)||0,
          sellingPrice:Number(m.sellingPrice||m.price||source.sellingPrice||source.price||dish.price||0)||0,
          createdAt:m.createdAt||(typeof nowISO==='function'?nowISO():new Date().toISOString()),
          createdBy:m.createdBy||((typeof me!=='undefined'&&me)?me.name:'AI kitchen manager'),
          aiGenerated:true,
          needsGeneration:!(ing.length&&method)
        };
        state.recipes.push(r);
      }else if(!(r.ingredients||[]).length||!text(r.method)){
        if(ing.length) r.ingredients=ing;
        if(method) r.method=method;
        r.needsGeneration=!(Array.isArray(r.ingredients)&&r.ingredients.length&&text(r.method));
      }
      return r;
    }

    function requestGeneration(r){
      if(!r||!r.needsGeneration||r._cleanupGenerationRequested) return;
      r._cleanupGenerationRequested=true;
      save();
      setTimeout(()=>{
        r._cleanupGenerationRequested=false;
        if(typeof window.generateFullRecipe==='function') window.generateFullRecipe(r.id);
        else { r.needsGeneration=true; save(); }
      },700);
    }

    function clean(){
      state.menus=Array.isArray(state.menus)?state.menus:[];
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      const valid=[];
      const converted=[];
      for(const m of state.menus){
        // A real menu must contain two or more dishes/recipe references.
        if(dishCount(m)>=2){ valid.push(m); continue; }
        const r=ensureRecipe(m);
        converted.push({menu:m,recipe:r});
      }
      if(!converted.length) return;
      state.menus=valid;
      if(typeof audit==='function') audit('migrate','recipe',{message:'Converted invalid dish records from menus into recipes',count:converted.length});
      save();
      converted.forEach(x=>requestGeneration(x.recipe));
      if(typeof render==='function') render();
      if(typeof toast==='function') toast(converted.length===1?'Dish moved to Recipes and recipe generation started':converted.length+' dishes moved to Recipes','ok');
    }

    clean();
    setInterval(clean,1200);
  }
  boot();
})();