// Command de Cuisine: multi-page menu photo/file import.
(function(){
  'use strict';

  function readFileAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const rd=new FileReader();
      rd.onload=()=>resolve(rd.result);
      rd.onerror=()=>reject(rd.error||new Error('Could not read image'));
      rd.readAsDataURL(file);
    });
  }

  async function menuImageData(file){
    const raw=await readFileAsDataURL(file);
    // Keep already-small images unchanged. Large phone photos are resized so a
    // multi-page menu does not create an unnecessarily huge AI request.
    if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||''))return raw;
    if(file.size<=1800000)return raw;
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const max=1800, scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
          const canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',0.84));
        }catch{resolve(raw);}
      };
      img.onerror=()=>resolve(raw);
      img.src=raw;
    });
  }

  aiExtractMenu=async function({text,image,images}){
    try{
      const pages=(Array.isArray(images)?images:(image?[image]:[])).filter(Boolean);
      const content=[{type:'input_text',text:'Extract the food menu into strict JSON only (no prose). Treat all supplied images as consecutive pages of ONE menu, in the order supplied. Do not duplicate a dish merely because it appears on more than one page. Array of dishes: [{"name":"","category":"","allergens":"comma separated from the 14 UK allergens","ingredients":[{"name":"","qty":1,"unit":""}]}]. Infer likely core ingredients if not listed. Keep names simple so they match a stock list.'}];
      if(text)content.push({type:'input_text',text:'MENU:\n'+text});
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
      return arr.map(d=>({name:d.name,category:d.category||'Mains',allergens:d.allergens||'',ingredients:(d.ingredients||[]).map(i=>typeof i==='string'?{name:i}:{name:i.name,qty:i.qty||1,unit:i.unit||''})}))
        .filter(d=>d.name&&(!seen.has(String(d.name).trim().toLowerCase())&&seen.add(String(d.name).trim().toLowerCase())));
    }catch(e){return null;}
  };

  importMenu=function(){
    let photos=[],dishes=null,tab='paste';
    const b=el('div',{}),seg=el('div',{class:'seg',style:'margin-bottom:14px'}),body=el('div',{});
    const nameInp=el('input',{class:'inp',value:'Imported menu',style:'margin-bottom:12px'});
    function setTab(t){tab=t;[...seg.children].forEach(c=>c.classList.toggle('on',c.dataset.t===t));draw();}
    seg.append(el('button',{'data-t':'paste',onclick:()=>setTab('paste')},'Paste / type'),el('button',{'data-t':'photo',onclick:()=>setTab('photo')},'Photos / files'+(AI_ENABLED?'':' (needs AI)')));

    function drawPhotoPicker(){
      body.innerHTML='';
      if(!AI_ENABLED||!serverMode){body.innerHTML='<div class="empty">'+icon('camera')+'<h4>Photo import needs AI</h4><div>Add an OpenAI key on your server to read menu photos. For now, use “Paste / type”.</div></div>';return;}
      const picker=el('input',{type:'file',accept:'image/*,.jpg,.jpeg,.png,.webp,.heic,.heif',multiple:true,style:'display:none'});
      const thumb=el('div',{class:'photo-grid',style:'margin:10px 0'});
      const status=el('div',{class:'muted',style:'font-size:12.5px;margin-top:8px'},photos.length?photos.length+' page'+(photos.length===1?'':'s')+' selected':'Choose all pages of the menu together, or add more afterwards.');
      function paint(){
        thumb.innerHTML='';
        photos.forEach((p,i)=>{
          const wrap=el('div',{style:'position:relative;width:112px'});
          wrap.append(el('img',{class:'photo-thumb',src:p.data,style:'width:112px;height:112px'}),el('div',{class:'mono muted',style:'font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'},(i+1)+'. '+p.name));
          wrap.append(el('button',{class:'x',title:'Remove page',style:'position:absolute;right:3px;top:3px;background:var(--panel);border-radius:50%;',html:icon('x'),onclick:()=>{photos.splice(i,1);paint();}}));
          thumb.append(wrap);
        });
        status.textContent=photos.length?photos.length+' page'+(photos.length===1?'':'s')+' selected · pages are read in this order':'Choose all pages of the menu together, or add more afterwards.';
      }
      picker.addEventListener('change',async()=>{
        const files=[...(picker.files||[])]; if(!files.length)return;
        if(photos.length+files.length>10){toast('Use up to 10 menu pages at a time','warn');picker.value='';return;}
        status.textContent='Preparing '+files.length+' image'+(files.length===1?'':'s')+'…';
        try{
          const loaded=[];
          for(const f of files)loaded.push({name:f.name,data:await menuImageData(f)});
          photos.push(...loaded); paint();
        }catch{toast('One of those images could not be read','warn');paint();}
        picker.value='';
      });
      const choose=el('button',{class:'btn ghost',html:icon('camera')+(photos.length?'Add more menu pages':'Choose menu photos / files'),onclick:()=>picker.click()});
      body.append(choose,picker,status,thumb);
      const extract=el('button',{class:'btn primary',html:icon('bolt')+'Read '+(photos.length||'menu')+' page'+(photos.length===1?'':'s'),onclick:async()=>{
        if(!photos.length){toast('Choose at least one menu photo','warn');return;}
        extract.disabled=true;extract.innerHTML=icon('bolt')+'Reading '+photos.length+' pages…';
        dishes=await aiExtractMenu({images:photos.map(p=>p.data)});
        if(!dishes||!dishes.length){toast("Couldn't read those pages — try clearer images or paste the text",'warn');extract.disabled=false;extract.innerHTML=icon('bolt')+'Read menu pages';return;}
        showPreview();
      }});
      body.append(extract);
      paint();
    }

    function draw(){
      body.innerHTML='';
      if(tab==='photo'){drawPhotoPicker();return;}
      const ta=el('textarea',{class:'inp',rows:'7',placeholder:'Paste your menu. One dish per line. Optional: add ingredients after a dash —\n\nClassic Beef Burger — beef mince, burger buns, cheddar\nFish & Chips — cod, chips, oil\nSunday Roast'});
      body.append(ta);
      const row=el('div',{style:'display:flex;gap:8px;margin-top:10px'});
      const parseBtn=el('button',{class:'btn primary',html:icon('bolt')+'Read menu',onclick:async()=>{
        if(!ta.value.trim()){toast('Paste a menu first','warn');return;}
        parseBtn.disabled=true;parseBtn.innerHTML=icon('bolt')+'Reading…';
        if(AI_ENABLED&&serverMode)dishes=await aiExtractMenu({text:ta.value});
        if(!dishes||!dishes.length)dishes=parseMenuText(ta.value);
        showPreview();
      }});
      row.append(parseBtn);if(AI_ENABLED)row.append(el('span',{class:'chip',html:icon('assistant')+'AI will find ingredients & allergens'}));body.append(row);
    }

    function showPreview(){
      body.innerHTML='';
      body.append(el('div',{class:'eyebrow',style:'margin-bottom:8px'},'Found '+dishes.length+' dishes — edit or remove, then create'));
      if(photos.length)body.append(el('div',{class:'muted',style:'font-size:12px;margin-bottom:8px'},'Read from '+photos.length+' menu page'+(photos.length===1?'':'s')+'.'));
      dishes.forEach((d,i)=>{
        const row=el('div',{class:'docket',style:'margin-bottom:6px;align-items:flex-start'}),wrap=el('div',{style:'flex:1'});
        const nm=el('input',{class:'inp',value:d.name,style:'font-weight:600;margin-bottom:4px',oninput:e=>d.name=e.target.value});
        const ing=el('input',{class:'inp',value:(d.ingredients||[]).map(x=>x.name||x).join(', '),placeholder:'ingredients (comma separated)',style:'font-size:13px',oninput:e=>d.ingredients=e.target.value.split(',').map(s=>({name:s.trim()})).filter(x=>x.name)});
        wrap.append(nm,ing);row.append(wrap,el('button',{class:'x',html:icon('trash'),onclick:()=>{dishes.splice(i,1);showPreview();}}));body.append(row);
      });
      footerCreate.style.display='';
    }

    b.append(lf('Menu name',nameInp),seg,body);
    const footerCreate=el('button',{class:'btn primary',style:'display:none',html:icon('save')+'Create menu',onclick:()=>{
      const created=commitImportedMenu(nameInp.value.trim()||'Imported menu',dishes||[]);
      m.close();navigate('menus');toast('Menu imported — '+created.linked+' ingredients matched to stock','ok');
      if(created.unlinkedNames.length)setTimeout(()=>offerAddStock(created.unlinkedNames),300);
    }});
    const m=modal({title:'Import a menu',body:b,footer:[el('button',{class:'btn ghost',html:'Close',onclick:()=>m.close()}),footerCreate]});
    setTab('paste');
  };
})();
