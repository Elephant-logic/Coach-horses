// Command de Cuisine: visible historic temperature gaps + manager fill workflow.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__temperatureGapFillInstalled)return;
    window.__temperatureGapFillInstalled=true;

    const real=r=>!(r&&r.source==='startup-baseline');
    const period=r=>String(r&&r.period||((+(String(r&&r.ts||'').slice(11,13))<12)?'AM':'PM')).toUpperCase();
    const date=r=>String(r&&r.ts||'').slice(0,10);
    const slot=(d,id,p)=>d+'|'+id+'|'+p;
    const isoDay=d=>new Date(d+'T12:00:00');
    const dayText=d=>d.toISOString().slice(0,10);
    const addDay=(d,n)=>{const x=isoDay(d);x.setDate(x.getDate()+n);return dayText(x);};
    const coldUnits=()=> (STATE.appliances||[]).filter(a=>a&&['fridge','freezer'].includes(String(a.type||'').toLowerCase()));
    const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');

    function coverage(){
      const readings=(STATE.tempReadings||[]).filter(real).filter(r=>r&&r.appId&&r.ts&&r.value!==null&&r.value!=='');
      const units=coldUnits();
      if(!readings.length||!units.length)return {from:'',to:'',gaps:[],missingSlots:0};
      const dates=readings.map(date).filter(Boolean).sort();
      const from=dates[0],to=(typeof today==='function'?today():new Date().toISOString().slice(0,10));
      const have=new Set(readings.map(r=>slot(date(r),r.appId,period(r))));
      const gaps=[];let missingSlots=0;
      for(let d=from;d<=to;d=addDay(d,1)){
        for(const p of ['AM','PM']){
          const missing=units.filter(a=>!have.has(slot(d,a.id,p)));
          if(missing.length){gaps.push({date:d,period:p,missing,total:units.length});missingSlots+=missing.length;}
        }
      }
      return {from,to,gaps,missingSlots};
    }

    function fillGap(gap){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const body=el('div',{});
      body.append(el('p',{class:'muted',style:'margin-top:0'},'Enter only readings that were genuinely recorded at the time. Existing readings are protected and are not shown here.'));
      const form=el('form',{});
      for(const a of gap.missing){
        const row=el('label',{style:'display:grid;grid-template-columns:minmax(120px,1fr) 120px;gap:10px;align-items:center;margin:8px 0'});
        row.append(el('span',{},a.name),el('input',{class:'inp',type:'number',step:'0.1',name:a.id,placeholder:'°C',required:true}));
        form.append(row);
      }
      body.append(form);
      let m;const saveBtn=el('button',{class:'btn primary',html:icon('save')+'Save '+gap.date+' '+gap.period});
      saveBtn.onclick=async()=>{
        const data=new FormData(form),enteredAt=typeof nowISO==='function'?nowISO():new Date().toISOString(),enteredBy=(typeof ME!=='undefined'&&ME&&ME.username)||'manager';
        const additions=[];
        for(const a of gap.missing){
          const raw=String(data.get(a.id)||'').trim(),value=Number(raw);
          if(!raw||!Number.isFinite(value))return toast('Enter a temperature for '+a.name,'warn');
          additions.push({id:typeof uid==='function'?uid('t'):('t-'+Date.now()+'-'+a.id),appId:a.id,value,ts:gap.date+'T'+(gap.period==='AM'?'09:00:00':'17:00:00'),period:gap.period,by:enteredBy,source:'manager-backfill',backfilled:true,enteredVia:'history-gap-fill',enteredAt});
        }
        STATE.tempReadings=Array.isArray(STATE.tempReadings)?STATE.tempReadings:[];
        const have=new Set(STATE.tempReadings.filter(real).map(r=>slot(date(r),r.appId,period(r))));
        additions.forEach(r=>{if(!have.has(slot(date(r),r.appId,period(r))))STATE.tempReadings.push(r);});
        if(typeof audit==='function')audit('temp_gap_fill',gap.date+' '+gap.period+' · '+additions.length+' historic readings entered by '+enteredBy);
        if(typeof save==='function')save('fill historic temperature gap');
        if(typeof persist==='function')await persist('fill historic temperature gap');
        toast('Historic temperature gap saved','ok');m.close();rerender();
      };
      m=modal({title:'Fill missing temperature round',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),saveBtn]});
    }

    function gapCard(){
      const c=coverage();
      const card=el('div',{class:'card',style:'margin-top:16px'});
      const head=el('div',{class:'card-head'},el('h3',{},'Temperature gaps'),el('div',{class:'spacer'}));
      head.append(el('span',{class:'chip mono'},c.gaps.length+' missing rounds'));
      card.append(head);
      if(!c.from){card.append(el('div',{class:'empty'},el('h4',{},'No temperature range yet'),el('div',{},'Add a genuine reading before gap coverage can be calculated.')));return card;}
      card.append(el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Coverage checked from '+c.from+' to '+c.to+'. Missing means at least one fridge/freezer reading is absent for that AM/PM round. If you have the original paper sheet, import it instead of typing the values.'));
      if(!c.gaps.length){card.append(el('div',{class:'notice ok'},'No missing temperature rounds in this date range.'));return card;}
      const byMonth={};c.gaps.forEach(g=>{const k=g.date.slice(0,7);(byMonth[k]||(byMonth[k]=[])).push(g);});
      Object.entries(byMonth).forEach(([month,rows])=>{
        card.append(el('div',{class:'eyebrow',style:'margin:14px 0 6px'},month+' · '+rows.length+' missing rounds'));
        rows.slice(0,100).forEach(g=>{
          const row=el('div',{class:'docket',style:'margin-bottom:5px;display:flex;gap:10px;align-items:center'});
          const info=el('div',{style:'min-width:0;flex:1'});info.append(el('div',{class:'dk-t'},g.date+' · '+g.period),el('div',{class:'dk-s'},g.missing.length+' of '+g.total+' cold units missing · '+g.missing.map(a=>a.name).join(', ')));
          row.append(info);
          if(typeof isMgr!=='function'||isMgr())row.append(el('button',{class:'btn primary sm',html:'Fill missing',onclick:()=>fillGap(g)}));
          card.append(row);
        });
      });
      return card;
    }

    // Complete paper-sheet importer. It first detects every written day, then reads the
    // table in small day ranges and refuses to accept an incomplete extraction.
    const readFile=f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not read image'));r.readAsDataURL(f);});
    function errText(e){if(!e)return 'Unknown error';if(typeof e==='string')return e;if(e.message)return e.message;const d=e.data||e.error||e;if(d&&d.error&&d.error.message)return d.error.message;if(d&&d.message)return d.message;try{return JSON.stringify(d);}catch{return String(e);}}
    function responseText(r){let out=r&&r.output_text||'';if(!out){try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}return out;}
    function jsonSlice(text){let s=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a<0||b<a)throw new Error('Sheet reader returned no usable JSON');return s.slice(a,b+1);}
    function parseObject(text){const raw=jsonSlice(text);try{return JSON.parse(raw);}catch{}const cleaned=raw.replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/,\s*([}\]])/g,'$1').replace(/\u00a0/g,' ');return JSON.parse(cleaned);}
    async function repairObject(text,label){const raw=jsonSlice(text);const prompt=`Repair ONLY the JSON syntax below. Do not alter, infer, add, remove, average or guess any temperature, day, month, year, signer or mark. Return valid JSON only. ${label}\n\n${raw}`;const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt}]}]})});return parseObject(responseText(r));}
    async function callJson(image,prompt,label){const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:image}]}]})});const raw=responseText(r);try{return parseObject(raw);}catch{return repairObject(raw,label);}}
    async function prepareImage(file){const raw=await readFile(file);if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||''))return raw;return new Promise(resolve=>{const img=new Image();img.onload=()=>{try{const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);resolve(c.toDataURL('image/jpeg',0.82));}catch{resolve(raw);}};img.onerror=()=>resolve(raw);img.src=raw;});}

    async function detectSheet(image,name){
      const prompt=`Inspect this Safe Catering SC2 temperature sheet. Return ONLY JSON: {"month":7,"year":2026,"writtenDays":[1,2,3]}. writtenDays must contain EVERY date row on which any handwritten temperature, cold-room value or signature is visible. Do not transcribe temperatures yet. Do not infer rows that are blank. File: ${name}`;
      const x=await callJson(image,prompt,name+' detection');
      const days=[...new Set((x.writtenDays||[]).map(Number).filter(d=>d>=1&&d<=31))].sort((a,b)=>a-b);
      if(!Number(x.month)||!Number(x.year)||!days.length)throw new Error('Could not identify the month/year and written day rows on '+name);
      return {month:Number(x.month),year:Number(x.year),writtenDays:days};
    }

    const rowShape='{"day":1,"signed":"K.D","values":{"fridge1":{"AM":{"value":4.1,"mark":"readable"},"PM":{"value":4.3,"mark":"readable"}},"fridge2":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"unreadable"}},"fridge3":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer1":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer2":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer3":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"coldroom":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}}}}';
    async function readDays(image,name,meta,days){
      const prompt=`Transcribe ONLY date rows ${days.join(', ')} from this Safe Catering SC2 sheet for ${String(meta.month).padStart(2,'0')}/${meta.year}. These rows were already detected as containing handwriting. Return ONLY JSON: {"rows":[${rowShape}]}. Include one row for EACH requested day. Transcribe only visible handwritten values. Never infer, average, fill or invent. Preserve minus signs. Keys are fridge1, fridge2, fridge3, freezer1, freezer2, freezer3, coldroom. mark is readable, unreadable, or blank. Preserve signer initials where readable. File: ${name}`;
      const x=await callJson(image,prompt,name+' days '+days.join(','));
      return Array.isArray(x.rows)?x.rows:[];
    }

    async function extractCompleteSheet(image,name,onProgress){
      const meta=await detectSheet(image,name);
      const rows=[];
      const groups=[[1,10],[11,20],[21,31]];
      for(const [a,b] of groups){
        const days=meta.writtenDays.filter(d=>d>=a&&d<=b);if(!days.length)continue;
        if(onProgress)onProgress('Reading '+name+' · days '+a+'–'+b);
        rows.push(...await readDays(image,name,meta,days));
      }
      const byDay=new Map();for(const r of rows){const d=Number(r&&r.day);if(meta.writtenDays.includes(d)&&!byDay.has(d))byDay.set(d,r);}
      let missing=meta.writtenDays.filter(d=>!byDay.has(d));
      for(const d of missing){
        if(onProgress)onProgress('Re-checking '+name+' · day '+d);
        const retry=await readDays(image,name,meta,[d]);
        const found=retry.find(r=>Number(r&&r.day)===d);if(found)byDay.set(d,found);
      }
      missing=meta.writtenDays.filter(d=>!byDay.has(d));
      if(missing.length)throw new Error(name+' is visibly filled on day'+(missing.length===1?' ':'s ')+missing.join(', ')+' but those rows could not be read reliably. Nothing has been saved.');
      return {month:meta.month,year:meta.year,writtenDays:meta.writtenDays,rows:meta.writtenDays.map(d=>byDay.get(d)),sourceFile:name};
    }

    function applianceFor(key){const aliases={fridge1:['fridge1','frid1'],fridge2:['fridge2','frid2'],fridge3:['fridge3','frid3'],freezer1:['freezer1','frz1'],freezer2:['freezer2','frz2'],freezer3:['freezer3','frz3'],coldroom:['coldroom','coldroomfridge']};const wanted=aliases[key]||[key];return (STATE.appliances||[]).find(a=>wanted.includes(norm(a.name))||wanted.some(x=>norm(a.name).includes(x)));}
    function dateText(y,m,d){return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
    function paperPlan(sheets){
      const slots=new Set((STATE.tempReadings||[]).filter(real).map(r=>slot(date(r),r.appId,period(r))));const readings=[],gaps=[],skipped=[];
      for(const sheet of sheets)for(const row of sheet.rows||[]){const day=Number(row.day);if(!day)continue;const d=dateText(sheet.year,sheet.month,day);for(const [unitKey,pair] of Object.entries(row.values||{})){const app=applianceFor(unitKey);if(!app){skipped.push({date:d,unit:unitKey,reason:'Unit not found'});continue;}for(const p of ['AM','PM']){const cell=(pair||{})[p]||{},mark=String(cell.mark||'blank').toLowerCase(),k=slot(d,app.id,p);if(slots.has(k)){skipped.push({date:d,unit:app.name,period:p,reason:'Existing reading kept'});continue;}const n=Number(cell.value);if(mark==='readable'&&cell.value!==null&&cell.value!==''&&Number.isFinite(n)){readings.push({date:d,period:p,app,value:n,signed:row.signed||'',sourceFile:sheet.sourceFile});slots.add(k);}else if(mark==='unreadable'){gaps.push({date:d,period:p,appId:app.id,unit:app.name,signed:row.signed||'',sourceFile:sheet.sourceFile,reason:'Paper entry exists but the number is unreadable from the supplied photo'});}}}}
      return {readings,gaps,skipped};
    }
    async function applyPaperPlan(plan){STATE.tempReadings=Array.isArray(STATE.tempReadings)?STATE.tempReadings:[];STATE.paperTempGaps=Array.isArray(STATE.paperTempGaps)?STATE.paperTempGaps:[];const enteredAt=typeof nowISO==='function'?nowISO():new Date().toISOString(),enteredBy=(typeof ME!=='undefined'&&ME&&ME.username)||'manager';for(const x of plan.readings)STATE.tempReadings.push({id:typeof uid==='function'?uid('t'):('t-'+Date.now()+'-'+Math.random()),appId:x.app.id,value:x.value,ts:x.date+'T'+(x.period==='AM'?'09:00:00':'17:00:00'),period:x.period,by:x.signed||enteredBy,source:'paper-log-import',backfilled:true,enteredVia:'paper-photo-complete',enteredBy,enteredAt,paperSigned:x.signed||'',paperSourceFile:x.sourceFile,photo:null});const seen=new Set(STATE.paperTempGaps.map(g=>[g.date,g.appId,g.period].join('|')));for(const x of plan.gaps){const k=[x.date,x.appId,x.period].join('|');if(!seen.has(k)){STATE.paperTempGaps.push({id:typeof uid==='function'?uid('ptg'):('ptg-'+Date.now()+'-'+Math.random()),...x,source:'paper-log-gap',enteredBy,enteredAt});seen.add(k);}}if(typeof audit==='function')audit('paper_temperature_complete_import',plan.readings.length+' readings restored from complete paper-sheet extraction');if(typeof save==='function')save('complete paper temperature import');if(typeof persist==='function')await persist('complete paper temperature import');toast(plan.readings.length+' paper readings restored','ok');rerender();}

    function reviewCompleteSheets(sheets){const plan=paperPlan(sheets),body=el('div',{});body.append(el('p',{class:'muted'},'Every visibly written day was checked before this preview. Existing readings are never overwritten.'));for(const s of sheets)body.append(el('div',{class:'docket'},el('div',{},el('div',{class:'dk-t'},String(s.month).padStart(2,'0')+'/'+s.year+' · '+s.sourceFile),el('div',{class:'dk-s'},s.writtenDays.length+' written day rows detected · '+s.rows.length+' extracted'))));body.append(el('div',{class:'grid g3',style:'margin-top:12px'},el('div',{class:'card'},el('div',{class:'eyebrow'},'Restore'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.readings.length))),el('div',{class:'card'},el('div',{class:'eyebrow'},'Unreadable'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.gaps.length))),el('div',{class:'card'},el('div',{class:'eyebrow'},'Already present'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.skipped.length)))));let m;const restore=el('button',{class:'btn primary',html:icon('save')+'Restore paper records'});restore.onclick=async()=>{restore.disabled=true;try{await applyPaperPlan(plan);m.close();}catch(e){restore.disabled=false;toast(errText(e),'bad');}};m=modal({title:'Review complete paper import',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),restore]});}

    function completePaperImporter(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const files=[],body=el('div',{}),status=el('div',{class:'muted',style:'font-size:12.5px;margin:10px 0'}),list=el('div',{}),picker=el('input',{type:'file',accept:'image/*,.jpg,.jpeg,.png,.webp',multiple:true,style:'display:none'});
      function paint(){list.innerHTML='';files.forEach((f,i)=>list.append(el('div',{class:'docket'},el('div',{class:'dk-t'},(i+1)+'. '+f.name))));status.textContent=files.length?files.length+' sheet photo'+(files.length===1?'':'s')+' selected.':'Choose the original paper sheet photos.';}
      picker.addEventListener('change',()=>{files.splice(0,files.length,...[...(picker.files||[])]);paint();});body.append(el('button',{class:'btn ghost',html:icon('camera')+'Choose paper temperature sheets',onclick:()=>picker.click()}),picker,status,list);paint();let m;const read=el('button',{class:'btn primary',html:icon('bolt')+'Read complete sheets'});read.onclick=async()=>{if(!files.length)return toast('Choose paper sheets first','warn');read.disabled=true;const sheets=[];try{for(let i=0;i<files.length;i++){status.textContent='Checking written rows '+(i+1)+' of '+files.length+' — '+files[i].name;const img=await prepareImage(files[i]);sheets.push(await extractCompleteSheet(img,files[i].name,msg=>status.textContent=msg));}m.close();reviewCompleteSheets(sheets);}catch(e){read.disabled=false;status.textContent='Could not complete the sheet read: '+errText(e);toast(errText(e),'bad');}};m=modal({title:'Import complete paper temperature records',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),read]});
    }
    window.openCompletePaperTemperatureImport=completePaperImporter;

    window.openTemperatureGapFill=fillGap;
    const oldHistory=VIEWS.history;
    if(typeof oldHistory==='function')VIEWS.history=function(v){oldHistory(v);const c=gapCard();if(typeof isMgr!=='function'||isMgr()){const h=c.querySelector&&c.querySelector('.card-head');if(h)h.append(el('button',{class:'btn ghost sm',html:icon('camera')+'Import paper sheets',onclick:completePaperImporter}));}v.append(c);};
    const oldRecords=VIEWS.temprecords;
    if(typeof oldRecords==='function')VIEWS.temprecords=function(v){oldRecords(v);for(const b of v.querySelectorAll('button')){if(/import paper sheets/i.test(b.textContent||''))b.onclick=completePaperImporter;}v.append(gapCard());};
  }
  install();
})();