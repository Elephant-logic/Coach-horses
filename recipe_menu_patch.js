(function(){
  function start(){
    if(typeof state==='undefined'||typeof modal!=='function'||typeof save!=='function'||typeof uid!=='function') return setTimeout(start,150);
    if(window.__recipeMenuPatchInstalled) return;
    window.__recipeMenuPatchInstalled=true;

    function text(v){return String(v==null?'':v).trim();}
    function arr(v){return Array.isArray(v)?v:[];}
    function menuName(m){return text(m.name||m.title||m.menuName||m.dish||'Saved menu');}
    function findRecipeForMenu(m){
      const ids=[m.recipeId].concat(arr(m.recipeIds),arr(m.recipes).map(x=>typeof x==='string'?x:x&&x.id),arr(m.items).map(x=>typeof x==='string'?x:x&&x.recipeId)).filter(Boolean);
      let r=(state.recipes||[]).find(x=>ids.includes(x.id));
      if(r) return r;
      const n=menuName(m).toLowerCase();
      return (state.recipes||[]).find(x=>text(x.name||x.title).toLowerCase()===n)||null;
    }
    function ingredientsFrom(m){
      const source=m.ingredients||m.recipeIngredients||m.items||[];
      if(Array.isArray(source)) return source.map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:x).filter(Boolean);
      if(typeof source==='string') return source.split(/\n|,/).map(x=>({name:x.trim(),qty:'',unit:''})).filter(x=>x.name);
      return [];
    }
    function ensureRecipe(m){
      let r=findRecipeForMenu(m);
      if(r) return r;
      r={
        id:uid(),
        name:menuName(m),
        category:text(m.category||'Main course'),
        portions:Number(m.portions||m.serves||4)||4,
        ingredients:ingredientsFrom(m),
        method:text(m.method||m.instructions||m.recipeMethod||m.description),
        allergens:text(m.allergens||''),
        cost:Number(m.cost||0)||0,
        sellingPrice:Number(m.sellingPrice||m.price||0)||0,
        createdAt:typeof nowISO==='function'?nowISO():new Date().toISOString(),
        source:'AI kitchen assistant'
      };
      state.recipes=state.recipes||[];
      state.recipes.push(r);
      m.recipeId=r.id;
      save();
      return r;
    }
    function ingHtml(r){
      const list=arr(r.ingredients);
      if(!list.length) return '<p class="muted">No ingredients have been added yet.</p>';
      return '<ul>'+list.map(i=>'<li><b>'+esc(text(i.name||i.ingredient))+'</b>'+(text(i.qty||i.quantity)?' — '+esc(text(i.qty||i.quantity)):'')+(text(i.unit)?' '+esc(text(i.unit)):'')+'</li>').join('')+'</ul>';
    }
    window.openSavedMenuRecipe=function(id){
      const m=(state.menus||[]).find(x=>String(x.id)===String(id));
      if(!m) return toast&&toast('Saved menu not found','bad');
      const r=ensureRecipe(m);
      modal('<h2>'+esc(r.name||menuName(m))+'</h2>'+
        '<div class="card"><h3>Ingredients</h3>'+ingHtml(r)+'</div>'+
        '<div class="card"><h3>Method</h3><p style="white-space:pre-wrap">'+esc(text(r.method)||'No method has been added yet. Use Edit recipe to complete it.')+'</p></div>'+
        '<div class="card"><h3>Allergens</h3><p>'+esc(text(r.allergens)||'Not yet verified')+'</p></div>'+
        '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" onclick="closeModal(); recipeForm(\''+r.id+'\')">Edit recipe</button><button class="btn ghost" onclick="closeModal()">Close</button></div>');
    };

    function addButtons(){
      const menus=state.menus||[];
      if(!menus.length) return;
      const headings=[...document.querySelectorAll('h1,h2,h3')];
      const saved=headings.find(h=>/saved menus/i.test(h.textContent||''));
      if(!saved) return;
      const root=saved.parentElement||document.body;
      menus.forEach(m=>{
        const name=menuName(m);
        const candidates=[...root.querySelectorAll('h2,h3,h4,strong,b')].filter(el=>text(el.textContent)===name);
        candidates.forEach(el=>{
          const card=el.closest('.card')||el.parentElement;
          if(!card||card.dataset.recipeMenuFixed==='1') return;
          card.dataset.recipeMenuFixed='1';
          card.style.cursor='pointer';
          card.setAttribute('role','button');
          card.setAttribute('tabindex','0');
          const row=document.createElement('div');
          row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
          const btn=document.createElement('button');
          btn.className='btn sm'; btn.type='button'; btn.textContent='Open recipe';
          btn.onclick=function(e){e.stopPropagation();openSavedMenuRecipe(m.id);};
          row.appendChild(btn); card.appendChild(row);
          card.onclick=function(e){if(e.target.closest('button'))return;openSavedMenuRecipe(m.id);};
          card.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSavedMenuRecipe(m.id);}};
        });
      });
    }
    new MutationObserver(addButtons).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(addButtons,1000);
    addButtons();
  }
  start();
})();
