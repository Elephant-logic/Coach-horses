// Command de Cuisine: controlled manager rollback for mistaken paper temperature imports.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof api!=='function')return setTimeout(install,150);
    if(window.__paperImportUndoInstalled)return;
    window.__paperImportUndoInstalled=true;

    function batches(){
      const map=new Map();
      for(const r of (STATE.tempReadings||[])){
        if(!r||r.source!=='paper-log-import')continue;
        const key=String(r.paperImportBatchId||r.enteredAt||'legacy-paper-import').trim();
        if(!map.has(key))map.set(key,{key,rows:[],files:new Set(),dates:[]});
        const b=map.get(key);b.rows.push(r);
        if(r.paperSourceFile)b.files.add(String(r.paperSourceFile));
        if(r.ts)b.dates.push(String(r.ts).slice(0,10));
      }
      return [...map.values()].map(b=>{
        b.dates.sort();
        return {key:b.key,count:b.rows.length,files:[...b.files],from:b.dates[0]||'',to:b.dates[b.dates.length-1]||''};
      }).sort((a,b)=>String(b.key).localeCompare(String(a.key)));
    }

    async function undoBatch(batch,button,close){
      button.disabled=true;
      try{
        const res=await api('/api/temperature-paper-import/undo',{method:'POST',body:JSON.stringify({batch:batch.key})});
        toast((res&&res.message)||'Paper import deleted','ok');
        if(close)close();
        setTimeout(()=>location.reload(),300);
      }catch(e){
        button.disabled=false;
        toast((e&&e.message)||String(e),'bad');
      }
    }

    function confirmUndo(batch){
      const body=el('div',{});
      body.append(
        el('div',{class:'notice bad'},'This deletes only this paper-photo import. Live readings, manager back-fills and other history are not touched.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},batch.count+' imported readings · '+(batch.from||'unknown')+(batch.to&&batch.to!==batch.from?' to '+batch.to:'')),
          el('div',{class:'dk-s'},batch.files.length?batch.files.join(', '):'Paper photo import')
        ))
      );
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const del=el('button',{class:'btn danger',html:'Delete this bad import'});
      del.onclick=()=>undoBatch(batch,del,()=>m.close());
      m=modal({title:'Delete bad paper import',body,footer:[cancel,del]});
    }

    function openManager(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const bs=batches();
      const body=el('div',{});
      if(!bs.length){
        body.append(el('div',{class:'empty'},el('h4',{},'No paper imports found'),el('div',{},'There are no paper temperature imports to delete.')));
        modal({title:'Delete bad paper import',body});
        return;
      }
      body.append(el('p',{class:'muted',style:'margin-top:0'},'Choose the mistaken import. Check its date range and photo names before deleting it.'));
      let m;
      for(const b of bs){
        const row=el('div',{class:'docket',style:'display:flex;gap:10px;align-items:center;margin-bottom:7px'});
        const info=el('div',{style:'min-width:0;flex:1'});
        info.append(
          el('div',{class:'dk-t'},b.count+' readings · '+(b.from||'unknown')+(b.to&&b.to!==b.from?' to '+b.to:'')),
          el('div',{class:'dk-s'},b.files.length?b.files.join(', '):'Paper import')
        );
        row.append(info,el('button',{class:'btn danger sm',html:'Delete',onclick:()=>{m.close();confirmUndo(b);}}));
        body.append(row);
      }
      m=modal({title:'Delete bad paper import',body,footer:[el('button',{class:'btn ghost',html:'Close',onclick:()=>m.close()})]});
    }
    window.openPaperImportDelete=openManager;

    function topCard(){
      const c=el('div',{class:'card',style:'margin-bottom:16px;border-color:rgba(255,90,90,.35)'});
      const head=el('div',{class:'card-head'},el('h3',{},'Paper import controls'),el('div',{class:'spacer'}));
      if(typeof isMgr!=='function'||isMgr())head.append(el('button',{class:'btn danger',html:'Delete bad paper import',onclick:openManager}));
      c.append(head,el('p',{class:'muted'},'Remove a mistaken paper-sheet import as one batch, without touching live readings or manager back-fills.'));
      return c;
    }

    const oldRecords=VIEWS.temprecords;
    if(typeof oldRecords==='function')VIEWS.temprecords=function(v){v.append(topCard());oldRecords(v);};
    const oldHistory=VIEWS.history;
    if(typeof oldHistory==='function')VIEWS.history=function(v){oldHistory(v);if(typeof isMgr!=='function'||isMgr())v.append(topCard());};
  }
  install();
})();

// Touch-friendly +/- temperature controls for live and historic temperature forms.
(function(){
  'use strict';
  if(window.__temperatureStepperInstalled)return;
  window.__temperatureStepperInstalled=true;
  const style=document.createElement('style');
  style.textContent='.temp-stepper{display:grid;grid-template-columns:52px minmax(88px,1fr) 52px;gap:8px;align-items:stretch;width:100%}.temp-stepper .temp-step-btn{min-height:50px;border-radius:9px;border:1px solid var(--line2);background:var(--panel2);color:var(--ink);font-size:26px;font-weight:700;display:grid;place-items:center;touch-action:manipulation}.temp-stepper input[type=number]{min-height:50px;text-align:center;font-family:var(--mono);font-size:19px;font-weight:600;margin:0}.temp-stepper input[type=number]::-webkit-inner-spin-button,.temp-stepper input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}';
  document.head.appendChild(style);

  function isTemperatureInput(input){
    if(!(input instanceof HTMLInputElement)||input.type!=='number'||input.dataset.tempStepper==='1')return false;
    const text=((input.placeholder||'')+' '+(input.name||'')+' '+(input.getAttribute('aria-label')||'')+' '+(input.closest('label')?.innerText||'')).toLowerCase();
    return text.includes('°c')||text.includes('temperature')||text.includes('fridge')||text.includes('freezer')||text.includes('cold room')||text.includes('hot hold');
  }

  function enhance(input){
    if(!isTemperatureInput(input))return;
    input.dataset.tempStepper='1';
    if(!input.step||input.step==='any')input.step='0.1';
    const wrap=document.createElement('div');
    wrap.className='temp-stepper';
    const down=document.createElement('button');
    down.type='button';down.className='temp-step-btn';down.textContent='−';down.setAttribute('aria-label','Decrease temperature');
    const up=document.createElement('button');
    up.type='button';up.className='temp-step-btn';up.textContent='+';up.setAttribute('aria-label','Increase temperature');
    input.parentNode.insertBefore(wrap,input);
    wrap.append(down,input,up);

    function change(direction){
      const step=Number(input.step)||0.1;
      let value=Number(input.value);
      if(!Number.isFinite(value))value=0;
      value+=direction*step;
      if(input.min!==''&&Number.isFinite(Number(input.min)))value=Math.max(Number(input.min),value);
      if(input.max!==''&&Number.isFinite(Number(input.max)))value=Math.min(Number(input.max),value);
      input.value=(Math.round(value*10)/10).toFixed(1);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    down.addEventListener('click',()=>change(-1));
    up.addEventListener('click',()=>change(1));
  }

  function scan(root){
    if(root.matches&&root.matches('input[type=number]'))enhance(root);
    if(root.querySelectorAll)root.querySelectorAll('input[type=number]').forEach(enhance);
  }
  scan(document);
  new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node);}))).observe(document.body,{childList:true,subtree:true});
})();

// Reversible reset for historic temperature recovery/import data.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__historicTemperatureResetInstalled)return;
    window.__historicTemperatureResetInstalled=true;
    const recoverySources=new Set(['paper-log-import','backfill-file-import','manager-backfill']);
    const gapSources=new Set(['paper-log-gap','backfill-file-gap']);
    const isRecovery=r=>r&&recoverySources.has(String(r.source||''));
    const isGap=g=>g&&gapSources.has(String(g.source||''));

    function summary(){
      const rows=(STATE.tempReadings||[]).filter(isRecovery);
      const gaps=(STATE.paperTempGaps||[]).filter(isGap);
      const by={};rows.forEach(r=>{const k=String(r.source||'unknown');by[k]=(by[k]||0)+1;});
      const dates=rows.map(r=>String(r.ts||'').slice(0,10)).filter(Boolean).sort();
      return {rows,gaps,by,from:dates[0]||'',to:dates[dates.length-1]||''};
    }
    async function persistReset(reason){
      if(typeof save==='function')save(reason);
      if(typeof persist==='function')await persist(reason);
    }
    function openReset(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const s=summary();
      const body=el('div',{});
      body.append(
        el('div',{class:'notice warn'},'This clears historic recovery/import data only. Normal live temperature readings are kept.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},s.rows.length+' recovery readings · '+s.gaps.length+' documented gaps'),
          el('div',{class:'dk-s'},(s.from&&s.to?s.from+' to '+s.to+' · ':'')+Object.entries(s.by).map(([k,v])=>k+': '+v).join(' · '))
        )),
        el('p',{class:'muted'},'Before clearing anything, the current recovery rows are copied into a reset archive inside the app. You can restore the most recent reset afterwards.'),
        el('label',{},el('div',{class:'eyebrow',style:'margin:'+'12px 0 6px'},'Type RESET HISTORIC to confirm'),el('input',{class:'inp',id:'historicTempResetConfirm',placeholder:'RESET HISTORIC',autocomplete:'off'}))
      );
      let m;
      const reset=el('button',{class:'btn danger',html:'Reset historic recovery'});
      reset.onclick=async()=>{
        const typed=(body.querySelector('#historicTempResetConfirm')||{}).value||'';
        if(typed!=='RESET HISTORIC')return toast('Type RESET HISTORIC exactly','warn');
        reset.disabled=true;
        try{
          const archive={id:'temp-reset-'+Date.now(),resetAt:new Date().toISOString(),resetBy:(typeof ME!=='undefined'&&ME&&ME.username)||'manager',readings:s.rows,gaps:s.gaps};
          STATE.temperatureRecoveryArchive=Array.isArray(STATE.temperatureRecoveryArchive)?STATE.temperatureRecoveryArchive:[];
          STATE.temperatureRecoveryArchive.push(archive);
          STATE.temperatureRecoveryArchive=STATE.temperatureRecoveryArchive.slice(-5);
          STATE.tempReadings=(STATE.tempReadings||[]).filter(r=>!isRecovery(r));
          STATE.paperTempGaps=(STATE.paperTempGaps||[]).filter(g=>!isGap(g));
          if(typeof audit==='function')audit('reset_historic_temperature_recovery',s.rows.length+' recovery readings and '+s.gaps.length+' gaps archived and cleared');
          await persistReset('reset historic temperature recovery');
          toast('Historic recovery reset. Live readings kept.','ok');
          m.close();setTimeout(()=>location.reload(),300);
        }catch(e){reset.disabled=false;toast((e&&e.message)||String(e),'bad');}
      };
      m=modal({title:'Start temperature history afresh',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),reset]});
    }
    async function restoreLast(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const archive=Array.isArray(STATE.temperatureRecoveryArchive)?STATE.temperatureRecoveryArchive:[];
      if(!archive.length)return toast('There is no temperature reset to restore','warn');
      const last=archive[archive.length-1];
      const ids=new Set((STATE.tempReadings||[]).map(r=>String(r&&r.id||'')));
      const gapIds=new Set((STATE.paperTempGaps||[]).map(g=>String(g&&g.id||'')));
      const readings=(last.readings||[]).filter(r=>!ids.has(String(r&&r.id||'')));
      const gaps=(last.gaps||[]).filter(g=>!gapIds.has(String(g&&g.id||'')));
      STATE.tempReadings=(STATE.tempReadings||[]).concat(readings);
      STATE.paperTempGaps=(STATE.paperTempGaps||[]).concat(gaps);
      STATE.temperatureRecoveryArchive=archive.slice(0,-1);
      if(typeof audit==='function')audit('restore_historic_temperature_reset',readings.length+' readings and '+gaps.length+' gaps restored');
      try{await persistReset('restore historic temperature reset');toast('Last historic reset restored','ok');setTimeout(()=>location.reload(),300);}catch(e){toast((e&&e.message)||String(e),'bad');}
    }
    window.openHistoricTemperatureReset=openReset;
    window.restoreLastHistoricTemperatureReset=restoreLast;
    function card(){
      const c=el('div',{class:'card',style:'margin-bottom:16px;border-color:rgba(255,170,70,.35)'});
      const h=el('div',{class:'card-head'},el('h3',{},'Start historic temperatures afresh'),el('div',{class:'spacer'}));
      if(typeof isMgr!=='function'||isMgr())h.append(el('button',{class:'btn danger',html:'Reset historic recovery',onclick:openReset}));
      c.append(h,el('p',{class:'muted'},'Clears paper imports, prepared recovery imports and manager historic backfills while preserving normal live readings. The last reset can be restored.'));
      if(typeof isMgr!=='function'||isMgr())c.append(el('button',{class:'btn ghost sm',html:'Restore last reset',onclick:restoreLast}));
      return c;
    }
    const old=VIEWS.temprecords;
    if(typeof old==='function')VIEWS.temprecords=function(v){v.append(card());old(v);};
  }
  install();
})();
