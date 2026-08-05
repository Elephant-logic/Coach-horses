(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof modal!=='function'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__recipeManagementPatch) return;
    window.__recipeManagementPatch=true;

    const isManager=()=>window.me&&me.role==='manager';
    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const recipeLikeMenu=m=>{
      if(!m) return false;
      const c=m.content||{};
      if(c.ingredients||c.method||c.recipe) return true;
      const dishes=Array.isArray(c.dishes)?c.dishes:[];
      return dishes.length===1 && String(m.name||c.title||'').trim().toLowerCase()===String(dishes[0]?.name||'').trim().toLowerCase();
    };
    const extractRecipe=m=>{
      const c=m.content||{};
      const r=c.recipe||c;
      const dish=(Array.isArray(c.dishes)&&c.dishes.length===1)?c.dishes[0]:{};
      const rawIngredients=r.ingredients||dish.ingredients||[];
      const ingredients=Array.isArray(rawIngredients)?rawIngredients.map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:{name:x.name||x.ingredient||'',qty:x.qty||x.quantity||'',unit:x.unit||''}).filter(x=>x.name):[];
      return {
        id:uid(),
        name:m.name||r.name||dish.name||c.title||'Untitled recipe',
        category:r.category||dish.course||'Main',
        portions:Number(r.portions||r.yield||10)||10,
        ingredients,
        method:r.method||dish.method||dish.description||'',
        allergens:Array.isArray(r.allergens)?r.allergens.join(', '):(r.allergens||dish.allergens||'VERIFY'),
        cost:Number(r.cost||0)||0,
        sellingPrice:Number(r.sellingPrice||r.price||dish.price||0)||0,
        createdAt:m.createdAt||nowISO(),
        createdBy:m.createdBy||(window.me?me.name:'AI'),
        aiGenerated:true,
        needsGeneration:!(ingredients.length&&String(r.method||dish.method||'').trim())
      };
    };

    async function generateRecipe(recipe){
      if(recipe._generating) return;
      recipe._generating=true; save();
      try{
        const prompt=`Create a professional commercial-kitchen recipe for ${recipe.name}. Return ONLY valid JSON with keys: name, category, portions, ingredients (array of objects with name, qty, unit), method (detailed numbered method as a string), allergens (comma-separated UK allergens), cost, sellingPrice. Use realistic quantities for 10 portions unless the dish clearly needs another yield. Allergens must be marked for verification against packaging.`;
        const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:prompt,temperature:0.2})});
        const data=await res.json();
        if(!res.ok) throw new Error(data?.error?.message||'AI request failed');
        let text=data.output_text||'';
        if(!text&&Array.isArray(data.output)){
          for(const item of data.output){ for(const part of (item.content||[])){ if(part.text) text+=part.text; } }
        }
        const match=text.match(/\{[\s\S]*\}/);
        if(!match) throw new Error('AI did not return recipe JSON');
        const obj=JSON.parse(match[0]);
        recipe.name=obj.name||recipe.name;
        recipe.category=obj.category||recipe.category||'Main';
        recipe.portions=Number(obj.portions||10)||10;
        recipe.ingredients=(obj.ingredients||[]).map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:{name:x.name||x.ingredient||'',qty:x.qty||x.quantity||'',unit:x.unit||''}).filter(x=>x.name);
        recipe.method=Array.isArray(obj.method)?obj.method.join('\n'):String(obj.method||'');
        recipe.allergens=Array.isArray(obj.allergens)?obj.allergens.join(', '):String(obj.allergens||'VERIFY');
        recipe.cost=Number(obj.cost||0)||0;
        recipe.sellingPrice=Number(obj.sellingPrice||0)||0;
        recipe.needsGeneration=false;
        recipe._generating=false;
        await audit('update','recipe',{id:recipe.id,name:recipe.name,source:'AI generation'});
        save(); toast('Full recipe generated','ok');
        if(typeof render==='function') render();
      }catch(err){
        recipe._generating=false; save();
        toast('Could not generate recipe: '+err.message,'bad');
      }
    }
    window.generateFullRecipe=id=>{ const r=state.recipes.find(x=>x.id===id); if(r) generateRecipe(r); };

    function migrateWrongMenus(){
      state.recipes=state.recipes||[]; state.menus=state.menus||[];
      let changed=false;
      for(const m of [...state.menus]){
        if(!recipeLikeMenu(m)) continue;
        let r=state.recipes.find(x=>String(x.name||'').toLowerCase()===String(m.name||'').toLowerCase());
        if(!r){ r=extractRecipe(m); state.recipes.push(r); }
        state.menus=state.menus.filter(x=>x.id!==m.id);
        changed=true;
        if(r.needsGeneration) setTimeout(()=>generateRecipe(r),400);
      }
      if(changed){ audit('migrate','recipe',{message:'Converted recipe saved as menu'}); save(); }
    }

    window.openRecipe=function(id){
      const r=state.recipes.find(x=>x.id===id); if(!r) return;
      const ing=(r.ingredients||[]).map(i=>`<tr><td>${escv(i.name)}</td><td>${escv(i.qty||'')}</td><td>${escv(i.unit||'')}</td></tr>`).join('');
      modal(`<h2>${escv(r.name)}</h2>
        <div class="notice">${escv(r.category||'Uncategorised')} · ${Number(r.portions||0)} portions · Allergens: ${escv(r.allergens||'VERIFY')}</div>
        <h3>Ingredients</h3>${ing?`<div class="twrap"><table class="tbl"><thead><tr><th>Ingredient</th><th>Qty</th><th>Unit</th></tr></thead><tbody>${ing}</tbody></table></div>`:'<p class="muted">No ingredients saved yet.</p>'}
        <h3>Method</h3><div class="card" style="white-space:pre-wrap">${escv(r.method||'No method saved yet.')}</div>
        <div class="btn-row" style="margin-top:14px">
          ${r.needsGeneration||!(r.ingredients||[]).length||!r.method?`<button class="btn" onclick="closeModal();generateFullRecipe('${r.id}')">Generate full recipe</button>`:''}
          <button class="btn ghost" onclick="closeModal();recipeForm('${r.id}')">Edit</button>
          ${isManager()?`<button class="btn bad" onclick="closeModal();deleteRecipe('${r.id}')">Delete recipe</button>`:''}
        </div>`);
    };

    window.deleteRecipe=async function(id){
      if(!isManager()) return toast('Manager access required','bad');
      const r=state.recipes.find(x=>x.id===id); if(!r) return;
      if(!confirm(`Delete recipe “${r.name}”?`)) return;
      state.recipes=state.recipes.filter(x=>x.id!==id);
      for(const m of state.menus||[]){ if(Array.isArray(m.recipeIds)) m.recipeIds=m.recipeIds.filter(x=>x!==id); }
      await audit('delete','recipe',{id,name:r.name,by:me.name}); save(); toast('Recipe deleted','ok'); render();
    };
    window.deleteMenu=async function(id){
      if(!isManager()) return toast('Manager access required','bad');
      const m=state.menus.find(x=>x.id===id); if(!m) return;
      if(!confirm(`Delete menu “${m.name}”?`)) return;
      state.menus=state.menus.filter(x=>x.id!==id);
      await audit('delete','menu',{id,name:m.name,by:me.name}); save(); toast('Menu deleted','ok'); render();
    };

    const originalRecipeForm=window.recipeForm;
    window.recipeForm=function(id=''){
      if(!id) return originalRecipeForm();
      const r=state.recipes.find(x=>x.id===id); if(!r) return;
      const ingredientText=(r.ingredients||[]).map(i=>[i.name,i.qty,i.unit].join(' | ')).join('\n');
      modal(`<h2>Edit recipe</h2><form id="rEdit" class="form">
        <label>Dish name<input name="name" value="${escv(r.name||'')}" required></label>
        <label>Category<input name="category" value="${escv(r.category||'')}"></label>
        <label>Portions<input name="portions" type="number" min="1" value="${Number(r.portions||10)}" required></label>
        <label>Ingredients (name | qty | unit, one per line)<textarea name="ingredients" required>${escv(ingredientText)}</textarea></label>
        <label>Method<textarea name="method">${escv(r.method||'')}</textarea></label>
        <label>Allergens<input name="allergens" value="${escv(r.allergens||'')}"></label>
        <div class="form two"><label>Batch cost £<input name="cost" type="number" step="0.01" value="${Number(r.cost||0)}"></label><label>Selling price £<input name="sellingPrice" type="number" step="0.01" value="${Number(r.sellingPrice||0)}"></label></div>
        <button class="btn" type="submit">Update recipe</button></form>`);
      document.getElementById('rEdit').onsubmit=async e=>{
        e.preventDefault(); const d=Object.fromEntries(new FormData(e.target));
        Object.assign(r,d,{portions:Number(d.portions),cost:Number(d.cost||0),sellingPrice:Number(d.sellingPrice||0),ingredients:d.ingredients.split('\n').map(x=>{const [name,qty,unit]=x.split('|').map(v=>(v||'').trim());return {name,qty,unit};}).filter(x=>x.name),needsGeneration:false});
        await audit('update','recipe',{id:r.id,name:r.name}); save(); closeModal(); toast('Recipe updated','ok'); render();
      };
    };

    VIEWS.menus=function(){
      const recipes=state.recipes||[], menus=state.menus||[];
      page('Menus & recipes','Recipes contain ingredients and methods. Menus group recipes for service.',`
        <div class="card"><div class="card-head"><div><h2>Recipe library</h2><p class="muted">AI recipe requests are saved here, not as menus.</p></div><button class="btn sm" onclick="recipeForm()">Add recipe</button></div>
          ${recipes.length?`<div class="rows">${recipes.map(r=>`<div class="row"><span></span><div style="min-width:0"><b>${escv(r.name)}</b><br><small>${escv(r.category||'Uncategorised')} · ${Number(r.portions||0)} portions · ${r.needsGeneration?'Generating details…':escv(r.allergens||'VERIFY')}</small></div><div class="btn-row"><button class="btn sm" onclick="openRecipe('${r.id}')">Open recipe</button>${isManager()?`<button class="btn sm bad" onclick="deleteRecipe('${r.id}')">Delete</button>`:''}</div></div>`).join('')}</div>`:emptyState('No recipes yet','Ask the AI for a recipe or add one manually.')}
        </div>
        <div class="card mt"><div class="card-head"><div><h2>Saved menus</h2><p class="muted">Menus are collections of dishes, not individual recipes.</p></div></div>
          ${menus.length?`<div class="rows">${menus.map(m=>`<div class="row"><span></span><div><b>${escv(m.name)}</b><br><small>${typeof fmtDT==='function'?fmtDT(m.createdAt):escv(m.createdAt||'')}</small></div><div class="btn-row"><button class="btn sm ghost" onclick="openSaved('${m.id}')">Open menu</button>${isManager()?`<button class="btn sm bad" onclick="deleteMenu('${m.id}')">Delete</button>`:''}</div></div>`).join('')}</div>`:'<p class="muted">No saved menus yet.</p>'}
        </div>`);
    };

    migrateWrongMenus();
    setInterval(migrateWrongMenus,2500);
    if(typeof route!=='undefined'&&route==='menus') render();
  }
  boot();
})();