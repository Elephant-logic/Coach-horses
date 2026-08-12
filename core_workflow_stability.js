// Command de Cuisine: consolidated stability for menu import + Chef AI speech.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const cleanDish=s=>String(s||'').toLowerCase()
    .replace(/&/g,' and ')
    .replace(/\bwith\b/g,' ')
    .replace(/[£$€]\s*\d+(?:[.,]\d+)?/g,' ')
    .replace(/\b(v|vg|ve|gf|df)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim().replace(/\s+/g,' ');
  const number=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;};

  function dishTokens(s){return cleanDish(s).split(' ').filter(x=>x.length>1);}
  function sameDish(a,b){
    const ca=cleanDish(a),cb=cleanDish(b);
    if(!ca||!cb)return false;
    if(ca===cb)return true;
    const A=new Set(dishTokens(a)),B=new Set(dishTokens(b));
    let shared=0;A.forEach(x=>{if(B.has(x))shared++;});
    const overlap=shared/Math.max(A.size||1,B.size||1);
    const containment=(ca.includes(cb)||cb.includes(ca))&&Math.min(ca.length,cb.length)>=8;
    return overlap>=0.9||containment;
  }

  function mergeDishes(rows){
    const out=[];
    (rows||[]).forEach(d=>{
      if(!d||!String(d.name||'').trim())return;
      const found=out.find(x=>sameDish(x.name,d.name));
      if(!found){out.push({...d});return;}
      if(!found.description&&d.description)found.description=d.description;
      if(!found.price&&d.price)found.price=d.price;
      if(!found.allergens&&d.allergens)found.allergens=d.allergens;
      if((!found.course||found.course==='Other')&&d.course&&d.course!=='Other'){
        found.course=d.course;found.category=d.category||d.course;
      }
    });
    return out;
  }

  function responseText(r){
    let out=r&&r.output_text||'';
    if(!out){try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}
    return out;
  }
  function parseObject(text){
    const s=String(text||''),a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a<0||b<a)throw new Error('AI returned no usable JSON');
    return JSON.parse(s.slice(a,b+1));
  }
  async function callAI(prompt,content,timeoutMs=65000){
    const run=()=>api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...(content||[])]}]})}).then(r=>parseObject(responseText(r)));
    for(let attempt=0;attempt<2;attempt++){
      let timer;
      try{
        return await Promise.race([
          run(),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('AI batch timed out')),timeoutMs);})
        ]);
      }catch(err){
        if(attempt===1)throw err;
        console.warn('AI batch failed; retrying once',err);
      }finally{if(timer)clearTimeout(timer);}
    }
  }

  function courseValue(v){
    const n=norm(v);
    if(/^(starter|starters|small plate|small plates|appetiser|appetizer)$/.test(n))return 'Starter';
    if(/^(main|mains|main course|main courses)$/.test(n))return 'Main';
    if(/^(dessert|desserts|pudding|puddings)$/.test(n))return 'Dessert';
    if(/^(side|sides|extra|extras)$/.test(n))return 'Side';
    return 'Other';
  }

  async function detectPage(image,page,total){
    const prompt=[
      'Read this ONE page of a UK pub food menu and return every distinct named food dish.',
      'Use the PRINTED SECTION HEADING and physical placement to set course. The section heading is authoritative: a dish printed under STARTERS is Starter even if its name sounds sweet; a dish under DESSERTS is Dessert even if its name sounds savoury.',
      'Allowed course values: Starter, Main, Dessert, Side, Other.',
      'Do not treat headings, prices, drinks, descriptive prose or add-ons without a standalone dish name as dishes.',
      'Return ONLY JSON {"dishes":[{"name":"exact menu dish name","course":"Starter|Main|Dessert|Side|Other","description":"menu wording if visible","price":"visible price if any","allergens":"only allergens explicitly visible, otherwise empty"}]}.',
      'Preserve dish names exactly. This is page '+page+' of '+total+'.'
    ].join('\n');
    const obj=await callAI(prompt,[{type:'input_image',image_url:image}],45000);
    return Array.isArray(obj.dishes)?obj.dishes:[];
  }

  async function detectText(text){
    const prompt=[
      'Read this UK pub food menu text and return every distinct named food dish.',
      'Use section headings to set course. Headings are authoritative and must not be overridden from the dish name.',
      'Allowed course values: Starter, Main, Dessert, Side, Other.',
      'Return ONLY JSON {"dishes":[{"name":"exact dish name","course":"Starter|Main|Dessert|Side|Other","description":"menu wording","price":"","allergens":"only if explicitly stated"}]}.',
      'MENU:\n'+text
    ].join('\n');
    const obj=await callAI(prompt,[],45000);
    return Array.isArray(obj.dishes)?obj.dishes:[];
  }

  async function buildRecipes(dishes,onProgress){
    const completed=[];
    for(let start=0;start<dishes.length;start+=3){
      const batch=dishes.slice(start,start+3);
      if(onProgress)onProgress(start+1,Math.min(start+batch.length,dishes.length),dishes.length);
      const prompt=[
        'Create FULL start-to-finish commercial pub-kitchen recipe DRAFTS for the supplied dishes.',
        'Return ONLY JSON {"recipes":[...]} and exactly one recipe for each supplied dish. Preserve each dish name and supplied course exactly.',
        'Use 10 portions unless otherwise stated.',
        'Each recipe must include: name, course, description, portions, yield, ingredients, prepNotes, method, criticalPoints, allergens.',
        'Ingredients must include every component needed to make and serve the dish, with practical quantities, units and preparation, including sauces, garnishes, coatings, seasoning and finishes where relevant.',
        'Prep notes must cover useful mise-en-place before service.',
        'Method must contain 8-16 numbered, actionable steps from preparation through cooking, assembly, plating and service. Include useful timings and indicative temperatures where sensible. Do not stop at vague phrases such as cook until done, assemble or serve.',
        'Critical points should cover quality, allergen/cross-contact reminders, sensible holding/storage guidance and service finish. Never claim a temperature was measured or recorded.',
        'These remain AI drafts and must be chef/manager verified.',
        'DISHES:\n'+JSON.stringify(batch.map(d=>({name:d.name,course:courseValue(d.course||d.category),description:d.description||'',price:d.price||'',allergens:d.allergens||''})))
      ].join('\n');
      const obj=await callAI(prompt,[],65000);
      const rows=Array.isArray(obj.recipes)?obj.recipes:[];
      batch.forEach(d=>{
        const r=rows.find(x=>norm(x.name)===norm(d.name))||{};
        const course=courseValue(d.course||d.category);
        completed.push({
          ...d,...r,name:d.name,course,category:course,
          description:String(r.description||d.description||'').trim(),
          allergens:Array.isArray(r.allergens)?r.allergens.join(', '):String(r.allergens||d.allergens||''),
          portions:Math.max(1,number(r.portions)||10),
          yield:String(r.yield||r.portions||10).replace(/\s*portions?\s*$/i,'')+' portions',
          ingredients:(r.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'each',preparation:''}:{name:String(i.name||'').trim(),qty:Math.max(.01,number(i.qty||i.quantity)||1),unit:String(i.unit||'each').trim(),preparation:String(i.preparation||'').trim()}).filter(i=>i.name),
          prepNotes:Array.isArray(r.prepNotes)?r.prepNotes:(r.prepNotes?[String(r.prepNotes)]:[]),
          method:Array.isArray(r.method)?r.method:(r.method?[String(r.method)]:[]),
          criticalPoints:Array.isArray(r.criticalPoints)?r.criticalPoints:(r.criticalPoints?[String(r.criticalPoints)]:[]),
          needsReview:true,needsVerification:true,recipeQuality:'full-draft'
        });
      });
    }
    return completed;
  }

  // Final owner of future menu extraction. One detection pass + one full recipe pass only.
  aiExtractMenu=async function({text,image,images,onProgress}){
    try{
      const pages=(Array.isArray(images)?images:(image?[image]:[])).filter(Boolean);
      let detected=[];
      if(pages.length){
        const rows=[];
        for(let i=0;i<pages.length;i++){
          if(onProgress)onProgress({stage:'detect',page:i+1,totalPages:pages.length});
          rows.push(...await detectPage(pages[i],i+1,pages.length));
        }
        detected=mergeDishes(rows);
      }else if(text){
        detected=mergeDishes(await detectText(text));
      }
      if(!detected.length)return null;
      if(onProgress)onProgress({stage:'detected',count:detected.length});
      return await buildRecipes(detected,(from,to,total)=>onProgress&&onProgress({stage:'recipes',from,to,total}));
    }catch(err){
      console.error('Menu import failed safely',err);
      return null;
    }
  };

  if(typeof commitImportedMenu==='function'){
    const baseCommit=commitImportedMenu;
    commitImportedMenu=function(name,dishes){return baseCommit(name,mergeDishes(dishes));};
  }

  // One TTS owner for Chef. Normal free-form AI answers speak even though older askAI calls chefSay(..., false).
  const synth=window.speechSynthesis;
  let aiReplyDepth=0,lastSpoken='',lastSpokenAt=0,unlocked=false;
  function speechEnabled(){return !!(synth&&typeof SpeechSynthesisUtterance!=='undefined'&&STATE&&STATE.settings&&STATE.settings.speak!==false);}
  function cleanSpeech(text){return String(text||'').replace(/[*_`#>|]/g,' ').replace(/\bhttps?:\/\/\S+/gi,'link').replace(/\s+/g,' ').trim();}
  function bestVoice(){
    const voices=synth&&synth.getVoices?synth.getVoices():[];
    return voices.find(v=>/^en[-_]GB$/i.test(v.lang))||voices.find(v=>/^en[-_]GB/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||null;
  }
  function stopSpeech(){try{if(synth)synth.cancel();}catch{}}
  function speak(text){
    if(!speechEnabled())return;
    const spoken=cleanSpeech(text);if(!spoken)return;
    const now=Date.now();if(spoken===lastSpoken&&now-lastSpokenAt<1500)return;
    lastSpoken=spoken;lastSpokenAt=now;
    try{
      synth.cancel();
      const u=new SpeechSynthesisUtterance(spoken);u.lang='en-GB';u.rate=1;u.pitch=1;u.volume=1;
      const v=bestVoice();if(v)u.voice=v;
      setTimeout(()=>{if(speechEnabled())synth.speak(u);},40);
    }catch(e){console.warn('Chef speech failed',e);}
  }
  function unlockSpeech(){
    if(unlocked||!speechEnabled())return;unlocked=true;
    try{const u=new SpeechSynthesisUtterance('\u00a0');u.lang='en-GB';u.volume=.01;u.rate=10;synth.speak(u);setTimeout(stopSpeech,20);}catch{}
  }
  document.addEventListener('pointerdown',unlockSpeech,{once:true,capture:true});
  document.addEventListener('keydown',unlockSpeech,{once:true,capture:true});

  if(typeof askAI==='function'){
    const baseAsk=askAI;
    askAI=async function(){aiReplyDepth++;try{return await baseAsk.apply(this,arguments);}finally{aiReplyDepth--;}};
  }
  if(typeof chefSay==='function'){
    const baseChefSay=chefSay;
    chefSay=function(text,allowSpeech){
      const settings=STATE&&STATE.settings,wanted=!!(settings&&settings.speak!==false);
      if(settings)settings.speak=false;
      let result;
      try{result=baseChefSay.apply(this,arguments);}finally{if(settings)settings.speak=wanted;}
      const loading=/^let me check[….\.\s]*$/i.test(String(text||'').trim());
      if(wanted&&!loading&&(allowSpeech!==false||aiReplyDepth>0))speak(text);
      return result;
    };
  }
  if(typeof VIEWS!=='undefined'&&typeof VIEWS.assistant==='function'){
    const baseAssistant=VIEWS.assistant;
    VIEWS.assistant=function(v){
      baseAssistant(v);
      setTimeout(()=>{
        const row=[...v.querySelectorAll('label')].find(x=>/Read answers aloud/i.test(x.textContent||''));
        const cb=row&&row.querySelector('input[type="checkbox"]');
        if(!cb||cb.dataset.ttsBound)return;
        cb.dataset.ttsBound='1';
        cb.addEventListener('change',()=>{if(!cb.checked)stopSpeech();else unlockSpeech();});
      },0);
    };
  }
  window.ChefTTS={speak,stop:stopSpeech,enabled:speechEnabled};
})();
