(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function') return setTimeout(boot,150);
    if(window.__menusRecipesPrepRestoreV1) return;
    window.__menusRecipesPrepRestoreV1=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();
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

    function menusAndRecipesView(){
      const menus=(state.menus||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      const recipes=(state.recipes||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
      const menuRows=menus.map(m=>`<div class="row"><span></span><div><b>${escv(m.name||'Menu')}</b><br><small>${recipesFor(m).length} linked recipes${m.pageCount?' · '+m.pageCount+' pages':''}</small></div><div class="btn-row"><button class="btn sm" type="button" onclick="openWorkflowMenu('${escv(m.id)}')">Open menu</button><button class="btn sm ghost" type="button" onclick="menuWorkflowBuilder('${escv(m.id)}')">Edit menu</button><button class="btn sm bad" type="button" onclick="deleteWorkflowMenu('${escv(m.id)}')">Delete</button></div></div>`).join('');
      const recipeRows=recipes.map(r=>`<div class="row"><span></span><div><b>${escv(r.name||'Recipe')}</b><br><small>${escv(r.course||r.category||'Other')} · ${Number(r.portions||r.yield||10)} portion base recipe${r.needsVerification?' · VERIFY':''}</small></div><div class="btn-row"><button class="btn sm" type="button" onclick="viewStoredRecipe('${escv(r.id)}')">View</button><button class="btn sm ghost" type="button" onclick="editStoredRecipe('${escv(r.id)}')">Edit</button></div></div>`).join('');
      page('Menus & Recipes','Menus choose which separately stored recipes are used. Recipes can be viewed and edited without opening a menu.',
        `<div class="card"><div class="card-head"><h2>Menu tools</h2><div class="btn-row"><button class="btn" type="button" onclick="importWorkflowMenuPhotos()">Upload menu photos</button><button class="btn ghost" type="button" onclick="menuWorkflowBuilder()">Create menu</button></div></div></div>
         <div class="card mt"><h2>Saved menus</h2><p class="muted">A menu is a list of linked recipes.</p><div class="rows">${menuRows||'<p class="muted">No menus saved.</p>'}</div></div>
         <div class="card mt"><h2>Recipe library</h2><p class="muted">These recipes are stored separately and supply the quantities used by Prep Lists.</p><div class="rows">${recipeRows||'<p class="muted">No recipes saved.</p>'}</div></div>`);
    }

    VIEWS.menus=menusAndRecipesView;

    function prepExplanation(){
      const heading=[...document.querySelectorAll('h1,h2,h3')].find(h=>/build prep and order/i.test(h.textContent||''));
      if(!heading) return;
      const card=heading.closest('.card')||heading.parentElement;
      if(!card||card.querySelector('[data-prep-purpose]')) return;
      const p=document.createElement('p');
      p.className='muted';p.dataset.prepPurpose='1';
      p.textContent='Prep Lists reads the selected menu recipes, scales their saved quantities to covers, combines matching ingredients, then compares what is required with stock entered below. It does not create or rewrite recipes.';
      heading.insertAdjacentElement('afterend',p);
    }
    new MutationObserver(prepExplanation).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(prepExplanation,700);
  }
  boot();
})();