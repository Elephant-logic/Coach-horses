(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__orderQuantityTruthV3) return;
    window.__orderQuantityTruthV3=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
    const validUnits=new Set(['g','kg','ml','l','each','slice','tin','pack','bunch']);
    let bypass=false,busy=false;

    function recipesFor(menu){
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
    }
    function ingredientBad(i){
      if(!i||!String(i.name||'').trim()) return true;
      const q=num(i.qty!=null?i.qty:i.quantity),u=norm(i.unit);
      if(q<=0||!validUnits.has(u)) return true;
      if(u==='each'&&!/egg|bun|roll|fillet|steak|breast|burger|sausage|rasher|slice|tin|pack|lemon|lime/i.test(String(i.name))) return true;
      return false;
    }
    function recipeBad(r){
      const list=Array.isArray(r&&r.ingredients)?r.ingredients:[];
      return !list.length||list.some(ingredientBad)||!String(r&&r.method||'').trim()||r.quantitiesReady!==true;
    }
    function status(message,type){
      const button=document.getElementById('wfBuildPrep'); if(!button) return;
      let box=document.getElementById('wfQuantityStatus');
      if(!box){box=document.createElement('div');box.id='wfQuantityStatus';box.className='notice';box.style.marginTop='10px';button.insertAdjacentElement('afterend',box);}
      box.className='notice'+(type==='bad'?' bad':''); box.innerHTML='<b>'+message+'</b>';
    }
    function outputText(data){
      let t=data&&data.output_text||'';
      if(!t&&Array.isArray(data&&data.output)) for(const item of data.output) for(const p of(item.content||[])) if(p.text)t+=p.text;
      return t;
    }
    function fallbackIngredient(name,portions){
      const n=norm(name),p=Math.max(1,portions||10);
      const perPortion=(qty,unit)=>({name:String(name).trim(),qty:Math.round(qty*p*100)/100,unit});
      if(/salt|pepper|spice|herb|season/i.test(n)) return perPortion(1.5,'g');
      if(/oil|cream|milk|stock|sauce|jus|gravy|dressing/i.test(n)) return perPortion(30,'ml');
      if(/rice|pasta|flour|sugar|cheese|butter|peas|beans|potato|tomato|vegetable|salad|slaw|mushroom|onion/i.test(n)) return perPortion(80,'g');
      if(/meat|beef|chicken|pork|fish|scampi|gammon|steak|duck|lamb/i.test(n)) return perPortion(180,'g');
      if(/egg/i.test(n)) return perPortion(0.5,'each');
      if(/bun|roll|fillet|breast|burger|sausage|rasher|slice|lemon|lime/i.test(n)) return perPortion(1,'each');
      return perPortion(50,'g');
    }
    async function generateBatch(recipes){
      const payload=recipes.map(r=>({id:String(r.id),name:r.name,course:r.course||r.category||'Other',portions:Math.max(1,num(r.portions||r.yield)||10),description:r.description||'',method:r.method||'',allergens:r.allergens||'',ingredients:(r.ingredients||[]).map(i=>typeof i==='string'?{name:i}:{name:i.name,qty:i.qty||i.quantity,unit:i.unit})}));
      const prompt='Turn each supplied pub menu dish into a complete editable working recipe. Preserve every id. Return ONLY JSON {"recipes":[{"id":"...","portions":10,"ingredients":[{"name":"...","qty":123,"unit":"g"}],"method":"step by step method","allergens":"..."}]}. Use realistic commercial-kitchen quantities for the stated yield. Use only g, kg, ml, l, or each for genuinely countable items. Include every important component, including sauces, garnish and seasoning. Never use vague measures or 1 each for liquids, dairy, sauce, rice, pasta, vegetables, meat or seasoning. These are sensible working estimates that must scale accurately.';
      const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt+'\n\n'+JSON.stringify(payload)}]}]})});
      const data=await res.json(); if(!res.ok) throw new Error(data?.error?.message||'Recipe calculation failed');
      const m=outputText(data).match(/\{[\s\S]*\}/); if(!m) throw new Error('No recipe data returned');
      const parsed=JSON.parse(m[0]); return Array.isArray(parsed.recipes)?parsed.recipes:[];
    }
    async function completeRecipes(recipes){
      const results=[];
      for(let i=0;i<recipes.length;i+=5){
        status('Creating proper recipes '+(i+1)+'–'+Math.min(i+5,recipes.length)+' of '+recipes.length+'…');
        try{results.push(...await generateBatch(recipes.slice(i,i+5)));}
        catch(_){/* deterministic fallback below */}
      }
      const byId=new Map(results.map(x=>[String(x.id),x]));
      for(const recipe of recipes){
        const made=byId.get(String(recipe.id)),portions=Math.max(1,num(made&&made.portions)||num(recipe.portions||recipe.yield)||10);
        let ingredients=Array.isArray(made&&made.ingredients)?made.ingredients:[];
        ingredients=ingredients.map(i=>({name:String(i.name||'').trim(),qty:Math.max(0.01,num(i.qty)),unit:norm(i.unit)==='litre'||norm(i.unit)==='litres'?'l':norm(i.unit)})).filter(i=>i.name&&i.qty>0&&validUnits.has(i.unit));
        if(!ingredients.length){
          const names=(recipe.ingredients||[]).map(i=>typeof i==='string'?i:i&&i.name).filter(Boolean);
          ingredients=(names.length?names:[recipe.name+' main ingredient','cooking oil','seasoning']).map(n=>fallbackIngredient(n,portions));
        }
        recipe.portions=portions;
        recipe.ingredients=ingredients;
        recipe.method=String(made&&made.method||recipe.method||('Prepare all ingredients. Cook '+recipe.name+' using standard kitchen procedure, check seasoning and serve safely.')).trim();
        if(made&&made.allergens) recipe.allergens=Array.isArray(made.allergens)?made.allergens.join(', '):String(made.allergens);
        recipe.quantitiesReady=true;
        recipe.quantitySource=made?'AI working recipe estimate':'Rule-based working recipe estimate';
        recipe.needsVerification=true;
        recipe.updatedAt=new Date().toISOString();
      }
      await Promise.resolve(save());
    }
    async function handleBuild(e){
      const button=e.target&&e.target.closest&&e.target.closest('#wfBuildPrep');
      if(!button||bypass||busy) return;
      const id=String(document.getElementById('wfPrepMenu')?.value||'');
      const menu=(state.menus||[]).find(m=>String(m.id)===id); if(!menu) return;
      const all=recipesFor(menu),needs=all.filter(recipeBad);
      if(!all.length) return;
      if(!needs.length) return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      busy=true;button.disabled=true;
      status('Building complete scalable recipes for '+needs.length+' dishes…');
      try{
        await completeRecipes(needs);
        status('Recipes completed and saved. Creating prep and order lists now…');
        bypass=true;button.disabled=false;setTimeout(()=>{button.click();bypass=false;busy=false;},150);
      }catch(err){busy=false;button.disabled=false;status('Could not build recipes: '+(err?.message||'Unknown error'),'bad');}
    }
    document.addEventListener('click',handleBuild,true);
  }
  boot();
})();