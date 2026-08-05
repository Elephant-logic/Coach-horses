(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__aiRecipeSavePatch) return;
    window.__aiRecipeSavePatch=true;

    let lastAIText='';
    let lastDishIdeas=[];
    let saving=false;
    const originalFetch=window.fetch.bind(window);

    function responseText(data){
      if(data&&data.output_text) return String(data.output_text);
      let out='';
      for(const item of (data&&data.output)||[]) for(const part of item.content||[]) if(part.text) out+=part.text;
      return out;
    }

    function parseIdeas(text){
      const lines=String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
      const ideas=[];
      for(const line of lines){
        let name=line.replace(/^[-*•]\s*/,'').replace(/^\d+[.)-]\s*/,'').trim();
        name=name.replace(/\*\*/g,'').replace(/^["']|["']$/g,'').trim();
        if(!name||name.length>100) continue;
        if(/^(here are|ideas|chicken dishes|recipe ideas|you could make|option)/i.test(name)) continue;
        if(name.includes(':')) name=name.split(':')[0].trim();
        if(name.split(/\s+/).length<2) continue;
        if(!ideas.some(x=>x.toLowerCase()===name.toLowerCase())) ideas.push(name);
      }
      return ideas.slice(0,12);
    }

    function userPromptFromBody(body){
      try{
        const p=JSON.parse(body||'{}');
        if(typeof p.input==='string') return p.input;
        if(Array.isArray(p.input)) return p.input.map(x=>typeof x==='string'?x:(x&&x.content)||'').join(' ');
      }catch(_){ }
      return '';
    }

    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:(input&&input.url)||'';
      let nextInit=init;
      if(url.includes('/api/openai/responses')&&init&&typeof init.body==='string'){
        const prompt=userPromptFromBody(init.body);
        if(/\b(make|give|suggest|create)\b[\s\S]{0,40}\b(recipe ideas?|dishes)\b/i.test(prompt)&&/\b(chicken|beef|pork|fish|lamb|vegetarian|vegan)\b/i.test(prompt)&&!/^\s*(make|save|approve)\s+(all|one|\d+)/i.test(prompt)){
          try{
            const payload=JSON.parse(init.body);
            payload.input=String(payload.input||'')+'\nReturn a numbered list of dish names only. Do not create or save recipes yet. The user will choose one dish or say make all.';
            nextInit=Object.assign({},init,{body:JSON.stringify(payload)});
          }catch(_){ }
        }
      }
      const res=await originalFetch(input,nextInit);
      if(url.includes('/api/openai/responses')){
        try{
          const data=await res.clone().json();
          const text=responseText(data).trim();
          if(text){
            lastAIText=text;
            const ideas=parseIdeas(text);
            if(ideas.length>=2) lastDishIdeas=ideas;
          }
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

    async function requestRecipe(dishName){
      const prompt='Create a complete professional kitchen recipe for '+dishName+'. Return ONLY valid JSON with keys name, category, portions, ingredients (array of {name,qty,unit}), method, allergens, cost, sellingPrice. Include practical quantities and a clear method. Do not return markdown.';
      const res=await originalFetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:prompt,temperature:0.2})});
      const data=await res.json();
      if(!res.ok) throw new Error(data?.error?.message||'AI request failed');
      const text=responseText(data);
      const match=text.match(/\{[\s\S]*\}/);
      if(!match) throw new Error('Recipe details could not be read');
      const recipe=normaliseRecipe(JSON.parse(match[0]));
      if(!recipe.name||!recipe.ingredients.length||!recipe.method.trim()) throw new Error('Recipe draft is incomplete');
      return recipe;
    }

    async function storeRecipe(recipe){
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      let existing=state.recipes.find(r=>String(r.name||'').trim().toLowerCase()===recipe.name.toLowerCase());
      if(existing) Object.assign(existing,recipe,{needsGeneration:false,updatedAt:new Date().toISOString()});
      else state.recipes.push({id:uid(),...recipe,createdAt:new Date().toISOString(),createdBy:(typeof me!=='undefined'&&me?me.name:'AI'),aiGenerated:true,needsGeneration:false});
      state.menus=(state.menus||[]).filter(m=>String(m.name||m.title||'').trim().toLowerCase()!==recipe.name.toLowerCase());
      if(typeof audit==='function') await audit(existing?'update':'create','recipe',{name:recipe.name,source:'AI recipe workflow'});
      return recipe.name;
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
        await storeRecipe(recipe);
        save();
        if(typeof toast==='function') toast('Recipe saved to Recipe library','ok');
        if(typeof render==='function') render();
      }catch(err){ if(typeof toast==='function') toast('Recipe was not saved: '+err.message,'bad'); }
      finally{ saving=false; }
    }

    async function makeSelected(command){
      if(saving) return;
      if(!lastDishIdeas.length) return typeof toast==='function'&&toast('Ask AI for a list of dish ideas first','bad');
      saving=true;
      try{
        const text=String(command||'').trim();
        let selected=[];
        if(/^make\s+all/i.test(text)) selected=lastDishIdeas.slice();
        else if(/^make\s+(one|one dish)$/i.test(text)) selected=[lastDishIdeas[0]];
        else {
          const num=text.match(/^make\s+(?:number\s*)?(\d+)$/i);
          if(num){
            const idx=Number(num[1])-1;
            if(idx>=0&&idx<lastDishIdeas.length) selected=[lastDishIdeas[idx]];
          } else {
            const wanted=text.replace(/^make\s+/i,'').trim().toLowerCase();
            const hit=lastDishIdeas.find(x=>x.toLowerCase()===wanted||x.toLowerCase().includes(wanted));
            if(hit) selected=[hit];
          }
        }
        if(!selected.length) throw new Error('Say make one, make all, make 2, or make the dish name');
        const saved=[];
        for(const dish of selected){
          if(typeof toast==='function') toast('Creating '+dish+'…','ok');
          const recipe=await requestRecipe(dish);
          saved.push(await storeRecipe(recipe));
        }
        save();
        if(typeof render==='function') render();
        if(typeof toast==='function') toast(saved.length===1?saved[0]+' saved to Recipe library':saved.length+' recipes saved to Recipe library','ok');
      }catch(err){ if(typeof toast==='function') toast('Recipes were not saved: '+err.message,'bad'); }
      finally{ saving=false; }
    }

    function approvalCommand(v){return /^(save( it| this| the recipe)?|approve( it| this)?|yes,? save( it)?|add (it|this) to recipes?)\.?$/i.test(String(v||'').trim());}
    function makeCommand(v){return /^make\s+(all|one|one dish|(?:number\s*)?\d+|.+)$/i.test(String(v||'').trim());}

    function intercept(input,e){
      const value=String(input.value||'').trim();
      if(approvalCommand(value)){
        e.preventDefault(); e.stopImmediatePropagation(); input.value=''; saveDraft(); return true;
      }
      if(makeCommand(value)&&lastDishIdeas.length){
        e.preventDefault(); e.stopImmediatePropagation(); input.value=''; makeSelected(value); return true;
      }
      return false;
    }

    document.addEventListener('click',function(e){
      const btn=e.target.closest('button');
      if(!btn||!/ask ai/i.test(btn.textContent||'')) return;
      const box=btn.closest('form,.card,section,main')||document;
      const input=box.querySelector('textarea,input[type="text"]');
      if(input) intercept(input,e);
    },true);

    document.addEventListener('submit',function(e){
      const input=e.target.querySelector&&e.target.querySelector('textarea,input[type="text"]');
      if(input) intercept(input,e);
    },true);
  }
  boot();
})();
