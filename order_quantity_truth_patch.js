(function(){
  function boot(){
    if(typeof state==='undefined') return setTimeout(boot,200);
    if(window.__orderQuantityTruthV1) return;
    window.__orderQuantityTruthV1=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const escv=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    function selectedMenu(){
      const select=document.getElementById('wfPrepMenu');
      const id=select&&select.value;
      return (state.menus||[]).find(m=>String(m.id)===String(id));
    }

    function recipesFor(menu){
      const ids=(menu&&Array.isArray(menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
    }

    function ingredientIsSuspicious(i){
      if(!i||typeof i==='string') return true;
      const qty=Number(i.qty??i.quantity);
      const unit=norm(i.unit);
      if(!Number.isFinite(qty)||qty<=0||!unit) return true;
      if(unit==='each' && Math.abs(qty-Math.round(qty))>0.0001) return true;
      return false;
    }

    function recipeNeedsRealAmounts(r){
      const ingredients=Array.isArray(r&&r.ingredients)?r.ingredients:[];
      if(!ingredients.length) return true;
      const suspicious=ingredients.filter(ingredientIsSuspicious).length;
      const eachCount=ingredients.filter(i=>norm(i&&i.unit)==='each').length;
      const imported=/menu photo|complete menu/i.test(String(r&&r.source||''));
      return suspicious>0 || (imported && eachCount/ingredients.length>0.6);
    }

    function openRecipe(id){
      if(typeof window.recipeForm==='function') return window.recipeForm(id);
      if(typeof window.openRecipe==='function') return window.openRecipe(id);
      if(typeof toast==='function') toast('Recipe editor unavailable','bad');
    }
    window.editRealRecipeAmounts=openRecipe;

    function repairOrderDisplay(){
      const menu=selectedMenu();
      if(!menu) return;
      const bad=recipesFor(menu).filter(recipeNeedsRealAmounts);
      if(!bad.length) return;

      const heading=[...document.querySelectorAll('h2,h3')].find(h=>norm(h.textContent)==='order list');
      if(!heading) return;
      const card=heading.closest('.card')||heading.parentElement;
      if(!card||card.dataset.realQuantityGuard==='1') return;
      card.dataset.realQuantityGuard='1';

      const rows=bad.map(r=>`<div class="row"><span></span><div><b>${escv(r.name||'Recipe')}</b><br><small>Enter the actual ingredient quantities and units for the recipe yield.</small></div><button class="btn sm" type="button" onclick="editRealRecipeAmounts('${escv(r.id)}')">Edit recipe amounts</button></div>`).join('');
      card.innerHTML=`<h2>Order list not ready</h2><div class="notice bad"><b>The previous amounts were estimates, not real ordering quantities.</b><br>They have been stopped so the app does not tell you to order false amounts. Complete the recipes below with the actual kitchen quantities and units; then rebuild the prep list.</div><div class="rows">${rows}</div>`;
    }

    new MutationObserver(repairOrderDisplay).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(repairOrderDisplay,600);
    repairOrderDisplay();
  }
  boot();
})();