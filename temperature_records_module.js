// Command de Cuisine: dedicated historic temperature-record import module.
(function(){
  'use strict';

  function install(){
    if(typeof NAV==='undefined'||typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof api!=='function'||typeof el!=='function'){
      return setTimeout(install,150);
    }
    if(window.__temperatureRecordsModuleInstalled)return;
    window.__temperatureRecordsModuleInstalled=true;

    if(!NAV.some(n=>n.id==='temprecords')){
      const idx=NAV.findIndex(n=>n.id==='temps');
      NAV.splice(idx<0?0:idx+1,0,{id:'temprecords',label:'Temperature records',icon:'history',sect:'Service'});
    }
    if(typeof SUBTITLES==='object')SUBTITLES.temprecords='Historic paper sheets, imports & recovery';

    const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
    const readFile=f=>new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onload=()=>resolve(r.result);
      r.onerror=()=>reject(r.error||new Error('Could not read image'));
      r.readAsDataURL(f);
    });

    function errText(e){
      if(!e)return 'Unknown error';
      if(typeof e==='string')return e;
      if(e.message&&typeof e.message==='string')return e.message;
      const d=e.data||e.error||e;
      if(d&&d.error&&d.error.message)return d.error.message;
      if(d&&d.message)return d.message;
      try{return JSON.stringify(d);}catch{return String(e);}
    }

    function responseText(r){
      let out=r&&r.output_text||'';
      if(!out){
        try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}
      }
      return out;
    }

    function parseObject(text){
      const s=String(text||''),a=s.indexOf('{'),b=s.lastIndexOf('}');
      if(a<0||b<a)throw new Error('The sheet reader returned no usable data');
      return JSON.parse(s.slice(a,b+1));
    }

    async function prepareImage(file){
      const raw=await readFile(file);
      if(!/^image\/(jpeg|jpg|png|webp)$/i.test(file.type||''))return raw;
      return new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>{
          try{
            const max=1600;
            const scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1));
            const c=document.createElement('canvas');
            c.width=Math.max(1,Math.round(img.naturalWidth*scale));
            c.height=Math.max(1,Math.round(img.naturalHeight*scale));
            c.getContext('2d').drawImage(img,0,0,c.width,c.height);
            resolve(c.toDataURL('image/jpeg',0.8));
          }catch{resolve(raw);}
        };
        img.onerror=()=>resolve(raw);
        img.src=raw;
      });
    }

    async function extractSheet(image,name){
      const prompt=`Read this Safe Catering SC2 fridge/cold-room temperature sheet. This is transcription of an original paper record, not estimation. Return ONLY JSON in this shape:
{"month":5,"year":2026,"rows":[{"day":1,"signed":"K.D","values":{"fridge1":{"AM":{"value":4.1,"mark":"readable"},"PM":{"value":4.3,"mark":"readable"}},"fridge2":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"unreadable"}},"fridge3":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer1":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer2":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"freezer3":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}},"coldroom":{"AM":{"value":null,"mark":"blank"},"PM":{"value":null,"mark":"blank"}}}}]}
Transcribe only visible handwritten values. Never infer, average or invent. Preserve minus signs. mark is readable, unreadable, or blank. Include rows with handwriting/signature. Read month/year and signer initials from the page. File: ${name}`;
      try{
        const r=await api('/api/openai/responses',{
          method:'POST',
          body:JSON.stringify({
            model:'gpt-4.1-mini',
            input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:image}]}]
          })
        });
        const obj=parseObject(responseText(r));
        if(!obj.month||!obj.year||!Array.isArray(obj.rows))throw new Error('Month/year or table rows could not be identified');
        obj.sourceFile=name;
        return obj;
      }catch(e){
        throw new Error(errText(e));
      }
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

    function dateText(y,m,d){
      return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    }

    function buildPlan(sheets){
      const slots=new Set((STATE.tempReadings||[]).map(r=>String(r.ts||'').slice(0,10)+'|'+r.appId+'|'+periodOf(r)));
      const readings=[],gaps=[],skipped=[];
      for(const sheet of sheets){
        for(const row of sheet.rows||[]){
          const day=Number(row.day);
          if(!day||day<1||day>31)continue;
          const date=dateText(Number(sheet.year),Number(sheet.month),day);
          for(const [unitKey,pair] of Object.entries(row.values||{})){
            const app=applianceFor(unitKey);
            if(!app){skipped.push({date,unit:unitKey,reason:'Unit not found'});continue;}
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
                gaps.push({date,period,appId:app.id,unit:app.name,signed:row.signed||'',sourceFile:sheet.sourceFile,reason:'Paper entry exists but the number is unreadable from the supplied photo'});
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
      const enteredAt=nowISO();
      const enteredBy=ME&&ME.username||'manager';
      for(const x of plan.readings){
        STATE.tempReadings.push({
          id:uid('t'),appId:x.app.id,value:x.value,
          ts:x.date+'T'+(x.period==='AM'?'09:00:00':'17:00:00'),period:x.period,
          by:x.signed||enteredBy,source:'paper-log-import',backfilled:true,enteredVia:'paper-photo',
          enteredBy,enteredAt,paperSigned:x.signed||'',paperSourceFile:x.sourceFile,photo:null
        });
      }
      const seen=new Set(STATE.paperTempGaps.map(g=>[g.date,g.appId,g.period].join('|')));
      for(const x of plan.gaps){
        const key=[x.date,x.appId,x.period].join('|');
        if(seen.has(key))continue;
        STATE.paperTempGaps.push({id:uid('ptg'),...x,source:'paper-log-gap',enteredBy,enteredAt});
        seen.add(key);
      }
      if(typeof audit==='function')audit('paper_temperature_recovery',plan.readings.length+' readings restored; '+plan.gaps.length+' unreadable entries documented');
      if(typeof save==='function')save('recover paper temperature sheets');
      if(typeof persist==='function')await persist('recover paper temperature sheets');
      toast(plan.readings.length+' paper readings restored','ok');
      navigate('temprecords');
    }

    function reviewSheets(sheets){
      const plan=buildPlan(sheets);
      const body=el('div',{});
      body.append(el('p',{class:'muted'},'Existing readings are never overwritten. Only readable paper values are restored. Unreadable handwriting is documented as a gap.'));
      for(const s of sheets){
        const info=el('div',{});
        info.append(
          el('div',{class:'dk-t'},String(s.month).padStart(2,'0')+'/'+s.year+' · '+s.sourceFile),
          el('div',{class:'dk-s'},(s.rows||[]).length+' recorded day rows')
        );
        body.append(el('div',{class:'docket'},info));
      }
      const summary=el('div',{class:'grid g3',style:'margin-top:12px'});
      summary.append(
        el('div',{class:'card'},el('div',{class:'eyebrow'},'Restore'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.readings.length))),
        el('div',{class:'card'},el('div',{class:'eyebrow'},'Unreadable'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.gaps.length))),
        el('div',{class:'card'},el('div',{class:'eyebrow'},'Already present'),el('div',{style:'font-size:24px;font-weight:700'},String(plan.skipped.length)))
      );
      body.append(summary);
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const restore=el('button',{class:'btn primary',html:icon('save')+'Restore verified records'});
      restore.onclick=async()=>{
        restore.disabled=true;
        try{
          await applyPlan(plan);
          m.close();
        }catch(e){
          restore.disabled=false;
          toast(errText(e),'bad');
        }
      };
      m=modal({title:'Review paper temperature import',body,footer:[cancel,restore]});
    }

    function importer(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const files=[];
      const body=el('div',{});
      const status=el('div',{class:'muted',style:'font-size:12.5px;margin:10px 0'});
      const list=el('div',{});
      const picker=el('input',{type:'file',accept:'image/*,.jpg,.jpeg,.png,.webp',multiple:true,style:'display:none'});
      function paint(){
        list.innerHTML='';
        files.forEach((f,i)=>list.append(el('div',{class:'docket'},el('div',{class:'dk-t'},(i+1)+'. '+f.name))));
        status.textContent=files.length?files.length+' sheet photo'+(files.length===1?'':'s')+' selected.':'Choose one clear photo for each paper sheet.';
      }
      picker.addEventListener('change',()=>{
        files.splice(0,files.length,...[...(picker.files||[])]);
        paint();
      });
      body.append(
        el('button',{class:'btn ghost',html:icon('camera')+'Choose paper temperature sheets',onclick:()=>picker.click()}),
        picker,status,list
      );
      paint();
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const read=el('button',{class:'btn primary',html:icon('bolt')+'Read paper records'});
      read.onclick=async()=>{
        if(!files.length)return toast('Choose paper sheets first','warn');
        read.disabled=true;
        const sheets=[];
        try{
          for(let i=0;i<files.length;i++){
            status.textContent='Reading '+(i+1)+' of '+files.length+' — '+files[i].name;
            const img=await prepareImage(files[i]);
            sheets.push(await extractSheet(img,files[i].name));
          }
          m.close();
          reviewSheets(sheets);
        }catch(e){
          read.disabled=false;
          status.textContent='Could not read the sheet: '+errText(e);
          toast(errText(e),'bad');
        }
      };
      m=modal({title:'Import paper temperature records',body,footer:[cancel,read]});
    }

    VIEWS.temprecords=function(v){
      const readings=(STATE.tempReadings||[]).filter(r=>r.source==='paper-log-import').slice().sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
      const gaps=(STATE.paperTempGaps||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));

      const head=el('div',{class:'card'});
      const actions=el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
      if(typeof isMgr!=='function'||isMgr())actions.append(el('button',{class:'btn primary',html:icon('camera')+'Import paper sheets',onclick:importer}));
      actions.append(el('button',{class:'btn ghost',html:icon('temp')+'Open live temperatures',onclick:()=>navigate('temps')}));
      head.append(
        el('div',{class:'card-head'},el('h3',{},'Temperature records'),el('div',{class:'spacer'}),actions),
        el('p',{class:'muted'},'Digitise genuine historic Safe Catering sheets, keep paper imports separate from live checks, and document anything that cannot be read.')
      );
      v.append(head);

      const stats=el('div',{class:'grid g3',style:'margin-top:16px'});
      stats.append(
        el('div',{class:'kpi'},el('div',{class:'kl'},'Paper readings'),el('div',{class:'kv'},String(readings.length))),
        el('div',{class:'kpi'},el('div',{class:'kl'},'Unreadable entries'),el('div',{class:'kv'},String(gaps.length))),
        el('div',{class:'kpi'},el('div',{class:'kl'},'Source'),el('div',{class:'kv',style:'font-size:22px'},'Safe Catering'))
      );
      v.append(stats);

      const card=el('div',{class:'card',style:'margin-top:16px'});
      card.append(el('div',{class:'card-head'},el('h3',{},'Imported paper history')));
      if(!readings.length){
        card.append(el('div',{class:'empty'},el('h4',{},'No paper records imported yet'),el('div',{},'Use Import paper sheets to digitise the historic register.')));
      }else{
        for(const r of readings.slice(0,500)){
          const a=typeof appById==='function'?appById(r.appId):null;
          const info=el('div',{});
          info.append(
            el('div',{class:'dk-t'},String(r.ts).slice(0,10)+' · '+(a?a.name:'Unit')+' '+periodOf(r)+' · '+r.value+'°C'),
            el('div',{class:'dk-s'},'Paper log'+(r.paperSigned?' · signed '+r.paperSigned:'')+(r.paperSourceFile?' · '+r.paperSourceFile:''))
          );
          card.append(el('div',{class:'docket'},info));
        }
      }
      v.append(card);

      if(gaps.length){
        const g=el('div',{class:'card',style:'margin-top:16px'});
        g.append(el('div',{class:'card-head'},el('h3',{},'Paper gaps / unreadable entries')));
        for(const x of gaps.slice(0,200)){
          const info=el('div',{});
          info.append(el('div',{class:'dk-t'},x.date+' · '+x.unit+' '+x.period),el('div',{class:'dk-s'},x.reason+(x.signed?' · signed '+x.signed:'')));
          g.append(el('div',{class:'docket'},info));
        }
        v.append(g);
      }
    };

    const oldTemps=VIEWS.temps;
    if(typeof oldTemps==='function'){
      VIEWS.temps=function(v){
        oldTemps(v);
        const c=el('div',{class:'card',style:'margin-top:16px'});
        c.append(
          el('div',{class:'card-head'},el('h3',{},'Historic temperature records'),el('div',{class:'spacer'}),el('button',{class:'btn ghost sm',html:icon('history')+'Open records',onclick:()=>navigate('temprecords')})),
          el('p',{class:'muted'},'Paper-sheet imports and historic recovery are kept in their own module.')
        );
        v.append(c);
      };
    }
    renderNav();
  }

  install();
})();
