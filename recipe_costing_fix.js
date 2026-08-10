// Imported recipe ingredient display + rough costing fix.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;};
  const money=v=>Math.max(0,Math.round((+v||0)*100)/100);
  const priceFromMenu=v=>money(num(v));

  function responseText(r){
    let out=r&&r.output_text||'';
    if(!out){try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}
    return out;
  }
  function parseObject(text){
    const s=String(text||''),a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a<0||b<a)throw new Error('No usable cost estimate returned');
    return JSON.parse(s.slice(a,b+1));
  }
  async function estimateBatchCosts(dishes){
    const out=[];
    for(let start=0;start<dishes.length;start+=5){
      const batch=dishes.slice(start,start+5);
      const payload=batch.map(d=>({
        name:d.name,
        portions:+d.portions||10,
        ingredients:(d.ingredients||[]).map(i=>({name:i.name,qty:+i.qty||0,unit:i.unit||''}))
      }));
      const prompt='Estimate ROUGH UK trade ingredient cost for these pub-kitchen recipe batches for planning only. This is NOT a supplier quote. Return ONLY JSON {"recipes":[{"name":"","estimatedBatchCostGBP":0,"ingredients":[{"name":"","estimatedLineCostGBP":0}]}]}. Preserve recipe and ingredient names exactly. Estimate the cost of the stated batch quantities, not one portion. Use realistic broad catering/wholesale assumptions and avoid false precision.';
      try{
        const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt+'\n\nRECIPES:\n'+JSON.stringify(payload)}]}]})});
        const obj=parseObject(responseText(r));
        if(Array.isArray(obj.recipes))out.push(...obj.recipes);
      }catch(e){console.warn('Rough cost estimate unavailable',e);}
    }
    return out;
  }

  // Reliable importer already does dish detection + detailed recipes. Add costing as a final, small-batch step.
  const baseExtract=aiExtractMenu;
  aiExtractMenu=async function(opts){
    const dishes=await baseExtract(opts);
    if(!Array.isArray(dishes)||!dishes.length)return dishes;
    if(opts&&opts.onProgress)opts.onProgress({stage:'costs',from:1,to:dishes.length,total:dishes.length});
    const estimates=await estimateBatchCosts(dishes);
    dishes.forEach(d=>{
      const e=estimates.find(x=>norm(x.name)===norm(d.name));
      const portions=Math.max(1,+d.portions||10);
      if(e){
        const lines=Array.isArray(e.ingredients)?e.ingredients:[];
        (d.ingredients||[]).forEach(i=>{
          const li=lines.find(x=>norm(x.name)===norm(i.name));
          if(li)i.estimatedLineCost=money(li.estimatedLineCostGBP);
        });
        d.estimatedBatchCost=money(e.estimatedBatchCostGBP || (d.ingredients||[]).reduce((s,i)=>s+(+i.estimatedLineCost||0),0));
        d.estimatedFoodCost=money(d.estimatedBatchCost/portions);
      }
      d.menuPrice=priceFromMenu(d.price);
      d.costEstimate=true;
    });
    return dishes;
  };

  // Persist estimated per-portion food cost and photographed menu price after the normal import save.
  const baseCommit=commitImportedMenu;
  commitImportedMenu=function(name,dishes){
    const result=baseCommit(name,dishes);
    const applyCosts=()=>{
      (dishes||[]).forEach(d=>{
        const r=(STATE.recipes||[]).find(x=>norm(x.name)===norm(d.name));
        if(!r)return;
        if(+d.estimatedFoodCost>0){r.cost=money(d.estimatedFoodCost);r.costEstimate=true;r.costEstimateNote='Rough AI estimate — replace with supplier/stock pricing when known';r.estimatedBatchCost=money(d.estimatedBatchCost);}
        const menuPrice=priceFromMenu(d.menuPrice||d.price);
        if(menuPrice>0)r.price=menuPrice;
        const byName=new Map((d.ingredients||[]).map(i=>[norm(i.name),i]));
        (r.ingredients||[]).forEach(ing=>{
          const src=byName.get(norm(ing.name || (ing.stockId&&stockById(ing.stockId)?.item)));
          if(!src)return;
          if(!ing.name)ing.name=src.name;
          if(!ing.unit)ing.unit=src.unit||'';
          if(!ing.preparation)ing.preparation=src.preparation||'';
          if(+src.estimatedLineCost>0)ing.estimatedLineCost=money(src.estimatedLineCost);
        });
      });
      save('menu rough costs');
    };
    const first=result&&result.persistPromise;
    result.persistPromise=Promise.resolve(first).then(async()=>{applyCosts();if(typeof persist==='function')await persist('menu rough costs and prices');});
    return result;
  };

  // Repair the recipe editor: unlinked imported ingredients are not "removed".
  editRecipe=function(r){
    const isNew=!r;
    r=r||{id:uid('r'),name:'',cat:'Mains',allergens:'',method:'',cost:0,price:0,yield:'1',ingredients:[]};
    r.ingredients=r.ingredients||[];
    const b=el('div',{});
    const estimateNote=r.costEstimate?'<div class="set-note" style="margin:0 0 12px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:9px 11px;font-size:12px;color:var(--muted)">Food cost is a rough planning estimate. Replace it with your actual supplier/stock cost when known.</div>':'';
    b.innerHTML=`<label class="f"><span class="lab">Dish name</span><input class="inp" id="rn" value="${esc(r.name)}"></label>
      <div class="frow"><label class="f"><span class="lab">Category</span><input class="inp" id="rc" value="${esc(r.cat||'')}"></label>
      <label class="f"><span class="lab">Allergens (comma separated)</span><input class="inp" id="ra" value="${esc(r.allergens||'')}"></label></div>
      <label class="f"><span class="lab">Method</span><textarea class="inp" id="rm" rows="7">${esc(r.method||'')}</textarea></label>
      ${estimateNote}<div class="frow"><label class="f"><span class="lab">Food cost £ / portion</span><input class="inp num" id="rco" type="number" step="0.01" value="${+r.cost||0}"></label>
      <label class="f"><span class="lab">Menu price £</span><input class="inp num" id="rpr" type="number" step="0.01" value="${+r.price||0}"></label></div>`;

    b.append(el('div',{class:'lab',style:'font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px'},'Ingredients'));
    const ingBox=el('div',{style:'display:flex;flex-direction:column;gap:6px;margin-bottom:8px'});
    function drawIng(){
      ingBox.innerHTML='';
      if(!r.ingredients.length)ingBox.append(el('div',{class:'muted',style:'font-size:12.5px'},'No ingredients yet.'));
      r.ingredients.forEach((ing,i)=>{
        const s=ing.stockId?stockById(ing.stockId):null;
        const name=(s&&s.item)||ing.name||'Unnamed ingredient';
        const unit=ing.unit || (s&&s.unit) || '';
        const cost=+ing.estimatedLineCost>0?' · ~£'+(+ing.estimatedLineCost).toFixed(2)+' batch':'';
        const row=el('div',{class:'chip',style:'justify-content:space-between;width:100%;align-items:flex-start'});
        row.innerHTML=`<span><b>${esc(name)}</b> <span class="mono muted">${ing.qty!=null?'×'+ing.qty:''}${unit?' '+esc(unit):''}</span>${ing.preparation?`<span class="muted"> · ${esc(ing.preparation)}</span>`:''}<span class="mono muted">${cost}</span>${s?'':' <span class="tag warn" style="margin-left:6px">Not linked to stock</span>'}</span>`;
        row.append(el('button',{class:'x',html:icon('x'),onclick:()=>{r.ingredients.splice(i,1);drawIng();}}));
        ingBox.append(row);
      });
    }
    drawIng();b.append(ingBox);

    const picker=el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
    const sel=el('select',{class:'inp',style:'flex:1;min-width:170px'},el('option',{value:''},'Link / add stock item…'),...STATE.stock.map(s=>el('option',{value:s.id},s.item)));
    const qty=el('input',{class:'inp num',type:'number',step:'0.1',value:'1',style:'max-width:80px'});
    picker.append(sel,qty,el('button',{class:'btn ghost sm',html:icon('plus'),onclick:()=>{if(!sel.value)return;const s=stockById(sel.value);r.ingredients.push({stockId:sel.value,name:s?s.item:'',unit:s?s.unit:'',qty:+qty.value||1});sel.value='';drawIng();}}));
    b.append(picker);

    if(!isNew && (!r.cost || +r.cost<=0) && r.ingredients.length && AI_ENABLED && serverMode){
      b.append(el('button',{class:'btn ghost sm',style:'margin-top:10px',html:icon('bolt')+'Estimate rough food cost',onclick:async e=>{
        const btn=e.currentTarget;btn.disabled=true;btn.textContent='Estimating…';
        const d={name:r.name,portions:Math.max(1,num(r.portions||String(r.yield||'').match(/\d+/)?.[0])||10),ingredients:r.ingredients.map(i=>({name:(i.stockId&&stockById(i.stockId)?.item)||i.name||'',qty:+i.qty||0,unit:i.unit||(i.stockId&&stockById(i.stockId)?.unit)||''}))};
        const est=await estimateBatchCosts([d]);const one=est[0];
        if(one){r.estimatedBatchCost=money(one.estimatedBatchCostGBP);r.cost=money(r.estimatedBatchCost/d.portions);r.costEstimate=true;save('rough recipe cost');m.close();editRecipe(r);toast('Rough food cost added','ok');}
        else{btn.disabled=false;btn.textContent='Estimate rough food cost';toast('Could not estimate cost just now','warn');}
      }}));
    }

    const m=modal({title:isNew?'New recipe':r.name,body:b,footer:[
      isNew?'':el('button',{class:'btn danger',html:'Delete',onclick:()=>{STATE.recipes=STATE.recipes.filter(x=>x.id!==r.id);save('del recipe');m.close();rerender();}}),
      el('button',{class:'btn primary',html:icon('save')+'Save recipe',onclick:()=>{
        Object.assign(r,{name:$('#rn').value.trim()||'Untitled',cat:$('#rc').value,allergens:$('#ra').value,method:$('#rm').value,cost:+$('#rco').value||0,price:+$('#rpr').value||0});
        if(isNew)STATE.recipes.push(r);save('save recipe');m.close();rerender();toast('Recipe saved','ok');
      }})
    ]});
  };
})();
