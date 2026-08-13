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

// Keep browser activity history bounded without allowing it to jam temperature saves.
(function(){
  'use strict';
  function installAuditSaveFix(){
    if(typeof STATE==='undefined'||typeof uid!=='function'||typeof nowISO!=='function')return setTimeout(installAuditSaveFix,150);
    if(window.__boundedAuditSaveFixInstalled)return;
    window.__boundedAuditSaveFixInstalled=true;
    audit=function(action,detail){
      STATE.audit=Array.isArray(STATE.audit)?STATE.audit:[];
      STATE.audit.unshift({id:uid('a'),ts:nowISO(),user:(typeof ME!=='undefined'&&ME?ME.username:'local'),action,detail:detail||''});
      STATE.audit=STATE.audit.slice(0,400);
    };
  }
  installAuditSaveFix();
})();

// Compact manager saves: ordinary edits send only changed top-level sections, and live
// temperature checks send only newly appended readings instead of the whole historic state.
(function(){
  'use strict';
  function installCompactSave(){
    if(typeof STATE==='undefined'||typeof persist!=='function'||typeof api!=='function'||typeof updateSync!=='function'||typeof serverMode==='undefined')return setTimeout(installCompactSave,150);
    if(serverMode&&(!ME||ME.role!=='manager'))return setTimeout(installCompactSave,300);
    if(window.__compactStateSaveInstalled)return;
    window.__compactStateSaveInstalled=true;

    const originalPersist=persist;
    const clone=x=>JSON.parse(JSON.stringify(x));
    const canon=x=>JSON.stringify(x);
    let base=clone(STATE);

    function additions(current,previous){
      const prevIds=new Set((previous||[]).filter(x=>x&&x.id!=null).map(x=>String(x.id)));
      return (current||[]).filter(x=>x&&x.id!=null&&!prevIds.has(String(x.id)));
    }
    function existingChanged(current,previous){
      const cur=new Map((current||[]).filter(x=>x&&x.id!=null).map(x=>[String(x.id),x]));
      for(const old of (previous||[])){
        if(!old||old.id==null)continue;
        const now=cur.get(String(old.id));
        if(!now||canon(now)!==canon(old))return true;
      }
      return false;
    }
    function makePayload(reason){
      const changes={};
      const protectedKeys=new Set(['tempReadings','audit','users','settings']);
      const keys=new Set([...Object.keys(base||{}),...Object.keys(STATE||{})]);
      for(const key of keys){
        if(protectedKeys.has(key))continue;
        if(canon((base||{})[key])!==canon(STATE[key]))changes[key]=STATE[key];
      }
      return {
        action:'compact-state-save',revision:REV,reason:reason||'edit',changes,
        temperatureAdditions:additions(STATE.tempReadings,base.tempReadings),
        auditAdditions:additions(STATE.audit,base.audit)
      };
    }

    persist=async function(reason){
      if(!serverMode||!ME||ME.role!=='manager')return originalPersist(reason);
      // Account/security settings continue to use the original hardened save path.
      if(canon(base.users)!==canon(STATE.users)||canon(base.settings)!==canon(STATE.settings))return originalPersist(reason);
      // Existing temperatures are protected; this compact path only appends new readings.
      if(existingChanged(STATE.tempReadings,base.tempReadings))return originalPersist(reason);

      const payload=makePayload(reason);
      const hasChanges=Object.keys(payload.changes).length||payload.temperatureAdditions.length||payload.auditAdditions.length;
      if(!hasChanges){DIRTY=false;ONLINE=true;localStorage.removeItem(LS_QUEUE);updateSync();return;}
      try{
        const res=await api('/api/temperature-paper-import/undo',{method:'POST',body:JSON.stringify(payload)});
        REV=res.revision;DIRTY=false;ONLINE=true;base=clone(STATE);localStorage.removeItem(LS_QUEUE);updateSync();
      }catch(err){
        if(err.status===409&&err.data&&err.data.state){
          STATE=migrate(err.data.state);REV=err.data.revision;base=clone(STATE);DIRTY=false;ONLINE=true;localStorage.removeItem(LS_QUEUE);updateSync();toast('Reloaded newer shared data','warn');rerender();
        }else{
          ONLINE=false;
          try{localStorage.setItem(LS_QUEUE,JSON.stringify({compact:true,reason:reason||'edit',ts:Date.now()}));}catch{}
          updateSync();
          const msg=err&&err.data&&err.data.stateBytes?('Save blocked: app state is '+(err.data.stateBytes/1048576).toFixed(1)+' MB'):'';
          if(msg)toast(msg,'bad');
        }
      }
    };
  }
  installCompactSave();
})();
