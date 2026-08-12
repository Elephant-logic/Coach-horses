// Command de Cuisine: unify temperature history and recover genuinely missing legacy slots.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__temperatureHistoryReconcileInstalled)return;
    window.__temperatureHistoryReconcileInstalled=true;

    const LEGACY_KEYS=['cdc_state_v1','cdc_dirty_v1'];
    const real=r=>!(r&&r.source==='startup-baseline');
    const period=r=>String(r&&r.period||((+(String(r&&r.ts||'').slice(11,13))<12)?'AM':'PM')).toUpperCase();
    const date=r=>String(r&&r.ts||'').slice(0,10);
    const slot=r=>date(r)+'|'+String(r&&r.appId||'')+'|'+period(r);
    const sourceLabel=s=>s==='paper-log-import'?'Paper sheet import':s==='legacy-device'?'Recovered original app':s==='manager-backfill'?'Manager back-fill':s==='manager-transition-gap'?'Manager transition record':String(s||'Recorded').replace(/[-_]/g,' ');
    const clone=x=>JSON.parse(JSON.stringify(x));

    function legacyStates(){
      const out=[];
      for(const key of LEGACY_KEYS){
        try{
          const raw=localStorage.getItem(key);if(!raw)continue;
          const parsed=JSON.parse(raw);const state=key==='cdc_dirty_v1'?(parsed&&parsed.state):parsed;
          if(state&&Array.isArray(state.tempReadings))out.push({key,label:key==='cdc_dirty_v1'?'Original app unsynced data':'Original app saved data',state});
        }catch(e){console.warn('Legacy temperature state unreadable',key,e);}
      }
      return out;
    }

    function missingFrom(source){
      const current=new Set((STATE.tempReadings||[]).filter(real).map(slot));
      return (source.tempReadings||[]).filter(real).filter(r=>r&&r.appId&&r.ts&&r.value!==null&&r.value!==''&&!current.has(slot(r)));
    }

    async function applyMissing(rows,label){
      STATE.tempReadings=Array.isArray(STATE.tempReadings)?STATE.tempReadings:[];
      const current=new Set(STATE.tempReadings.filter(real).map(slot));
      let added=0;
      for(const raw of rows){
        const k=slot(raw);if(current.has(k))continue;
        const r=clone(raw);r.id=typeof uid==='function'?uid('t'):(r.id||('legacy-'+Date.now()+'-'+added));
        if(!r.source||r.source==='startup-baseline')r.source='legacy-device';
        r.recoveredFrom=label;r.recoveredAt=typeof nowISO==='function'?nowISO():new Date().toISOString();
        STATE.tempReadings.push(r);current.add(k);added++;
      }
      if(!added){toast('No missing original temperature slots found','warn');return;}
      if(typeof audit==='function')audit('recover_missing_original_temperatures',added+' missing temperature readings recovered from '+label);
      if(typeof save==='function')save('recover missing original temperatures');
      if(typeof persist==='function')await persist('recover missing original temperatures');
      toast(added+' missing original temperature readings recovered','ok');rerender();
    }

    function recoverMissingTemps(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const states=legacyStates();
      const body=el('div',{});
      if(!states.length){
        body.append(el('div',{class:'empty'},el('h4',{},'No original app state on this browser'),el('div',{},'The old cdc_state_v1 / cdc_dirty_v1 data is not present on this device.')));
        modal({title:'Recover missing original temperatures',body});return;
      }
      const choices=[];
      states.forEach((s,i)=>{
        const missing=missingFrom(s.state);const dates=missing.map(date).filter(Boolean).sort();
        const row=el('label',{class:'docket',style:'cursor:pointer;display:flex;gap:10px;align-items:flex-start'});const radio=el('input',{type:'radio',name:'old-temp-source',value:String(i)});if(i===0)radio.checked=true;choices.push(radio);
        row.append(radio,el('div',{},el('div',{class:'dk-t'},s.label),el('div',{class:'dk-s'},missing.length+' missing readings'+(dates.length?' · '+dates[0]+' to '+dates[dates.length-1]:''))));body.append(row);
      });
      body.append(el('p',{class:'muted',style:'font-size:12.5px'},'Recovery is slot-based: date + appliance + AM/PM. Anything already present from paper import, manager back-fill or current use is kept and never overwritten.'));
      let m;const recover=el('button',{class:'btn primary',html:icon('history')+'Recover missing slots'});
      recover.onclick=async()=>{const idx=+((choices.find(x=>x.checked)||choices[0]).value);const src=states[idx];const rows=missingFrom(src.state);recover.disabled=true;try{await applyMissing(rows,src.label);m.close();}catch(e){recover.disabled=false;toast(e&&e.message||String(e),'bad');}};
      m=modal({title:'Recover missing original temperatures',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),recover]});
    }
    window.recoverMissingOriginalTemperatures=recoverMissingTemps;

    function registerCard(){
      const rows=(STATE.tempReadings||[]).filter(real).slice().sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')));
      const card=el('div',{class:'card',style:'margin-top:16px'});
      const head=el('div',{class:'card-head'},el('h3',{},'Temperature register'),el('div',{class:'spacer'}),el('span',{class:'chip mono'},rows.length+' readings'));
      if(typeof isMgr!=='function'||isMgr())head.append(el('button',{class:'btn ghost sm',html:icon('history')+'Recover missing original temps',onclick:recoverMissingTemps}));
      card.append(head,el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'One register for live readings, paper-sheet imports, manager back-fills and genuine original-app recovery.'));
      const list=el('div',{});for(const r of rows.slice(0,3000)){
        const a=typeof appById==='function'?appById(r.appId):null;const info=el('div',{});
        info.append(el('div',{class:'dk-t'},date(r)+' · '+(a?a.name:'Unknown unit')+' '+period(r)+' · '+r.value+'°C'),el('div',{class:'dk-s'},sourceLabel(r.source)+(r.paperSigned?' · signed '+r.paperSigned:'')+(r.by?' · '+r.by:'')));
        list.append(el('div',{class:'docket',style:'margin-bottom:5px'},info));
      }
      if(!rows.length)list.append(el('div',{class:'empty'},el('h4',{},'No temperature history'),el('div',{},'No genuine temperature readings are currently stored.')));
      card.append(list);return card;
    }

    const oldHistory=VIEWS.history;
    if(typeof oldHistory==='function')VIEWS.history=function(v){oldHistory(v);v.append(registerCard());};
    const oldRecords=VIEWS.temprecords;
    if(typeof oldRecords==='function')VIEWS.temprecords=function(v){oldRecords(v);if(typeof isMgr!=='function'||isMgr())v.append(el('div',{class:'card',style:'margin-top:16px'},el('div',{class:'card-head'},el('h3',{},'Original app reconciliation'),el('div',{class:'spacer'}),el('button',{class:'btn ghost sm',html:icon('history')+'Recover missing original temps',onclick:recoverMissingTemps})),el('p',{class:'muted'},'Checks the original app state for temperature slots that are genuinely absent from the current register.')));};
  }
  install();
})();
