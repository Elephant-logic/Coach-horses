(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__orderQuantityTruthV2) return;
    window.__orderQuantityTruthV2=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
    const validUnits=new Set(['g','kg','ml','l','litre','litres','each','piece','pieces','slice','slices','tin','tins','pack','packs','bunch','bunches']);
    let bypass=false;
    let busy=false;

    function recipesFor(menu){
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
    }

    function ingredientNeedsWork(i){
      if(!i||!String(i.name||'').trim()) return true;
      const unit=norm(i.unit);
      const qty=num(i.qty!=null?i.qty:i.quantity);
      if(qty<=0||!validUnits.has(unit)) return true;
      if(unit==='each'&&qty<=1&&/cream|butter|stock|sauce|rice|pasta|oil|salt|pepper|cheese|garlic|flour|sugar|milk|peas|beans|potato|tomato|salad|slaw|meat|chicken|beef|pork|fish|scampi/i.test(String(i.name))) return true;
      return false;
    }

    function recipeNeedsWork(r){
      const list=Array.isArray(r&&r.ingredients)?r.ingredients:[];
      return !list.length||list.some(ingredientNeedsWork)||r.quantitiesReady!==true;
    }

    function status(message,type){
      const button=document.getElementById('wfBuildPrep');
      if(!button) return;
      let box=document.getElementById('wfQuantityStatus');
      if(!box){box=document.createElement('div');box.id='wfQuantityStatus';box.className='notice';box.style.marginTop='10px';button.insertAdjacentElement('afterend',box);}
      box.className='notice'+(type==='bad'?' bad':'');
      box.innerHTML='<b>'+message+'</b>';
    }

    function extractText(data){
      let text=data&&data.output_text||'';
      if(!text&&Array.isArray(data&&data.output)) for(const item of data.output) for(const part of(item.content||[])) if(part.text) text+=part.text;
      return text;
    }

    async function calculateBaseRecipes(recipes){
      const payload=recipes.map(r=>({id:String(r.id),name:r.name,course:r.course||r.category||'Other',portions:Math.max(1,num(r.portions||r.yield)||10),method:r.method||'',ingredients:(r.ingredients||[]).map(i=>typeof i==='string'?{name:i}:{name:i.name,qty:i.qty||i.quantity,unit:i.unit})}));
      const prompt='Create realistic editable commercial-kitchen base recipe quantities for the supplied pub dishes. Preserve every recipe id and its stated portions. Return ONLY JSON: {"recipes":[{"id":"...","portions":10,"ingredients":[{"name":"...","qty":123,"unit":"g"}]}]}. Use practical metric units: g, kg, ml, l, or each only when genuinely countable. Never use vague quantities, never use 1 each for liquids, sauces, dairy, seasoning, vegetables, rice, pasta or meat. Include all important components needed to produce each dish. These are working estimates and must be internally consistent so they can be scaled to covers and combined into an order list.';
      const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt+'\n\nRECIPES:\n'+JSON.stringify(payload)}]}]})});
      const data=await res.json();
      if(!res.ok) throw new Error(data&&data.error&&data.error.message||'Could not calculate recipe quantities');
      const text=extractText(data);
      const match=text.match(/\{[\s\S]*\}/);
      if(!match) throw new Error('No recipe quantity data returned');
      const parsed=JSON.parse(match[0]);
      if(!Array.isArray(parsed.recipes)||!parsed.recipes.length) throw new Error('No recipe quantities returned');
      return parsed.recipes;
    }

    async function handleBuild(e){
      const button=e.target&&e.target.closest&&e.target.closest('#wfBuildPrep');
      if(!button||bypass||busy) return;
      const menuId=String(document.getElementById('wfPrepMenu')&&document.getElementById('wfPrepMenu').value||'');
      const menu=(state.menus||[]).find(m=>String(m.id)===menuId);
      if(!menu) return;
      const needs=recipesFor(menu).filter(recipeNeedsWork);
      if(!needs.length) return;
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      busy=true;button.disabled=true;
      status('Working out recipe quantities for '+needs.length+' dishes…');
      try{
        const generated=await calculateBaseRecipes(needs);
        for(const item of generated){
          const recipe=(state.recipes||[]).find(r=>String(r.id)===String(item.id));
          if(!recipe||!Array.isArray(item.ingredients)||!item.ingredients.length) continue;
          recipe.portions=Math.max(1,num(item.portions)||num(recipe.portions)||10);
          recipe.ingredients=item.ingredients.map(i=>({name:String(i.name||'Ingredient').trim(),qty:Math.max(0.01,num(i.qty)),unit:norm(i.unit)==='litres'||norm(i.unit)==='litre'?'l':String(i.unit||'g').trim()})).filter(i=>i.name&&i.qty>0);
          recipe.quantitiesReady=true;
          recipe.quantitySource='AI working estimate from recipe';
          recipe.needsVerification=true;
          recipe.updatedAt=new Date().toISOString();
        }
        await Promise.resolve(save());
        status('Recipe quantities calculated and saved. Building the scaled order list now…');
        bypass=true;
        setTimeout(()=>{button.disabled=false;button.click();bypass=false;busy=false;},100);
      }catch(err){
        busy=false;button.disabled=false;
        status('Could not calculate quantities: '+(err&&err.message||'Unknown error'),'bad');
      }
    }

    document.addEventListener('click',handleBuild,true);
  }
  boot();
})();