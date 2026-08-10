// Reliable menu import: restore the original two-stage behaviour in the Command de Cuisine UI.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;};

  function responseText(r){
    let out=r&&r.output_text||'';
    if(!out){try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}
    return out;
  }
  function parseObject(text){
    const s=String(text||'');
    const a=s.indexOf('{'),b=s.lastIndexOf('}');
    if(a<0||b<a)throw new Error('The menu reader returned no usable JSON');
    return JSON.parse(s.slice(a,b+1));
  }
  async function askAI(prompt,content,model='gpt-4.1-mini'){
    const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model,input:[{role:'user',content:[{type:'input_text',text:prompt},...(content||[])]}]})});
    return parseObject(responseText(r));
  }

  function courseOf(d){
    const raw=String(d.course||d.category||'Other').trim();
    const n=norm(raw+' '+(d.name||''));
    if(/dessert|pudding|sweet|ice cream|sorbet|cheesecake|brownie|tart|crumble/.test(n))return 'Dessert';
    if(/starter|small plate|appetiser|appetizer/.test(n))return 'Starter';
    if(/side|extras?/.test(n))return 'Side';
    if(/main|grill|burger|fish|pie|salad|sandwich|steak/.test(n))return 'Main';
    return raw||'Other';
  }

  async function detectOnePage(image,pageNo,total){
    const prompt='Read this ONE page of a pub food menu. Find EVERY distinct named food dish/item on this page. Do not create recipes yet. Do not omit items because they look simple, are in boxes, are sides, sharers, children items or desserts. Do not treat headings, prices, drinks, add-ons with no standalone dish name, or descriptive prose as dishes. Return ONLY JSON {"dishes":[{"name":"exact menu dish name","course":"Starter|Main|Dessert|Side|Other","description":"menu wording if visible","price":"visible price if any","allergens":"only allergens explicitly visible on the menu, otherwise empty"}]}. Preserve dish names exactly and keep separate dishes separate.';
    const obj=await askAI(prompt,[{type:'input_text',text:'PAGE '+pageNo+' OF '+total},{type:'input_image',image_url:image}]);
    return Array.isArray(obj.dishes)?obj.dishes:[];
  }

  function mergeDetected(pages){
    const out=[],byName=new Map();
    pages.flat().forEach(d=>{
      const name=String(d&&d.name||'').trim(); if(!name)return;
      const k=norm(name);
      if(!byName.has(k)){
        const row={name,course:courseOf(d),category:courseOf(d),description:String(d.description||'').trim(),price:d.price||'',allergens:d.allergens||''};
        byName.set(k,row);out.push(row);
      }else{
        const row=byName.get(k);
        if(!row.description&&d.description)row.description=String(d.description).trim();
        if(!row.price&&d.price)row.price=d.price;
        if(!row.allergens&&d.allergens)row.allergens=d.allergens;
      }
    });
    return out;
  }

  async function completeRecipes(dishes,onProgress){
    const completed=[];
    for(let start=0;start<dishes.length;start+=5){
      const batch=dishes.slice(start,start+5);
      if(onProgress)onProgress(start,Math.min(start+batch.length,dishes.length),dishes.length);
      const prompt='Turn these pub menu dishes into complete editable commercial-kitchen recipe DRAFTS. Return ONLY JSON {"recipes":[...]}. Preserve every supplied dish name exactly and return one recipe for every supplied dish. Every recipe must include: name, course, description, portions (use 10), ingredients as at least 3 objects with name, positive numeric qty, practical unit and preparation where useful; prepNotes; method as clear numbered kitchen steps; criticalPoints; allergens; needsVerification true. Use g, kg, ml, l, each, tin, pack or bunch. Quantities must be internally consistent for 10 portions and suitable for scaling. These are working drafts: do not claim inferred allergens or quantities are verified house specifications.';
      const obj=await askAI(prompt+'\n\nDISHES:\n'+JSON.stringify(batch.map(d=>({name:d.name,course:courseOf(d),description:d.description||'',price:d.price||'',allergens:d.allergens||''}))));
      if(!Array.isArray(obj.recipes))throw new Error('No complete recipes were returned for dishes '+(start+1)+'–'+Math.min(start+5,dishes.length));
      completed.push(...obj.recipes);
    }
    return dishes.map(d=>{
      const r=completed.find(x=>norm(x.name)===norm(d.name))||{};
      return {
        ...d,...r,
        name:d.name,
        category:courseOf(r.name?r:d),course:courseOf(r.name?r:d),
        description:String(r.description||d.description||'').trim(),
        allergens:Array.isArray(r.allergens)?r.allergens.join(', '):String(r.allergens||d.allergens||''),
        yield:String(r.yield||r.portions||10)+' portions',
        portions:Math.max(1,num(r.portions)||10),
        prepNotes:Array.isArray(r.prepNotes)?r.prepNotes:(r.prepNotes?[String(r.prepNotes)]:[]),
        method:Array.isArray(r.method)?r.method:(r.method?[String(r.method)]:[]),
        criticalPoints:Array.isArray(r.criticalPoints)?r.criticalPoints:(r.criticalPoints?[String(r.criticalPoints)]:[]),
        ingredients:(r.ingredients||[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'each',preparation:''}:{name:String(i.name||'').trim(),qty:Math.max(.01,num(i.qty||i.quantity)||1),unit:String(i.unit||'each').trim(),preparation:String(i.preparation||'').trim()}).filter(i=>i.name),
        needsReview:true,needsVerification:true
      };
    });
  }

  aiExtractMenu=async function({text,image,images,onProgress}){
    try{
      let detected=[];
      const pages=(Array.isArray(images)?images:(image?[image]:[])).filter(Boolean);
      if(pages.length){
        const perPage=[];
        for(let i=0;i<pages.length;i++){
          if(onProgress)onProgress({stage:'detect',page:i+1,totalPages:pages.length});
          perPage.push(await detectOnePage(pages[i],i+1,pages.length));
        }
        detected=mergeDetected(perPage);
      }else if(text){
        const obj=await askAI('Read this pub food menu text and return ONLY JSON {"dishes":[{"name":"exact dish name","course":"Starter|Main|Dessert|Side|Other","description":"menu wording","price":"","allergens":"only if explicitly stated"}]}. Include every distinct named food item. Do not create recipes yet.\n\nMENU:\n'+text,[]);
        detected=mergeDetected([Array.isArray(obj.dishes)?obj.dishes:[]]);
      }
      if(!detected.length)return null;
      if(onProgress)onProgress({stage:'detected',count:detected.length});
      return await completeRecipes(detected,(from,to,total)=>onProgress&&onProgress({stage:'recipes',from:from+1,to,total}));
    }catch(e){
      console.error('Reliable menu import failed',e);
      return null;
    }
  };

  function readFileAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not read image'));r.readAsDataURL(file);});}
  async function prepareImage(file){
    const raw=await readFileAsDataURL(file);
    if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||'')||file.size<=2500000)return raw;
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{try{const max=2200,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',0.9));}catch{resolve(raw);}};
      img.onerror=()=>resolve(raw);img.src=raw;
    });
  }

  importMenu=function(){
    let photos=[],dishes=null,tab='photo',busy=false;
    const b=el('div',{}),seg=el('div',{class:'seg',style:'margin-bottom:14px'}),body=el('div',{});
    const nameInp=el('input',{class:'inp',value:'Imported menu',style:'margin-bottom:12px'});
    const status=el('div',{class:'muted',style:'font-size:12.5px;margin:8px 0'});
    function setStatus(t){status.textContent=t||'';}
    function setTab(t){if(busy)return;tab=t;[...seg.children].forEach(c=>c.classList.toggle('on',c.dataset.t===t));draw();}
    seg.append(el('button',{'data-t':'photo',onclick:()=>setTab('photo')},'Photos / files'),el('button',{'data-t':'paste',onclick:()=>setTab('paste')},'Paste / type'));

    function showPreview(){
      body.innerHTML='';
      body.append(el('div',{class:'eyebrow',style:'margin-bottom:8px'},'Found '+dishes.length+' dishes — check the list before saving'));
      body.append(el('div',{class:'muted',style:'font-size:12px;margin-bottom:10px'},'Each dish now has a detailed recipe draft. Remove anything that is not actually a dish.'));
      dishes.forEach((d,i)=>{
        const row=el('div',{class:'docket',style:'margin-bottom:6px;align-items:flex-start'}),wrap=el('div',{style:'flex:1'});
        wrap.append(el('div',{class:'dk-t'},d.name),el('div',{class:'dk-s'},courseOf(d)+' · '+(d.ingredients||[]).length+' ingredients · '+((d.method||[]).length||'method ready')));
        row.append(wrap,el('button',{class:'x',html:icon('trash'),onclick:()=>{dishes.splice(i,1);showPreview();}}));body.append(row);
      });
      footerSave.style.display='';setStatus(dishes.length+' dishes ready to save as one menu with '+dishes.length+' recipe drafts.');
    }

    async function runRead(images,text){
      busy=true;footerSave.style.display='none';
      dishes=await aiExtractMenu({images,text,onProgress:p=>{
        if(p.stage==='detect')setStatus('Reading menu page '+p.page+' of '+p.totalPages+' — finding every dish…');
        else if(p.stage==='detected')setStatus('Found '+p.count+' dishes. Now creating the detailed recipes in small batches…');
        else if(p.stage==='recipes')setStatus('Creating detailed recipes '+p.from+'–'+p.to+' of '+p.total+'…');
      }});
      busy=false;
      if(!dishes||!dishes.length){setStatus('I could not read enough usable dishes from those images. Nothing was saved.');toast("Couldn't read the menu properly — try clearer photos",'warn');draw();return;}
      showPreview();
    }

    function drawPhoto(){
      body.innerHTML='';
      if(!AI_ENABLED||!serverMode){body.innerHTML='<div class="empty">'+icon('camera')+'<h4>Photo import needs AI</h4><div>The server AI connection is required for menu photos.</div></div>';return;}
      const picker=el('input',{type:'file',accept:'image/*,.jpg,.jpeg,.png,.webp,.heic,.heif',multiple:true,style:'display:none'});
      const thumbs=el('div',{class:'photo-grid',style:'margin:10px 0'});
      function paint(){thumbs.innerHTML='';photos.forEach((p,i)=>{const w=el('div',{style:'position:relative;width:112px'});w.append(el('img',{class:'photo-thumb',src:p.data,style:'width:112px;height:112px'}),el('div',{class:'mono muted',style:'font-size:10px;margin-top:3px'},(i+1)+'. '+p.name),el('button',{class:'x',style:'position:absolute;right:3px;top:3px;background:var(--panel);border-radius:50%',html:icon('x'),onclick:()=>{photos.splice(i,1);paint();}}));thumbs.append(w);});setStatus(photos.length?photos.length+' menu page'+(photos.length===1?'':'s')+' selected. Each page will be read separately for accuracy.':'Choose all menu pages.');}
      picker.addEventListener('change',async()=>{const files=[...(picker.files||[])];if(photos.length+files.length>10){toast('Use up to 10 pages per import','warn');return;}for(const f of files)photos.push({name:f.name,data:await prepareImage(f)});picker.value='';paint();});
      body.append(el('button',{class:'btn ghost',html:icon('camera')+(photos.length?'Add more pages':'Choose menu photos / files'),onclick:()=>picker.click()}),picker,status,thumbs);
      body.append(el('button',{class:'btn primary',html:icon('bolt')+'Read complete menu',onclick:()=>{if(!photos.length){toast('Choose at least one menu photo','warn');return;}runRead(photos.map(p=>p.data),null);}}));paint();
    }

    function drawPaste(){
      body.innerHTML='';const ta=el('textarea',{class:'inp',rows:'8',placeholder:'Paste the full menu text here…'});body.append(ta,status,el('button',{class:'btn primary',html:icon('bolt')+'Read complete menu',onclick:()=>{if(!ta.value.trim())return toast('Paste the menu first','warn');runRead(null,ta.value);}}));
    }
    function draw(){if(tab==='photo')drawPhoto();else drawPaste();}

    b.append(lf('Menu name',nameInp),seg,body);
    const footerSave=el('button',{class:'btn primary',style:'display:none',html:icon('save')+'Save menu & recipes',onclick:async()=>{
      if(busy||!dishes||!dishes.length)return;
      busy=true;footerSave.disabled=true;setStatus('Saving the menu and every recipe…');
      try{
        const result=commitImportedMenu(nameInp.value.trim()||'Imported menu',dishes);
        if(result&&result.persistPromise)await result.persistPromise;
        const savedMenu=(STATE.menus||[]).find(x=>norm(x.name)===norm(nameInp.value.trim()||'Imported menu'));
        if(!savedMenu||!(savedMenu.dishIds||[]).length)throw new Error('The menu did not remain in saved state');
        setStatus('Saved: '+savedMenu.dishIds.length+' dishes and recipes.');
        toast('Menu and '+savedMenu.dishIds.length+' recipes saved','ok');
        m.close();navigate('menus');
        if(result.unlinkedNames&&result.unlinkedNames.length)setTimeout(()=>offerAddStock(result.unlinkedNames),300);
      }catch(e){footerSave.disabled=false;busy=false;setStatus('Save failed: '+(e.message||e));toast('Menu save failed — it has not been closed','bad');}
    }});
    const m=modal({title:'Import complete menu',body:b,footer:[el('button',{class:'btn ghost',html:'Close',onclick:()=>{if(!busy)m.close();}}),footerSave]});
    setTab('photo');
  };
})();
