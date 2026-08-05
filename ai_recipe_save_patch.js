(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__aiRecipeSavePatch) return;
    window.__aiRecipeSavePatch=true;

    let lastAIText='';
    let saving=false;
    const originalFetch=window.fetch.bind(window);

    function responseText(data){
      if(data&&data.output_text) return String(data.output_text);
      let out='';
      for(const item of (data&&data.output)||[]) for(const part of item.content||[]) if(part.text) out+=part.text;
      return out;
    }

    window.fetch=async function(input,init){
      const res=await originalFetch(input,init);
      const url=typeof input==='string'?input:(input&&input.url)||'';
      if(url.includes('/api/openai/responses')){
        try{
          const data=await res.clone().json();
          const text=responseText(data).trim();
          if(text) lastAIText=text;
        }catch(_){ }
      }
      return res;
    };

    function normaliseRecipe(obj){
      const ingredients=(obj.ingredients||[]).map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:{name:x.name||x.ingredient||'',qty:x.qty||x.quantity||'',unit:x.unit||''}).filter(x=>x.name);
      return {
        name:String(obj.name||obj.dish||obj.title||'').trim(),
        category:String(obj.category||obj.course||'Main'),
        portions:Number(obj.portions||obj.yield||10)||10,
        ingredients,
        method:Array.isArray(obj.method)?obj.method.join('\n'):String(obj.method||''),
        allergens:Array.isArray(obj.allergens)?obj.allergens.join(', '):String(obj.allergens||'VERIFY'),
        cost:Number(obj.cost||0)||0,
        sellingPrice:Number(obj.sellingPrice||obj.price||0)||0
      };
    }

    async function saveDraft(){
      if(saving) return;
      if(!lastAIText) return typeof toast==='function'&&toast('No AI recipe draft found yet','bad');
      saving=true;
      try{
        const prompt='Convert the following recipe draft into ONLY valid JSON with keys name, category, portions, ingredients (array of {name,qty,unit}), method, allergens, cost, sellingPrice. Do not return markdown. Draft:\n'+lastAIText;
        const res=await originalFetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:prompt,temperature:0.1})});
        const data=await res.json();
        if(!res.ok) throw new Error(data?.error?.message||'AI request failed');
        const text=responseText(data);
        const match=text.match(/\{[\s\S]*\}/);
        if(!match) throw new Error('Recipe details could not be read');
        const recipe=normaliseRecipe(JSON.parse(match[0]));
        if(!recipe.name||!recipe.ingredients.length||!recipe.method.trim()) throw new Error('Recipe draft is incomplete');
        state.recipes=Array.isArray(state.recipes)?state.recipes:[];
        let existing=state.recipes.find(r=>String(r.name||'').trim().toLowerCase()===recipe.name.toLowerCase());
        if(existing) Object.assign(existing,recipe,{needsGeneration:false,updatedAt:new Date().toISOString()});
        else state.recipes.push({id:uid(),...recipe,createdAt:new Date().toISOString(),createdBy:(typeof me!=='undefined'&&me?me.name:'AI'),aiGenerated:true,needsGeneration:false});
        state.menus=(state.menus||[]).filter(m=>String(m.name||m.title||'').trim().toLowerCase()!==recipe.name.toLowerCase());
        if(typeof audit==='function') await audit(existing?'update':'create','recipe',{name:recipe.name,source:'AI approved draft'});
        save();
        if(typeof toast==='function') toast('Recipe saved to Recipe library','ok');
        if(typeof render==='function') render();
      }catch(err){ if(typeof toast==='function') toast('Recipe was not saved: '+err.message,'bad'); }
      finally{ saving=false; }
    }

    function approvalCommand(v){return /^(save( it| this| the recipe)?|approve( it| this)?|yes,? save( it)?|add (it|this) to recipes?)\.?$/i.test(String(v||'').trim());}

    document.addEventListener('click',function(e){
      const btn=e.target.closest('button');
      if(!btn||!/ask ai/i.test(btn.textContent||'')) return;
      const box=btn.closest('form,.card,section,main')||document;
      const input=box.querySelector('textarea,input[type="text"]');
      if(!input||!approvalCommand(input.value)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      input.value='';
      saveDraft();
    },true);

    document.addEventListener('submit',function(e){
      const input=e.target.querySelector&&e.target.querySelector('textarea,input[type="text"]');
      if(!input||!approvalCommand(input.value)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      input.value=''; saveDraft();
    },true);
  }
  boot();
})();
