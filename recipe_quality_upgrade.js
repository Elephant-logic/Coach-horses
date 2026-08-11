// Command de Cuisine: turn imported menu drafts into usable BOH recipes and keep courses accurate.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const validCourse=v=>{
    const n=norm(v);
    if(n==='starter'||n==='starters'||n==='small plates'||n==='small plate')return 'Starter';
    if(n==='main'||n==='mains'||n==='main course'||n==='main courses')return 'Main';
    if(n==='dessert'||n==='desserts'||n==='pudding'||n==='puddings')return 'Dessert';
    if(n==='side'||n==='sides'||n==='extras'||n==='extra')return 'Side';
    return 'Other';
  };
  const responseText=r=>{
    let out=r&&r.output_text||'';
    if(!out){try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}
    return out;
  };
  const parseObject=text=>{
    const s=String(text||''),a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a<0||b<a)throw new Error('AI returned no usable recipe data');
    return JSON.parse(s.slice(a,b+1));
  };
  async function ask(prompt,content){
    const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...(content||[])]}]})});
    return parseObject(responseText(r));
  }

  async function correctCourses(source,recipes){
    if(!recipes.length)return recipes;
    const pages=(Array.isArray(source&&source.images)?source.images:(source&&source.image?[source.image]:[])).filter(Boolean);
    const content=[];
    if(source&&source.text)content.push({type:'input_text',text:'MENU TEXT:\n'+source.text});
    pages.forEach((p,i)=>{content.push({type:'input_text',text:'MENU PAGE '+(i+1)+' OF '+pages.length});content.push({type:'input_image',image_url:p});});
    if(!content.length)return recipes;
    const prompt=[
      'Classify ONLY the listed dishes into the course/section where they actually appear on this menu.',
      'Use printed menu headings and physical placement as the strongest evidence. Do NOT classify from the dish name when a section heading is visible.',
      'For example, a sweet-sounding dish printed under STARTERS is still Starter, and a savoury-sounding dish printed under DESSERTS is still Dessert.',
      'Allowed course values: Starter, Main, Dessert, Side, Other.',
      'Return ONLY JSON {"courses":[{"name":"exact supplied dish name","course":"Starter|Main|Dessert|Side|Other","confidence":0.0}]}',
      'Return one row for every supplied dish. Use Other if the section genuinely cannot be determined.',
      'DISHES: '+JSON.stringify(recipes.map(r=>({name:r.name,description:r.description||''})))
    ].join('\n');
    try{
      const obj=await ask(prompt,content),rows=Array.isArray(obj.courses)?obj.courses:[];
      const map=new Map(rows.map(x=>[norm(x.name),{course:validCourse(x.course),confidence:+x.confidence||0}]));
      return recipes.map(r=>{
        const hit=map.get(norm(r.name));
        if(hit&&hit.course!=='Other'&&hit.confidence>=0.55)return {...r,course:hit.course,category:hit.course,menuCourseConfidence:hit.confidence};
        const existing=validCourse(r.course||r.category);
        return {...r,course:existing,category:existing};
      });
    }catch(e){
      console.warn('Menu course correction failed',e);
      return recipes;
    }
  }

  function normaliseRecipe(base,q){
    const method=Array.isArray(q.method)?q.method:(q.method?[String(q.method)]:[]);
    const prepNotes=Array.isArray(q.prepNotes)?q.prepNotes:(q.prepNotes?[String(q.prepNotes)]:[]);
    const criticalPoints=Array.isArray(q.criticalPoints)?q.criticalPoints:(q.criticalPoints?[String(q.criticalPoints)]:[]);
    const ingredients=(q.ingredients||base.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'each',preparation:''}:{name:String(i.name||'').trim(),qty:Number.isFinite(+i.qty)?+i.qty:(Number.isFinite(+i.quantity)?+i.quantity:1),unit:String(i.unit||'each').trim(),preparation:String(i.preparation||'').trim()}).filter(i=>i.name);
    const course=validCourse(base.course||base.category);
    return {
      ...base,...q,
      name:base.name,
      course,category:course,
      portions:Math.max(1,+q.portions||+base.portions||10),
      yield:String(q.yield||q.portions||base.yield||base.portions||10).replace(/\s*portions?\s*$/i,'')+' portions',
      ingredients,prepNotes,method,criticalPoints,
      allergens:Array.isArray(q.allergens)?q.allergens.join(', '):String(q.allergens||base.allergens||''),
      needsReview:true,needsVerification:true,
      recipeQuality:'full-draft',recipeQualityUpdatedAt:nowISO()
    };
  }

  async function expandRecipes(recipes,onProgress){
    const out=[];
    for(let start=0;start<recipes.length;start+=3){
      const batch=recipes.slice(start,start+3);
      if(onProgress)onProgress(start+1,Math.min(start+3,recipes.length),recipes.length);
      const prompt=[
        'Rewrite these pub dishes as FULL start-to-finish commercial kitchen recipe specifications, not a rough guide.',
        'Return ONLY JSON {"recipes":[...]} and exactly one recipe for every supplied dish. Preserve every dish name and supplied course exactly.',
        'Each recipe is for 10 portions unless the supplied recipe clearly says otherwise.',
        'Each recipe must contain: name, course, description, portions, yield, ingredients, prepNotes, method, criticalPoints, allergens.',
        'INGREDIENTS: include every component needed to make and serve the dish, with practical batch quantities, units and preparation. Include sauces, garnishes, coatings, seasoning and finishing ingredients where appropriate. Do not hide important components behind phrases like “as required” unless genuinely unavoidable.',
        'PREP NOTES: give mise-en-place that can be completed before service: weighing, washing, trimming, chopping, marinating, sauce/base preparation, portioning, storage and labelling where applicable.',
        'METHOD: give 8–16 clear numbered actionable steps covering the complete workflow from raw/prepped ingredients through cooking, resting/holding if relevant, assembly, plating and service. Include sequencing, pan/oven/fryer setup, useful indicative timings and temperatures where appropriate. Do not stop at “cook until done”, “assemble”, or “serve”.',
        'For food-safety temperatures, give standard kitchen guidance only; never imply a temperature was actually measured or logged. Make clear the chef must verify house HACCP requirements.',
        'CRITICAL POINTS: include practical quality controls, allergen/cross-contact reminders, make-ahead/holding limits where sensible and service finish standards.',
        'Do not invent branded products, specialist equipment or an elaborate technique that the menu does not suggest. This is still an AI draft and must be chef/manager reviewed.',
        'DRAFTS TO IMPROVE:\n'+JSON.stringify(batch.map(r=>({name:r.name,course:validCourse(r.course||r.category),description:r.description||'',portions:+r.portions||10,yield:r.yield||'',allergens:r.allergens||'',ingredients:r.ingredients||[],prepNotes:r.prepNotes||[],method:r.method||[],criticalPoints:r.criticalPoints||[]})))
      ].join('\n');
      const obj=await ask(prompt,[]);
      const rows=Array.isArray(obj.recipes)?obj.recipes:[];
      batch.forEach(r=>{
        const q=rows.find(x=>norm(x.name)===norm(r.name))||{};
        out.push(normaliseRecipe(r,q));
      });
    }
    return out;
  }

  // Improve future imports: first use the existing reliable detector, then correct menu sections from the source and expand recipes fully.
  if(typeof aiExtractMenu==='function'){
    const baseExtract=aiExtractMenu;
    aiExtractMenu=async function(args){
      const detected=await baseExtract(args);
      if(!detected||!detected.length)return detected;
      let fixed=await correctCourses(args||{},detected);
      try{
        fixed=await expandRecipes(fixed,(from,to,total)=>{
          if(args&&typeof args.onProgress==='function')args.onProgress({stage:'quality',from,to,total});
        });
      }catch(e){console.warn('Full recipe expansion failed; keeping first-pass drafts',e);}
      return fixed;
    };
  }

  async function reclassifyExisting(recipes){
    if(!recipes.length)return recipes;
    try{
      const prompt=[
        'Review these pub menu dishes and correct obviously wrong course labels.',
        'Allowed values are Starter, Main, Dessert, Side, Other.',
        'Use normal UK pub menu conventions and the dish description/ingredients. Only change a course when you are confident the current label is wrong.',
        'Return ONLY JSON {"courses":[{"name":"exact dish name","course":"Starter|Main|Dessert|Side|Other","confidence":0.0}]}',
        'DISHES:\n'+JSON.stringify(recipes.map(r=>({name:r.name,currentCourse:validCourse(r.course||r.category),description:r.description||'',ingredients:(r.ingredients||[]).map(i=>i.name||'').filter(Boolean)})))
      ].join('\n');
      const obj=await ask(prompt,[]),rows=Array.isArray(obj.courses)?obj.courses:[];
      const map=new Map(rows.map(x=>[norm(x.name),{course:validCourse(x.course),confidence:+x.confidence||0}]));
      return recipes.map(r=>{
        const hit=map.get(norm(r.name));
        if(hit&&hit.course!=='Other'&&hit.confidence>=0.8)return {...r,course:hit.course,category:hit.course};
        return r;
      });
    }catch(e){return recipes;}
  }

  async function upgradeExisting(){
    if(typeof isMgr==='function'&&!isMgr()){toast('Manager access required','warn');return;}
    const targets=(STATE.recipes||[]).filter(r=>(r.createdFrom==='menu-import'||r.aiGenerated)&&!r.approvedBy);
    if(!targets.length){toast('There are no unapproved imported recipe drafts to upgrade','ok');return;}
    const body=el('div',{});
    body.append(el('p',{class:'muted',style:'margin-top:0'},'This will rebuild '+targets.length+' imported AI draft'+(targets.length===1?'':'s')+' into fuller start-to-finish kitchen recipes. Approved chef recipes are left alone. Course labels will only be changed when the AI is highly confident they are wrong.'));
    const status=el('div',{class:'set-note'},'Ready to improve recipes.');body.append(status);
    const m=modal({title:'Improve imported recipe drafts',body,footer:[
      el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),
      el('button',{class:'btn primary',html:icon('assistant')+'Improve recipes',onclick:async e=>{
        const btn=e.currentTarget;btn.disabled=true;btn.textContent='Improving…';
        try{
          status.textContent='Checking starter / main / dessert / side labels…';
          let revised=await reclassifyExisting(targets);
          status.textContent='Writing full start-to-finish recipes…';
          revised=await expandRecipes(revised,(from,to,total)=>status.textContent='Improving recipes '+from+'–'+to+' of '+total+'…');
          const byId=new Map(revised.map(r=>[r.id,r]));
          STATE.recipes=STATE.recipes.map(r=>byId.get(r.id)||r);
          audit('upgrade_imported_recipes',revised.length+' imported AI drafts upgraded');
          save('upgrade imported recipes');
          if(typeof persist==='function')await persist('upgrade imported recipes');
          m.close();toast(revised.length+' recipes upgraded','ok');rerender();
        }catch(err){btn.disabled=false;btn.innerHTML=icon('assistant')+'Improve recipes';status.textContent='Could not finish: '+((err&&err.message)||err);toast('Recipe upgrade failed — existing recipes were kept','bad');}
      }})
    ]});
  }

  if(typeof VIEWS!=='undefined'&&typeof VIEWS.recipes==='function'){
    const baseRecipes=VIEWS.recipes;
    VIEWS.recipes=function(v){
      const targets=(STATE.recipes||[]).filter(r=>(r.createdFrom==='menu-import'||r.aiGenerated)&&!r.approvedBy);
      if(targets.length&&(!isMgr||isMgr())){
        const card=el('div',{class:'card',style:'margin-bottom:14px;border-color:#5a3f26'});
        card.append(el('div',{class:'card-head'},el('div',{},el('h3',{},'Imported recipe quality'),el('div',{class:'muted',style:'font-size:12.5px'},'Turn rough AI guides into full start-to-finish BOH recipe drafts.')),el('div',{class:'spacer'}),el('button',{class:'btn primary sm',html:icon('assistant')+'Improve '+targets.length+' drafts',onclick:upgradeExisting})));
        v.append(card);
      }
      baseRecipes(v);
    };
  }
})();
