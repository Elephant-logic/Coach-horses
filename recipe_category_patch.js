(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__recipeCategoryPatch) return;
    window.__recipeCategoryPatch=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const courses=['Starter','Main','Dessert','Side','Sauce','Other'];
    const types=['Meat','Fish','Vegetarian','Vegan','Dessert','Other'];
    const norm=v=>String(v||'').trim().toLowerCase();
    const courseMap={starter:'Starter',starters:'Starter',main:'Main',mains:'Main',dessert:'Dessert',desserts:'Dessert',side:'Side',sides:'Side',sauce:'Sauce',sauces:'Sauce',other:'Other'};
    const typeMap={meat:'Meat',fish:'Fish',vegetarian:'Vegetarian',vegan:'Vegan',dessert:'Dessert',desserts:'Dessert',other:'Other'};

    function inferCourse(r){
      // Explicit saved course/category always wins. This prevents a word in the
      // dish name from moving a recipe into the wrong menu section.
      const explicit=courseMap[norm(r.course)]||courseMap[norm(r.category)];
      if(explicit) return explicit;
      const text=norm(r.name||'');
      if(/pudding|cake|tart|cheesecake|brownie|ice cream|sorbet|mousse|crumble/.test(text)) return 'Dessert';
      if(/soup|pâté|pate|bruschetta|croquette|fishcake|parfait/.test(text)) return 'Starter';
      if(/sauce|gravy|jus|dressing/.test(text)) return 'Sauce';
      if(/chips|fries|slaw|mash|roast potatoes|cauliflower cheese/.test(text)) return 'Side';
      return 'Main';
    }

    function inferType(r){
      const explicit=typeMap[norm(r.foodCategory)]||typeMap[norm(r.type)];
      if(explicit) return explicit;
      const text=norm(r.name||'');
      if(/salmon|cod|haddock|tuna|mackerel|trout|sea bass|seabass|prawn|shrimp|crab|lobster|fish/.test(text)) return 'Fish';
      if(/chicken|beef|pork|lamb|duck|turkey|venison|bacon|ham|steak|sausage|meat/.test(text)) return 'Meat';
      if(/vegan/.test(text)) return 'Vegan';
      if(/pudding|cake|tart|cheesecake|brownie|ice cream|sorbet|mousse|crumble/.test(text)) return 'Dessert';
      if(/vegetarian|vegetable|mushroom|halloumi|cheese|risotto|pasta|chickpea/.test(text)) return 'Vegetarian';
      return 'Other';
    }

    function categorise(){
      let changed=false;
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      for(const r of state.recipes){
        const course=inferCourse(r), foodCategory=inferType(r);
        if(r.course!==course){r.course=course;changed=true;}
        if(r.category!==course){r.category=course;changed=true;}
        if(r.foodCategory!==foodCategory){r.foodCategory=foodCategory;changed=true;}
      }
      if(changed) save();
    }

    VIEWS.menus=function(){
      categorise();
      const recipes=state.recipes||[], menus=state.menus||[];
      const grouped=courses.map(course=>({course,items:recipes.filter(r=>r.course===course)})).filter(g=>g.items.length);
      const recipeHtml=grouped.length?grouped.map(g=>`<section class="mt"><h3>${escv(g.course)}</h3>${types.map(type=>{const rows=g.items.filter(r=>r.foodCategory===type);if(!rows.length)return '';return `<div class="card mt"><h4>${escv(type)}</h4><div class="rows">${rows.map(r=>`<div class="row"><span></span><div style="min-width:0"><b>${escv(r.name)}</b><br><small>${escv(r.course)} · ${escv(r.foodCategory)} · ${Number(r.portions||0)} portions · ${r.needsGeneration?'Generating details…':escv(r.allergens||'VERIFY')}</small></div><div class="btn-row"><button class="btn sm" onclick="openRecipe('${r.id}')">Open recipe</button>${typeof me!=='undefined'&&me&&me.role==='manager'?`<button class="btn sm bad" onclick="deleteRecipe('${r.id}')">Delete</button>`:''}</div></div>`).join('')}</div></div>`;}).join('')}</section>`).join(''):emptyState('No recipes yet','Ask the AI for a recipe or add one manually.');
      page('Menus & recipes','Recipes are organised first by menu course, then by food category.',`
        <div class="card"><div class="card-head"><div><h2>Recipe library</h2><p class="muted">Starters, mains, desserts, sides and sauces are kept in separate sections.</p></div><button class="btn sm" onclick="recipeForm()">Add recipe</button></div>${recipeHtml}</div>
        <div class="card mt"><div class="card-head"><div><h2>Saved menus</h2><p class="muted">Menus are built by selecting recipes from these categories.</p></div></div>${menus.length?`<div class="rows">${menus.map(m=>`<div class="row"><span></span><div><b>${escv(m.name)}</b><br><small>${typeof fmtDT==='function'?fmtDT(m.createdAt):escv(m.createdAt||'')}</small></div><div class="btn-row"><button class="btn sm ghost" onclick="openSaved('${m.id}')">Open menu</button>${typeof me!=='undefined'&&me&&me.role==='manager'?`<button class="btn sm bad" onclick="deleteMenu('${m.id}')">Delete</button>`:''}</div></div>`).join('')}</div>`:'<p class="muted">No saved menus yet.</p>'}</div>`);
    };

    categorise();
    if(typeof route!=='undefined'&&route==='menus'&&typeof render==='function') render();
  }
  boot();
})();