// Command de Cuisine: persist imported menus and build useful recipe drafts for every dish.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const asText=v=>Array.isArray(v)?v.filter(Boolean).join('\n'):String(v||'').trim();
  const uniqueCsv=(a,b)=>[...new Set([...(String(a||'').split(',')),...(String(b||'').split(','))].map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/^./,c=>c.toUpperCase())))].join(', ');

  function recipeMethod(d){
    const parts=[];
    if(d.description)parts.push('Dish: '+d.description.trim());
    if(d.yield)parts.push('Yield / portion: '+String(d.yield).trim());
    if(d.prepNotes)parts.push('Prep notes: '+asText(d.prepNotes));
    const method=asText(d.method);
    if(method)parts.push('Method:\n'+method);
    if(d.criticalPoints)parts.push('Kitchen notes:\n'+asText(d.criticalPoints));
    parts.push('AI IMPORT DRAFT — chef/manager must verify quantities, method and allergens before this recipe is treated as approved.');
    return parts.join('\n\n');
  }

  // Read all menu pages as one menu and return full recipe drafts, not just dish names.
  aiExtractMenu=async function({text,image,images}){
    try{
      const pages=(Array.isArray(images)?images:(image?[image]:[])).filter(Boolean);
      const schema='Return strict JSON only: an array of dishes. Each dish must have {"name":"","category":"Starter|Main|Dessert|Side|Other","description":"short menu description","allergens":"comma separated UK 14 allergens that are evident or likely — do not claim certainty","yield":"1 portion","prepNotes":["specific mise-en-place/prep notes"],"method":["clear numbered cooking/assembly steps"],"criticalPoints":["useful quality or food-safety checks without inventing a recorded temperature"],"ingredients":[{"name":"","qty":0,"unit":"g|kg|ml|l|ea|slice|tbsp|tsp|portion","preparation":"trimmed/diced/etc"}]}. Build a practical pub-kitchen recipe draft for EVERY dish. Use realistic per-portion quantities where the menu does not state them, but make clear through the data being an AI draft rather than a verified house specification. Preserve menu dish names. Treat all supplied images as consecutive pages of ONE menu in order. Do not duplicate dishes that overlap between pages.';
      const content=[{type:'input_text',text:schema}];
      if(text)content.push({type:'input_text',text:'MENU TEXT:\n'+text});
      pages.forEach((page,i)=>{
        content.push({type:'input_text',text:'MENU PAGE '+(i+1)+' OF '+pages.length});
        content.push({type:'input_image',image_url:page});
      });
      const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4o-mini',input:[{role:'user',content}]})});
      let out=r.output_text||'';
      if(!out){try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}
      const start=out.indexOf('['),end=out.lastIndexOf(']');
      if(start<0||end<start)return null;
      const arr=JSON.parse(out.slice(start,end+1));
      const seen=new Set();
      return arr.map(d=>({
        name:String(d.name||'').trim(),
        category:d.category||'Mains',
        description:String(d.description||'').trim(),
        allergens:String(d.allergens||'').trim(),
        yield:String(d.yield||'1 portion').trim(),
        prepNotes:Array.isArray(d.prepNotes)?d.prepNotes:(d.prepNotes?[String(d.prepNotes)]:[]),
        method:Array.isArray(d.method)?d.method:(d.method?[String(d.method)]:[]),
        criticalPoints:Array.isArray(d.criticalPoints)?d.criticalPoints:(d.criticalPoints?[String(d.criticalPoints)]:[]),
        ingredients:(d.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'ea',preparation:''}:{name:String(i.name||'').trim(),qty:Number.isFinite(+i.qty)?+i.qty:1,unit:String(i.unit||'').trim(),preparation:String(i.preparation||'').trim()}).filter(i=>i.name)
      })).filter(d=>d.name&&(!seen.has(norm(d.name))&&seen.add(norm(d.name))));
    }catch(e){return null;}
  };

  function applyImportedMenu(name,dishes){
    STATE.recipes=Array.isArray(STATE.recipes)?STATE.recipes:[];
    STATE.menus=Array.isArray(STATE.menus)?STATE.menus:[];
    let linked=0,createdCount=0,updatedCount=0;
    const unlinkedNames=new Set(), dishIds=[];

    (dishes||[]).filter(d=>d&&String(d.name||'').trim()).forEach(d=>{
      const ingredients=(d.ingredients||[]).map(ing=>{
        const nm=String(ing.name||ing||'').trim(); if(!nm)return null;
        const s=stockByName(nm);
        const row={name:s?s.item:nm,qty:Number.isFinite(+ing.qty)?+ing.qty:1,unit:String(ing.unit||(s&&s.unit)||'').trim(),preparation:String(ing.preparation||'').trim()};
        if(s){row.stockId=s.id;linked++;}else unlinkedNames.add(nm);
        return row;
      }).filter(Boolean);
      const detailedMethod=recipeMethod(d);
      let r=STATE.recipes.find(x=>norm(x.name)===norm(d.name));
      if(r){
        // Enrich an existing recipe without wiping a chef's established specification.
        r.cat=r.cat||d.category||'Mains';
        r.allergens=uniqueCsv(r.allergens,d.allergens);
        r.description=r.description||d.description||'';
        r.yield=r.yield||d.yield||'1 portion';
        r.prepNotes=(r.prepNotes&&r.prepNotes.length)?r.prepNotes:(d.prepNotes||[]);
        r.criticalPoints=(r.criticalPoints&&r.criticalPoints.length)?r.criticalPoints:(d.criticalPoints||[]);
        if(!r.method||String(r.method).trim().length<40)r.method=detailedMethod;
        if(!Array.isArray(r.ingredients)||!r.ingredients.length)r.ingredients=ingredients;
        r.menuImportUpdatedAt=nowISO();
        if(!r.approvedBy)r.needsReview=true;
        updatedCount++;
      }else{
        r={id:uid('r'),name:String(d.name).trim(),cat:d.category||'Mains',description:d.description||'',allergens:d.allergens||'',method:detailedMethod,cost:0,price:0,yield:d.yield||'1 portion',ingredients,prepNotes:d.prepNotes||[],criticalPoints:d.criticalPoints||[],aiGenerated:true,needsReview:true,createdFrom:'menu-import',createdAt:nowISO()};
        STATE.recipes.push(r);createdCount++;
      }
      dishIds.push(r.id);
    });

    let menu=STATE.menus.find(m=>norm(m.name)===norm(name));
    if(menu){menu.dishIds=[...new Set(dishIds)];menu.updatedAt=nowISO();menu.source='menu-import';}
    else{menu={id:uid('m'),name,dishIds:[...new Set(dishIds)],source:'menu-import',createdAt:nowISO()};STATE.menus.push(menu);}
    audit('import_menu',name+' ('+dishIds.length+' dishes; '+createdCount+' recipes created; '+updatedCount+' enriched)');
    return {menu,linked,unlinkedNames:[...unlinkedNames],recipesCreated:createdCount,recipesUpdated:updatedCount,dishIds:[...dishIds]};
  }

  async function ensureImportPersisted(payload,result){
    save('import menu + detailed recipes');
    if(typeof persist!=='function')return;
    await persist('import menu + detailed recipes');
    // A shared-state revision conflict reloads the newer server state. If that
    // happened during import, re-apply once onto that newer state and persist.
    const exists=STATE.menus.some(m=>norm(m.name)===norm(payload.name)&&result.dishIds.every(id=>(m.dishIds||[]).includes(id)));
    if(!exists){
      const retry=applyImportedMenu(payload.name,payload.dishes);
      await persist('retry menu import after shared-state conflict');
      result.menu=retry.menu;result.linked=retry.linked;result.unlinkedNames=retry.unlinkedNames;result.recipesCreated+=retry.recipesCreated;result.recipesUpdated+=retry.recipesUpdated;result.dishIds=retry.dishIds;
    }
  }

  commitImportedMenu=function(name,dishes){
    const payload={name:String(name||'Imported menu').trim()||'Imported menu',dishes:JSON.parse(JSON.stringify(dishes||[]))};
    const result=applyImportedMenu(payload.name,payload.dishes);
    result.persistPromise=ensureImportPersisted(payload,result);
    return result;
  };

  // Add visible cues to imported recipe cards so managers know which drafts need sign-off.
  const baseRecipes=VIEWS.recipes;
  VIEWS.recipes=function(v){
    const pending=(STATE.recipes||[]).filter(r=>r.needsReview).length;
    if(pending){
      const note=el('div',{class:'card',style:'margin-bottom:14px;border-color:#5a3f26'});
      note.append(el('div',{class:'card-head'},el('h3',{},'Imported recipe drafts'),el('div',{class:'spacer'}),el('span',{class:'tag warn'},pending+' to review')),
        el('div',{class:'muted',style:'font-size:12.5px'},'Menu imports now create full recipe drafts with quantities, prep and methods. Check the house specification and allergens before treating them as approved.'));
      v.append(note);
    }
    baseRecipes(v);
  };
})();
