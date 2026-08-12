// Command de Cuisine paper temperature history recovery.
// This file is a served legacy static slot; the current app loads it from logout_controls.js.
(function(){
  'use strict';

  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof api!=='function'||typeof el!=='function'){
      return setTimeout(install,150);
    }
    if(window.__paperTemperatureRecoveryInstalled)return;
    window.__paperTemperatureRecoveryInstalled=true;

    const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
    const readFile=f=>new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||new Error('Could not read image'));
      r.readAsDataURL(f);
    });

    function responseText(r){
      let out=r&&r.output_text||'';
      if(!out){
        try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}
      }
      return out;
    }

    function parseObject(text){
      const s=String(text||''),a=s.indexOf('{'),b=s.lastIndexOf('}');
      if(a<0||b<a)throw new Error('No usable extraction JSON returned');
      return JSON.parse(s.slice(a,b+1));
    }

    async function prepareImage(file){
      const raw=await readFile(file);
      if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||'')||file.size<1800000)return raw;
      return new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>{
          try{
            const max=2400,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
            const c=document.createElement('canvas');
            c.width=Math.max(1,Math.round(img.naturalWidth*scale));
            c.height=Math.max(1,Math.round(img.naturalHeight*scale));
            c.getContext('2d').drawImage(img,0,0,c.width,c.height);
            resolve(c.toDataURL('image/jpeg',0.92));
          }catch{resolve(raw);}
        };
        img.onerror=()=>resolve(raw);
        img.src=raw;
      });
    }

    async function extractSheet(image,name){
      const prompt=`Read this Safe Catering SC2 fridge/cold-room temperature record sheet carefully. This is evidence transcription, not estimation. Return ONLY JSON in this shape:
{"month":5,"year":2026,"rows":[{"day":1,"signed":"K.D","values":{"fridge1":{"AM":{"value":4.1,"mark":"readable"},"PM":{"value":4.3,"mark":"readable"}},"fridge2":{"AM":{"value":null,"mark":"unreadable"},"PM":{"value":null,"mark":"blank"}},"fridge3":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer1":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer2":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer3":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"coldroom":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}}}}]}
Transcribe only what is visibly written. Never infer, average, fill or invent a temperature. Preserve negative freezer values. Use only keys fridge1, fridge2, fridge3, freezer1, freezer2, freezer3, coldroom. mark must be readable, unreadable, or blank. unreadable means handwriting exists but the number cannot be read confidently. blank means no number is visible. Include only day rows containing handwriting or a signature. Read the handwritten month/year. Preserve signer initials where readable. Source filename: ${name}`;
      const r=await api('/api/openai/responses',{
        method:'POST',
        body:JSON.stringify({
          model:'gpt-4.1-mini',
          input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:image}]}]
        })
      });
      const obj=parseObject(responseText(r));
      if(!obj||!Array.isArray(obj.rows)||!obj.month||!obj.year)throw new Error('Could not identify month/year and rows');
      obj.sourceFile=name;
      return obj;
    }

    function applianceFor(key){
      const aliases={
        fridge1:['fridge1','frid1'],fridge2:['fridge2','frid2'],fridge3:['fridge3','frid3'],
        freezer1:['freezer1','frz1'],freezer2:['freezer2','frz2'],freezer3:['freezer3','frz3'],
        coldroom:['coldroom','coldroomfridge']
      };
      const wanted=aliases[key]||[key];
      return (STATE.appliances||[]).find(a=>wanted.includes(norm(a.name))||wanted.some(x=>norm(a.name).includes(x)));
    }

    function periodOf(r){
      if(r.period)return String(r.period).toUpperCase();
      return +(String(r.ts||'').slice(11,13))<12?'AM':'PM';
    }

    function slotSet(){
      return new Set((STATE.tempReadings||[]).map(r=>String(r.ts||'').slice(0,10)+'|'+r.appId+'|'+periodOf(r)));
    }

    function dateText(y,m,d){
      return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    }

    function rowHasEvidence(row){
      if(row.signed)return true;
      return Object.values(row.values||{}).some(pair=>Object.values(pair||{}).some(cell=>cell&&cell.mark&&cell.mark!=='blank'));
    }

    function buildPlan(sheets){
      const slots=slotSet(),readings=[],gaps=[],skipped=[];
      for(const sheet of sheets){
        for(const row of sheet.rows||[]){
          const day=Number(row.day);
          if(!day||day<1||day>31)continue;
          const date=dateText(Number(sheet.year),Number(sheet.month),day);
          const evidence=rowHasEvidence(row);
          for(const [unitKey,pair] of Object.entries(row.values||{})){
            const app=applianceFor(unitKey);
            if(!app){skipped.push({date,unit:unitKey,reason:'Unit not found in app'});continue;}
            for(const period of ['AM','PM']){
              const cell=(pair||{})[period]||{};
              const mark=String(cell.mark||'blank').toLowerCase();
              const key=date+'|'+app.id+'|'+period;
              if(slots.has(key)){
                skipped.push({date,unit:app.name,period,reason:'Existing reading kept'});
                continue;
              }
              const n=Number(cell.value);
              if(mark==='readable'&&cell.value!==null&&cell.value!==''&&Number.isFinite(n)){
                readings.push({date,period,app,value:n,signed:row.signed||'',sourceFile:sheet.sourceFile});
                slots.add(key);
              }else if(mark==='unreadable'){
                gaps.push({date,period,appId:app.id,unit:app.name,signed:row.signed||'',sourceFile:sheet.sourceFile,reason:'Writing is present on the paper record but the numeric value is unreadable from the supplied image'});
              }else if(mark==='blank'&&evidence){
                gaps.push({date,period,appId:app.id,unit:app.name,signed:row.signed||'',sourceFile:sheet.sourceFile,reason:'Paper row exists but this cell has no readable numeric value'});
              }
            }
          }
        }
      }
      return {readings,gaps,skipped};
    }

    async function applyPlan(plan){
      STATE.tempReadings=Array.isArray(STATE.tempReadings)?STATE.tempReadings:[];
      STATE.paperTempGaps=Array.isArray(STATE.paperTempGaps)?STATE.paperTempGaps:[];
      const enteredAt=nowISO(),enteredBy=ME&&ME.username||'manager';
      for(const x of plan.readings){
        STATE.tempReadings.push({
          id:uid('t'),appId:x.app.id,value:x.value,
          ts:x.date+'T'+(x.period==='AM'?'09:00:00':'17:00:00'),period:x.period,
          by:x.signed||enteredBy,source:'paper-log-import',backfilled:true,enteredVia:'paper-photo',
          enteredBy,enteredAt,paperSigned:x.signed||'',paperSourceFile:x.sourceFile,photo:null
        });
      }
      const seen=new Set(STATE.paperTempGaps.map(g=>[g.date,g.appId,g.period,g.reason].join('|')));
      for(const x of plan.gaps){
        const key=[x.date,x.appId,x.period,x.reason].join('|');
        if(seen.has(key))continue;
        STATE.paperTempGaps.push({id:uid('ptg'),...x,source:'paper-log-gap',enteredBy,enteredAt});
        seen.add(key);
      }
      if(typeof audit==='function')audit('paper_temperature_recovery',plan.readings.length+' readings restored from paper records; '+plan.gaps.length+' unreadable/blank paper cells documented');
      if(typeof save==='function')save('recover paper temperature sheets');
      if(typeof persist==='function')await persist('recover paper temperature sheets');
      toast(plan.readings.length+' paper temperature readings restored','ok');
      rerender();
    }

    function showPreview(sheets){
      const plan=buildPlan(sheets);
      const body=el('div',{});
      body.append(el('p',{class:'muted',style:'margin-top:0'},'Nothing is saved yet. Existing readings always win. Only clearly readable numbers become temperature readings; unreadable or blank cells are documented separately and never given an invented value.'));
      for(const s of sheets){
        const info=el('div',{});
        info.append(
          el('div',{class:'dk-t'},String(s.month).padStart(2,'0')+'/'+s.year+' · '+(s.sourceFile||'paper sheet')),
          el('div',{class:'dk-s'},(s.rows||[]).length+' handwritten day rows detected')
        );
        body.append(el('div',{class:'docket',style:'margin-bottom:6px'},info));
      }
      const summary=el('div',{class:'grid g3',style:'margin-top:12px'});
      summary.append(
        el('div',{class:'card'},el('div',{class:'eyebrow'},'Restore'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.readings.length)),el('div',{class:'muted'},'readable readings')),
        el('div',{class:'card'},el('div',{class:'eyebrow'},'Document'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.gaps.length)),el('div',{class:'muted'},'unreadable / blank cells')),
        el('div',{class:'card'},el('div',{class:'eyebrow'},'Keep existing'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.skipped.length)),el('div',{class:'muted'},'duplicates / unmatched'))
      );
      body.append(summary);
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const restore=el('button',{class:'btn primary',html:icon('save')+'Restore verified paper records'});
      restore.onclick=async()=>{
        restore.disabled=true;
        try{await applyPlan(plan);m.close();}
        catch(err){restore.disabled=false;toast('Recovery save failed: '+(err.message||err),'bad');}
      };
      m=modal({title:'Review paper temperature recovery',body,footer:[cancel,restore]});
    }

    function importPaperSheets(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      if(!AI_ENABLED||!serverMode)return toast('Paper-sheet reading needs the server AI connection','warn');
      const files=[];
      const body=el('div',{});
      const status=el('div',{class:'muted',style:'font-size:12.5px;margin:8px 0'});
      const list=el('div',{});
      const picker=el('input',{type:'file',accept:'image/*,.jpg,.jpeg,.png,.webp',multiple:true,style:'display:none'});
      function paint(){
        list.innerHTML='';
        files.forEach((f,i)=>list.append(el('div',{class:'docket',style:'margin-bottom:5px'},el('div',{class:'dk-t'},(i+1)+'. '+f.name))));
        status.textContent=files.length?files.length+' paper sheet photo'+(files.length===1?'':'s')+' selected.':'Choose the clearest photo of each month. Do not include duplicate photos of the same sheet.';
      }
      picker.addEventListener('change',()=>{
        files.splice(0,files.length,...[...(picker.files||[])]);
        paint();
      });
      body.append(
        el('p',{class:'muted',style:'margin-top:0'},'Use this for genuine historic Safe Catering temperature sheets. The app reads one sheet at a time and shows a preview before anything is written.'),
        el('button',{class:'btn ghost',html:icon('camera')+'Choose paper temperature sheets',onclick:()=>picker.click()}),
        picker,status,list
      );
      paint();
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const run=el('button',{class:'btn primary',html:icon('bolt')+'Read paper records'});
      run.onclick=async()=>{
        if(!files.length)return toast('Choose the paper sheets first','warn');
        run.disabled=true;
        const sheets=[];
        try{
          for(let i=0;i<files.length;i++){
            status.textContent='Reading sheet '+(i+1)+' of '+files.length+' — nothing is being saved yet…';
            const data=await prepareImage(files[i]);
            sheets.push(await extractSheet(data,files[i].name));
          }
          m.close();
          showPreview(sheets);
        }catch(err){
          run.disabled=false;
          status.textContent='Could not read the sheet reliably: '+(err.message||err);
          toast('Paper sheet reading stopped — nothing was saved','bad');
        }
      };
      m=modal({title:'Recover paper temperature history',body,footer:[cancel,run]});
    }

    const baseHistory=VIEWS.history;
    VIEWS.history=function(v){
      baseHistory(v);
      if(typeof isMgr==='function'&&!isMgr())return;
      const gaps=(STATE.paperTempGaps||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      const card=el('div',{class:'card',style:'margin-top:16px'});
      const head=el('div',{class:'card-head'},el('h3',{},'Paper record recovery'),el('div',{class:'spacer'}));
      head.append(el('button',{class:'btn primary sm',html:icon('camera')+'Import paper temperature sheets',onclick:importPaperSheets}));
      card.append(head,el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Restore historic readings from signed paper sheets without overwriting anything already in the app. No estimated temperatures are created.'));
      if(gaps.length){
        card.append(el('div',{class:'eyebrow',style:'margin:12px 0 6px'},gaps.length+' documented paper cells without a readable numeric value'));
        for(const g of gaps.slice(0,30)){
          const info=el('div',{});
          info.append(
            el('div',{class:'dk-t'},g.date+' · '+g.unit+' '+g.period),
            el('div',{class:'dk-s'},g.reason+(g.signed?' · signed '+g.signed:''))
          );
          card.append(el('div',{class:'docket',style:'margin-bottom:5px'},info));
        }
      }
      v.append(card);
    };
  }

  install();
})();
