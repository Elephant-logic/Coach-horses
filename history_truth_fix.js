// Command de Cuisine: truthful unified kitchen history + genuine legacy-device recovery.
(function(){
  'use strict';
  if(typeof STATE==='undefined'||typeof VIEWS==='undefined')return;

  const LEGACY_STATE_KEY='cdc_state_v1';
  const LEGACY_QUEUE_KEY='cdc_dirty_v1';
  const real=row=>!(row&&row.source==='startup-baseline');
  const clone=x=>JSON.parse(JSON.stringify(x));
  const cleanList=key=>{if(Array.isArray(STATE[key]))STATE[key]=STATE[key].filter(real);};
  ['tempReadings','dailyCheckHistory'].forEach(cleanList);

  let historyTab='all';
  function add(rows,ts,type,title,detail,by,source){
    if(!ts||source==='startup-baseline')return;
    rows.push({ts,type,title,detail:detail||'',by:by||'',source:source||''});
  }
  function checkName(id){
    const c=(STATE.checks||[]).find(x=>x.id===id);
    return c?(c.name||c.task||id):id;
  }
  function sourceLabel(x){
    if(!x)return '';
    if(x==='manager-backfill')return 'Manager back-fill';
    if(x==='historic-register')return 'Historic register';
    if(x==='legacy-device')return 'Recovered old device record';
    if(x==='menu-import')return 'Menu import';
    return String(x).replace(/[-_]/g,' ');
  }
  function rowTs(x){return x&&(x.ts||x.time||x.date||x.completedAt||x.lastDone||'');}

  function historyRows(){
    const out=[];
    (STATE.tempReadings||[]).filter(real).forEach(r=>{
      const a=typeof appById==='function'?appById(r.appId):null;
      const flags=[];
      if(r.backfilled)flags.push('Entered later');
      if(r.enteredVia==='chef-ai')flags.push('via Chef AI');
      if(r.source)flags.push(sourceLabel(r.source));
      add(out,r.ts,'Temperature',(a?a.name:'Unknown unit')+' — '+r.value+'°C',flags.join(' · '),r.by,r.source);
    });
    const daily=STATE.dailyChecks&&typeof STATE.dailyChecks==='object'&&!Array.isArray(STATE.dailyChecks)?STATE.dailyChecks:{};
    Object.entries(daily).forEach(([date,items])=>Object.entries(items||{}).forEach(([id,x])=>{
      if(x&&x.done)add(out,x.ts||date+'T12:00:00','Daily checks',checkName(id),'Completed',x.by,x.source);
    }));
    (STATE.dailyCheckHistory||[]).filter(real).forEach(x=>add(out,x.time||x.date+'T12:00:00','Daily checks',x.name||'Daily check',(x.status||'passed')+(x.notes?' · '+x.notes:''),x.staff,x.source));
    (STATE.cookLogs||[]).filter(real).forEach(x=>add(out,x.ts,'Cooking',(x.dish||'Cooking')+(x.temp!=null?' — '+x.temp+'°C':''),x.kind||'',x.by,x.source));
    (STATE.coolingLogs||[]).filter(real).forEach(x=>add(out,x.ts,'Cooling',x.item||'Cooling',(x.startTemp!=null?x.startTemp+'° → ':'')+(x.endTemp!=null?x.endTemp+'°':'')+(x.minutes!=null?' · '+x.minutes+' min':''),x.by,x.source));
    (STATE.deliveries||[]).filter(real).forEach(x=>add(out,x.ts,'Deliveries',x.supplier||'Delivery',(x.status||'')+(x.temp!=null?' · '+x.temp+'°C':''),x.by,x.source));
    (STATE.waste||[]).filter(real).forEach(x=>add(out,x.ts,'Waste',x.item||'Waste',(x.qty||0)+' '+(x.unit||'')+(x.reason?' · '+x.reason:''),x.by,x.source));
    (STATE.stockMovements||[]).filter(real).forEach(x=>add(out,x.ts,'Stock',x.item||'Stock movement',(x.delta>0?'+':'')+(x.delta??'')+(x.reason?' · '+x.reason:''),x.by,x.source));
    (STATE.calibrations||[]).filter(real).forEach(x=>add(out,x.ts,'Calibration','Probe calibration','Ice '+(x.ice==null?'—':x.ice+'°')+' · Boil '+(x.boil==null?'—':x.boil+'°'),x.by,x.source));
    (STATE.pestChecks||[]).filter(real).forEach(x=>add(out,x.ts,'Pest',x.area||'Pest check',(x.findings||'')+(x.action?' · '+x.action:''),x.by,x.source));
    (STATE.maintenance||[]).filter(real).forEach(x=>add(out,x.ts,'Maintenance',x.item||'Maintenance',(x.issue||'')+(x.action?' · '+x.action:''),x.by,x.source));
    (STATE.fryerLogs||[]).filter(real).forEach(x=>add(out,x.ts,'Fryer oil',x.fryer||'Fryer',(x.tpm!=null?'TPM '+x.tpm:'')+(x.action?' · '+x.action:''),x.by,x.source));
    (STATE.fitness||[]).filter(real).forEach(x=>add(out,x.ts,'Fitness',x.name||'Fitness to work',x.kind==='return'?'Fit to return':(x.note||'Illness record'),x.by||x.staff,x.source));
    (STATE.training||[]).filter(real).forEach(x=>add(out,rowTs(x),'Training',x.course||x.name||'Training',(x.status||'')+(x.expiry?' · expires '+x.expiry:''),x.by||x.staff,x.source));
    (STATE.timeEntries||[]).filter(real).forEach(x=>add(out,x.in||x.ts||x.date,'Timesheets',x.name||x.user||'Shift',(x.out?'Clocked out '+x.out:'Clock in'),x.user||x.by,x.source));
    (STATE.scheduleCompletions||[]).filter(real).forEach(x=>add(out,rowTs(x),'Cleaning',x.task||x.name||'Cleaning task',x.note||x.status||'Completed',x.by,x.source));
    (STATE.paperwork||[]).filter(real).forEach(x=>add(out,rowTs(x),'Paperwork',x.type||x.title||'Kitchen record',x.note||x.notes||x.action||'',x.by||x.staff,x.source));
    (STATE.operations||[]).filter(real).forEach(x=>add(out,rowTs(x),'Operations',x.title||x.name||x.type||'Operation',x.detail||x.note||x.status||'',x.by||x.user,x.source));
    (STATE.menuImports||[]).filter(real).forEach(x=>add(out,rowTs(x),'Menu import',x.name||x.menuName||'Menu import',x.status||'',x.by||x.user,x.source));
    (STATE.audit||[]).filter(real).forEach(x=>add(out,x.ts,'Activity',(x.action||'Activity').replace(/_/g,' '),x.detail||'',x.user,x.source));
    return out.sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
  }

  function legacyCandidates(){
    const found=[];
    try{
      const raw=localStorage.getItem(LEGACY_STATE_KEY);
      if(raw){const s=JSON.parse(raw);if(s&&typeof s==='object')found.push({key:LEGACY_STATE_KEY,label:'old on-device state',state:s});}
    }catch(e){console.warn('Could not read old local state',e);}
    try{
      const raw=localStorage.getItem(LEGACY_QUEUE_KEY);
      if(raw){const q=JSON.parse(raw),s=q&&q.state;if(s&&typeof s==='object')found.push({key:LEGACY_QUEUE_KEY,label:'old unsynced queue',state:s});}
    }catch(e){console.warn('Could not read old queued state',e);}
    return found;
  }

  const arrayKeys=['tempReadings','cookLogs','coolingLogs','calibrations','pestChecks','deliveries','waste','timeEntries','training','maintenance','fryerLogs','stockMovements','paperwork','operations','scheduleCompletions','menuImports','fitness','audit'];
  function signature(key,x){
    if(x&&x.id)return 'id:'+x.id;
    if(key==='tempReadings')return [x.appId,x.ts,x.value].join('|');
    return [rowTs(x),x&&x.name,x&&x.item,x&&x.type,x&&x.action,x&&x.by,x&&x.user].join('|');
  }
  function previewLegacy(source){
    let count=0;const dates=[];const breakdown={};
    arrayKeys.forEach(key=>{
      const rows=Array.isArray(source[key])?source[key].filter(real):[];
      if(rows.length)breakdown[key]=rows.length;
      count+=rows.length;rows.forEach(x=>{const t=rowTs(x);if(t)dates.push(String(t).slice(0,10));});
    });
    const daily=source.dailyChecks&&typeof source.dailyChecks==='object'&&!Array.isArray(source.dailyChecks)?source.dailyChecks:{};
    Object.entries(daily).forEach(([date,items])=>{const n=Object.values(items||{}).filter(x=>x&&x.done&&real(x)).length;if(n){count+=n;breakdown.dailyChecks=(breakdown.dailyChecks||0)+n;dates.push(date);}});
    dates.sort();return {count,breakdown,from:dates[0]||'',to:dates[dates.length-1]||''};
  }

  async function mergeLegacy(source,label){
    let added=0;const addedBy={};
    arrayKeys.forEach(key=>{
      const incoming=(Array.isArray(source[key])?source[key]:[]).filter(real);
      if(!incoming.length)return;
      STATE[key]=Array.isArray(STATE[key])?STATE[key]:[];
      const seen=new Set(STATE[key].map(x=>signature(key,x)));
      incoming.forEach(raw=>{
        const sig=signature(key,raw);if(seen.has(sig))return;
        const x=clone(raw);if(!x.source)x.source='legacy-device';x.recoveredFrom=label;x.recoveredAt=nowISO();
        STATE[key].push(x);seen.add(sig);added++;addedBy[key]=(addedBy[key]||0)+1;
      });
    });
    const oldDaily=source.dailyChecks&&typeof source.dailyChecks==='object'&&!Array.isArray(source.dailyChecks)?source.dailyChecks:{};
    STATE.dailyChecks=STATE.dailyChecks&&typeof STATE.dailyChecks==='object'&&!Array.isArray(STATE.dailyChecks)?STATE.dailyChecks:{};
    Object.entries(oldDaily).forEach(([date,items])=>{
      const dest=STATE.dailyChecks[date]=STATE.dailyChecks[date]||{};
      Object.entries(items||{}).forEach(([id,raw])=>{
        if(!raw||!raw.done||!real(raw)||dest[id])return;
        const x=clone(raw);if(!x.source)x.source='legacy-device';x.recoveredFrom=label;x.recoveredAt=nowISO();dest[id]=x;added++;addedBy.dailyChecks=(addedBy.dailyChecks||0)+1;
      });
    });
    if(!added){toast('No new historic records were found to recover','warn');return 0;}
    if(typeof audit==='function')audit('recover_device_history',added+' genuine historic records recovered from '+label);
    if(typeof save==='function')save('recover old device history');
    if(typeof persist==='function')await persist('recover old device history');
    toast(added+' old history records recovered','ok');rerender();return added;
  }

  function recoverHistory(){
    if(typeof isMgr==='function'&&!isMgr()){toast('Manager access required','warn');return;}
    const candidates=legacyCandidates();
    const body=el('div',{});
    if(!candidates.length){body.append(el('div',{class:'empty'},el('h4',{},'No old device history found'),el('div',{},'This browser does not currently contain cdc_state_v1 or cdc_dirty_v1. A Command de Cuisine backup JSON from the old device can still be imported separately.')));modal({title:'Recover old history',body,footer:[el('button',{class:'btn primary',html:'Close',onclick:e=>e.currentTarget.closest('.modal')?.remove()})]});return;}
    body.append(el('p',{class:'muted',style:'margin-top:0'},'This only adds historic operational records that are not already present. It does not replace current readings, users, settings, stock levels, menus or recipes. Generated startup-baseline rows are ignored.'));
    const choices=[];
    candidates.forEach((c,i)=>{
      const p=previewLegacy(c.state),row=el('label',{class:'docket',style:'display:flex;gap:10px;align-items:flex-start;margin-bottom:7px;cursor:pointer'}),cb=el('input',{type:'radio',name:'legacy-history-source',value:String(i)});
      if(i===0)cb.checked=true;choices.push(cb);
      row.append(cb,el('div',{},el('div',{class:'dk-t'},c.label),el('div',{class:'dk-s'},p.count+' records'+(p.from?' · '+p.from+' to '+p.to:'')+' · '+Object.entries(p.breakdown).map(([k,n])=>k+' '+n).join(', '))));body.append(row);
    });
    const m=modal({title:'Recover old history',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),el('button',{class:'btn primary',html:icon('history')+'Recover records',onclick:async e=>{const idx=+((choices.find(x=>x.checked)||choices[0]).value);e.currentTarget.disabled=true;await mergeLegacy(candidates[idx].state,candidates[idx].label);m.close();}})]});
  }

  VIEWS.history=function(v){
    const all=historyRows();
    const card=el('div',{class:'card'});
    const head=el('div',{class:'card-head'},el('h3',{},'Kitchen history'),el('div',{class:'spacer'}),el('span',{class:'chip mono'},all.length+' genuine records'));
    if((!isMgr||isMgr()))head.append(el('button',{class:'btn ghost sm',html:icon('history')+'Recover old history',onclick:recoverHistory}));
    card.append(head,el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Actual recorded kitchen activity. Generated startup-baseline entries are excluded; genuine manager back-fills and recovered legacy records stay clearly identified.'));

    const types=['Temperature','Daily checks','Cooking','Cooling','Deliveries','Waste','Stock','Calibration','Pest','Maintenance','Fryer oil','Fitness','Training','Timesheets','Cleaning','Paperwork','Operations','Menu import','Activity'];
    const seg=el('div',{class:'seg',style:'margin-bottom:12px;flex-wrap:wrap'});
    [['all','All'],...types.map(x=>[x,x==='Daily checks'?'Checks':x])].forEach(([k,l])=>seg.append(el('button',{class:historyTab===k?'on':'',onclick:()=>{historyTab=k;rerender();}},l)));
    card.append(seg);
    const search=el('input',{class:'inp',placeholder:'Search date, record, person, source or action…',style:'margin-bottom:12px'}),list=el('div',{});card.append(search,list);
    function draw(){
      list.innerHTML='';const q=search.value.toLowerCase().trim();
      const filtered=all.filter(r=>(historyTab==='all'||r.type===historyTab)&&(!q||[r.ts,r.type,r.title,r.detail,r.by,r.source].join(' ').toLowerCase().includes(q))).slice(0,2000);
      if(!filtered.length){list.append(el('div',{class:'empty'},el('h4',{},'No matching records'),el('div',{},'No genuine records match this filter. If older records were saved on this device, use Recover old history.')));return;}
      filtered.forEach(r=>{
        const row=el('div',{style:'display:grid;grid-template-columns:minmax(115px,auto) minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 4px;border-bottom:1px solid var(--line)'});
        row.append(el('span',{class:'mono muted',style:'font-size:12px;white-space:nowrap'},fmtDate(r.ts)+' '+fmtTime(r.ts)));
        const mid=el('span',{style:'min-width:0'});mid.append(el('b',{style:'font-family:var(--display);text-transform:uppercase;letter-spacing:.04em;font-size:11px;color:var(--brass)'},r.type),el('div',{style:'font-weight:600;margin-top:2px'},r.title));
        if(r.detail)mid.append(el('div',{class:'muted',style:'font-size:12px;margin-top:2px'},r.detail));if(r.source)mid.append(el('div',{class:'mono muted',style:'font-size:10.5px;margin-top:3px'},sourceLabel(r.source)));
        row.append(mid,el('span',{class:'muted',style:'font-size:12px;text-align:right'},r.by));list.append(row);
      });
    }
    search.addEventListener('input',draw);draw();v.append(card);
  };
})();
