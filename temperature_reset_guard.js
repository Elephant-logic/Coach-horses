// Command de Cuisine: simplified temperature register workflow.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof api!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__temperatureRegisterSimpleInstalled)return;
    window.__temperatureRegisterSimpleInstalled=true;

    if(typeof SUBTITLES==='object')SUBTITLES.temprecords='Temperature register & normal history';

    const cols={
      'Fridge 1 AM':['Fridge 1','AM'],'Fridge 1 PM':['Fridge 1','PM'],
      'Fridge 2 AM':['Fridge 2','AM'],'Fridge 2 PM':['Fridge 2','PM'],
      'Fridge 3 AM':['Fridge 3','AM'],'Fridge 3 PM':['Fridge 3','PM'],
      'Freezer 1 AM':['Freezer 1','AM'],'Freezer 1 PM':['Freezer 1','PM'],
      'Freezer 2 AM':['Freezer 2','AM'],'Freezer 2 PM':['Freezer 2','PM'],
      'Freezer 3 AM':['Freezer 3','AM'],'Freezer 3 PM':['Freezer 3','PM'],
      'Cold Room AM':['Cold Room','AM'],'Cold Room PM':['Cold Room','PM']
    };

    function parseCSV(text){
      const rows=[];let row=[],field='',quoted=false;
      for(let i=0;i<text.length;i++){
        const ch=text[i];
        if(quoted){
          if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
          else if(ch==='"')quoted=false;
          else field+=ch;
        }else if(ch==='"')quoted=true;
        else if(ch===','){row.push(field);field='';}
        else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
        else field+=ch;
      }
      if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
      if(!rows.length)return [];
      const headers=rows.shift().map(x=>String(x||'').trim());
      return rows.filter(r=>r.some(x=>String(x||'').trim()!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()])));
    }

    function buildDocument(records,fileName){
      const readings=[];
      for(const rec of records){
        const date=String(rec.Date||'').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
        for(const [col,[unit,period]] of Object.entries(cols)){
          const raw=String(rec[col]??'').trim();
          if(raw==='')continue;
          const value=Number(raw);
          if(!Number.isFinite(value))continue;
          readings.push({date,unit,period,value,signed:String(rec['Recorded by']||'').trim(),sourceSheet:fileName});
        }
      }
      return {
        format:'command-de-cuisine-temperature-backfill',version:1,
        title:'Uploaded temperature register',source:'uploaded-temperature-register',
        readings,gaps:[]
      };
    }

    async function review(file){
      const text=await file.text();
      const doc=buildDocument(parseCSV(text),file.name);
      if(!doc.readings.length)throw new Error('No temperature readings were found in this CSV.');
      const dates=doc.readings.map(x=>x.date).sort();
      const body=el('div',{});
      body.append(
        el('div',{class:'notice'},'This puts the CSV temperatures into the same normal History list used by live temperature checks. Existing date + unit + AM/PM readings are kept and are not overwritten.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},doc.readings.length+' temperature readings'),
          el('div',{class:'dk-s'},dates[0]+' to '+dates[dates.length-1]+' · '+file.name)
        ))
      );
      let m;
      const go=el('button',{class:'btn primary',html:'Put into normal History'});
      go.onclick=async()=>{
        go.disabled=true;
        try{
          const res=await api('/api/temperature-paper-import/undo',{method:'POST',body:JSON.stringify({action:'import-backfill-file',document:doc})});
          toast((res&&res.message)||'Temperature register imported','ok');
          m.close();setTimeout(()=>location.reload(),350);
        }catch(e){go.disabled=false;toast((e&&e.message)||String(e),'bad');}
      };
      m=modal({title:'Import temperature register',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),go]});
    }

    function choose(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const input=document.createElement('input');
      input.type='file';input.accept='.csv,text/csv';
      input.onchange=async()=>{const f=input.files&&input.files[0];if(!f)return;try{await review(f);}catch(e){toast((e&&e.message)||String(e),'bad');}};
      input.click();
    }

    VIEWS.temprecords=function(v){
      const card=el('div',{class:'card'});
      const head=el('div',{class:'card-head'},el('h3',{},'Temperature records'),el('div',{class:'spacer'}));
      card.append(head,el('p',{class:'muted'},'One register, one History. Upload the temperature-register CSV here, then carry on with normal live temperature checks.'));
      const actions=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'});
      if(typeof isMgr!=='function'||isMgr())actions.append(el('button',{class:'btn primary',html:'Import temperature register',onclick:choose}));
      actions.append(
        el('button',{class:'btn ghost',html:'Open normal History',onclick:()=>navigate('history')}),
        el('button',{class:'btn ghost',html:'Open live temperatures',onclick:()=>navigate('temps')})
      );
      card.append(actions);
      const registerRows=(STATE.tempReadings||[]).filter(r=>r&&r.source==='backfill-file-import'&&r.backfillFileSource==='uploaded-temperature-register');
      if(registerRows.length){
        const dates=registerRows.map(r=>String(r.ts||'').slice(0,10)).filter(Boolean).sort();
        card.append(el('div',{class:'notice ok',style:'margin-top:14px'},registerRows.length+' uploaded register readings are in normal History'+(dates.length?' · '+dates[0]+' to '+dates[dates.length-1]:'')));
      }
      v.append(card);
    };
  }
  install();
})();

// Live temperature persistence backed by the dedicated temperature_readings table.
(function(){
  'use strict';
  function installTemperatureStore(){
    if(typeof STATE==='undefined'||typeof api!=='function'||typeof persist!=='function'||typeof updateSync!=='function'||typeof serverMode==='undefined'||typeof ME==='undefined')return setTimeout(installTemperatureStore,150);
    if(serverMode&&!ME)return setTimeout(installTemperatureStore,150);
    if(window.__temperatureStoreInstalled)return;
    window.__temperatureStoreInstalled=true;

    const originalPersist=persist;
    const canon=value=>JSON.stringify(value);
    const clone=value=>JSON.parse(JSON.stringify(value));
    let baseline=clone(STATE);
    let ready=false;

    const rowsById=rows=>new Map((Array.isArray(rows)?rows:[]).filter(r=>r&&r.id!=null).map(r=>[String(r.id),r]));
    const additions=(current,previous)=>{
      const old=rowsById(previous);
      return (Array.isArray(current)?current:[]).filter(r=>r&&r.id!=null&&!old.has(String(r.id)));
    };
    const existingRowsChanged=(current,previous)=>{
      const now=rowsById(current);
      for(const row of (Array.isArray(previous)?previous:[])){
        if(!row||row.id==null)continue;
        const kept=now.get(String(row.id));
        if(!kept||canon(kept)!==canon(row))return true;
      }
      return false;
    };
    const nonTemperatureChanged=()=>{
      const ignore=new Set(['tempReadings','audit']);
      const keys=new Set([...Object.keys(baseline||{}),...Object.keys(STATE||{})]);
      for(const key of keys){
        if(ignore.has(key))continue;
        if(canon((baseline||{})[key])!==canon(STATE[key]))return true;
      }
      return false;
    };
    async function postChunks(rows){
      let inserted=[];
      for(let i=0;i<rows.length;i+=64){
        const res=await api('/api/temperature-readings',{method:'POST',body:JSON.stringify({readings:rows.slice(i,i+64)})});
        inserted=inserted.concat((res&&res.readings)||[]);
      }
      return inserted;
    }
    function queuedState(){
      try{
        const raw=localStorage.getItem(LS_QUEUE);
        if(!raw)return null;
        const parsed=JSON.parse(raw);
        return parsed&&parsed.state&&typeof parsed.state==='object'?parsed.state:null;
      }catch(_e){return null;}
    }
    function queueOnlyTemperatureChanges(queued,current){
      if(!queued)return false;
      const ignore=new Set(['tempReadings','audit']);
      const keys=new Set([...Object.keys(queued||{}),...Object.keys(current||{})]);
      for(const key of keys){
        if(ignore.has(key))continue;
        if(canon(queued[key])!==canon(current[key]))return false;
      }
      return true;
    }
    async function hydrateAndRecover(){
      try{
        let res=await api('/api/temperature-readings');
        let serverRows=Array.isArray(res.readings)?res.readings:[];
        const queued=queuedState();
        if(queued&&Array.isArray(queued.tempReadings)){
          const have=new Set(serverRows.filter(r=>r&&r.id!=null).map(r=>String(r.id)));
          const missing=queued.tempReadings.filter(r=>r&&r.id!=null&&!have.has(String(r.id)));
          if(missing.length){
            await postChunks(missing);
            res=await api('/api/temperature-readings');
            serverRows=Array.isArray(res.readings)?res.readings:[];
            if(typeof toast==='function')toast('Recovered '+missing.length+' unsaved temperature reading'+(missing.length===1?'':'s'),'ok');
          }
          if(queueOnlyTemperatureChanges(queued,STATE))localStorage.removeItem(LS_QUEUE);
        }
        STATE.tempReadings=serverRows;
        baseline=clone(STATE);
        ready=true;
        ONLINE=true;
        updateSync();
        if(typeof rerender==='function')rerender();
      }catch(err){
        ready=false;
        console.warn('Dedicated temperature store is not ready; using normal save path.',err);
      }
    }

    persist=async function(reason){
      if(!serverMode||!ME||!ready)return originalPersist(reason);
      const tempAdds=additions(STATE.tempReadings,baseline.tempReadings);
      if(!tempAdds.length||nonTemperatureChanged()||existingRowsChanged(STATE.tempReadings,baseline.tempReadings))return originalPersist(reason);
      try{
        await postChunks(tempAdds);
        baseline=clone(STATE);
        DIRTY=false;ONLINE=true;
        localStorage.removeItem(LS_QUEUE);
        updateSync();
      }catch(err){
        ONLINE=false;
        try{localStorage.setItem(LS_QUEUE,JSON.stringify({state:STATE,ts:Date.now()}));}catch(_e){}
        updateSync();
        if(typeof toast==='function')toast((err&&err.message)||'Temperature save failed','bad');
      }
    };

    hydrateAndRecover();
  }
  installTemperatureStore();
})();
