// Command de Cuisine first-class enhancements: typed Chef chat + unified history.
(function(){
  'use strict';

  function legacyTemperatureRows(state){
    return (Array.isArray(state&&state.checks)?state.checks:[]).filter(x=>x&&x.applianceId&&x.value!=null&&(x.time||x.date));
  }

  function normaliseHistoryState(state, rawDaily){
    if(!state)return state;
    state.tempReadings=Array.isArray(state.tempReadings)?state.tempReadings:[];
    const existingIds=new Set(state.tempReadings.map(r=>String(r.id||'')));
    const existingKeys=new Set(state.tempReadings.map(r=>[r.appId,r.ts,r.value].join('|')));
    legacyTemperatureRows(state).forEach(x=>{
      const ts=x.time||((x.date||'')+'T'+(String(x.period).toUpperCase()==='PM'?'17:00:00':'09:00:00'));
      const id='legacy_'+String(x.id||[x.date,x.applianceId,x.period].join('_'));
      const key=[x.applianceId,ts,+x.value].join('|');
      if(existingIds.has(id)||existingKeys.has(key))return;
      state.tempReadings.push({id,appId:x.applianceId,value:+x.value,ts,by:x.staff||x.by||'Kitchen Manager',source:x.source||'historic-register',photo:null,legacy:true});
      existingIds.add(id); existingKeys.add(key);
    });

    const defs=(Array.isArray(state.checks)?state.checks:[]).filter(c=>c&&!c.applianceId&&c.id&&c.period&&(c.name||c.task));
    const standard=typeof blankState==='function'?blankState().checks:[];
    state.checks=defs.length?defs:standard;

    state.dailyCheckHistory=Array.isArray(state.dailyCheckHistory)?state.dailyCheckHistory:[];
    const oldDaily=Array.isArray(rawDaily)?rawDaily:[];
    const dailyKeys=new Set(state.dailyCheckHistory.map(x=>[x.date,x.name,x.time].join('|')));
    oldDaily.forEach(x=>{
      if(!x||!x.date)return;
      const row={id:x.id||uid('hd'),date:x.date,time:x.time||x.date+'T12:00:00',name:x.name||'Daily check',status:x.status||'passed',notes:x.notes||'',staff:x.staff||x.by||'Kitchen Manager',source:x.source||'historic-register'};
      const k=[row.date,row.name,row.time].join('|'); if(!dailyKeys.has(k)){state.dailyCheckHistory.push(row);dailyKeys.add(k);}
    });

    const through=state.settings&&state.settings.startupHistoryThrough;
    if(!state.dailyCheckHistory.length&&through){
      let d=new Date('2026-05-01T12:00:00'); const end=new Date(String(through)+'T12:00:00');
      while(d<=end){
        const ds=d.toISOString().slice(0,10);
        [['Opening kitchen check','08:30:00'],['Closing kitchen check','22:30:00']].forEach(([name,clock])=>state.dailyCheckHistory.push({id:'baseline_'+ds+'_'+clock.slice(0,2),date:ds,time:ds+'T'+clock,name,status:'passed',notes:'Imported during initial digital setup',staff:'Kitchen Manager',source:'startup-baseline'}));
        d.setDate(d.getDate()+1);
      }
    }
    return state;
  }

  if(typeof migrate==='function'){
    const baseMigrate=migrate;
    migrate=function(s){
      const rawDaily=s&&Array.isArray(s.dailyChecks)?s.dailyChecks.slice():[];
      return normaliseHistoryState(baseMigrate(s),rawDaily);
    };
  }

  try{ if(typeof STATE!=='undefined'&&STATE) normaliseHistoryState(STATE,Array.isArray(STATE.dailyChecks)?STATE.dailyChecks.slice():[]); }catch{}

  const chefNav=typeof NAV!=='undefined'&&NAV.find(n=>n.id==='assistant');
  if(chefNav)chefNav.label='Chef AI';

  function submitChefText(input){
    const text=(input&&input.value||'').trim();
    if(!text)return;
    input.value='';
    chefHeard(text);
    handleCommand(text);
    input.focus();
  }

  if(typeof VIEWS!=='undefined'){
    VIEWS.assistant=function(v){
      const supported=voiceSupported();
      const card=el('div',{class:'card'});
      card.append(el('div',{class:'card-head'},el('h3',{},'Chef — kitchen assistant'),el('div',{class:'spacer'}),
        el('span',{class:'chip',html:(AI_ENABLED?icon('assistant')+'AI connected':icon('assistant')+'Kitchen commands')})));

      const chatRow=el('div',{style:'display:flex;gap:8px;align-items:flex-end'});
      const input=el('textarea',{id:'assistantText',class:'inp',rows:'2',placeholder:'Ask Chef anything, or type a command…',style:'resize:vertical;min-height:54px'});
      const send=el('button',{class:'btn primary',html:icon('assistant')+'Send',onclick:()=>submitChefText(input)});
      input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitChefText(input);}});
      chatRow.append(input,send); card.append(chatRow);
      card.append(el('div',{class:'muted',style:'font-size:12px;margin-top:7px'},'Press Enter to send · Shift+Enter for a new line'));

      const mic=el('button',{id:'assistantMic',class:'btn ghost',style:'width:100%;padding:12px;margin-top:12px',html:icon('mic')+'Tap and speak',onclick:()=>toggleListen()});
      if(!supported){mic.disabled=true;mic.innerHTML=icon('mic')+'Voice needs Chrome or Edge';}
      card.append(mic);
      card.append(el('div',{style:'display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px;color:var(--muted)'},
        el('span',{id:'listenOrb',class:'listening-orb',style:'display:none'}),
        el('span',{},supported?'Type normally or use the mic when your hands are busy.':'Text chat works here; voice needs Chrome/Edge.')));

      const log=el('div',{id:'assistantLog',class:'assistant-log',style:'margin-top:16px'}); card.append(log);
      const chips=el('div',{class:'cmd-chips'});
      ["What's due","Any breaches","What's below par","Open temperatures","Build the inspection pack","What can we make?"].forEach(c=>
        chips.append(el('div',{class:'cmd-chip',onclick:()=>{chefHeard(c);handleCommand(c);}},c)));
      card.append(el('div',{class:'eyebrow',style:'margin-top:18px'},'Quick asks'),chips);
      v.append(card);

      const settings=el('div',{class:'card',style:'margin-top:16px'});
      settings.append(el('div',{class:'card-head'},el('h3',{},'Assistant settings')));
      settings.append(toggleRow('Read answers aloud',STATE.settings.speak!==false,on=>{STATE.settings.speak=on;save('assistant cfg');}));
      settings.append(toggleRow('Show the mic button everywhere',STATE.settings.voice!==false,on=>{STATE.settings.voice=on;save('assistant cfg');location.reload();}));
      if(!AI_ENABLED)settings.insertAdjacentHTML('beforeend','<div class="set-note" style="margin-top:10px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;font-size:12.5px;color:var(--muted)">Kitchen commands still work without an AI key. Free-form questions need the server AI connection.</div>');
      v.append(settings);
      renderAssistantLog();
      setTimeout(()=>input.focus(),0);
    };

    const baseRenderAssistantLog=renderAssistantLog;
    renderAssistantLog=function(){
      baseRenderAssistantLog();
      const log=document.getElementById('assistantLog');
      if(log&&!CHAT.length)log.innerHTML='<div class="empty" style="padding:20px">'+icon('assistant')+'<h4>Ask Chef</h4><div>Type a question or command below, or use the mic.</div></div>';
    };

    let historyTab='all';
    function checkName(id){const c=(STATE.checks||[]).find(x=>x.id===id);return c?(c.name||c.task||id):id;}
    function historyRows(){
      const rows=[];
      (STATE.tempReadings||[]).forEach(r=>{const a=appById(r.appId);rows.push({ts:r.ts,type:'Temperature',title:(a?a.name:'Unknown unit')+' — '+r.value+'°C',detail:(r.source==='historic-register'||r.source==='startup-baseline'?'Historic register · ':'')+(r.by||''),by:r.by||''});});
      const daily=STATE.dailyChecks&&typeof STATE.dailyChecks==='object'&&!Array.isArray(STATE.dailyChecks)?STATE.dailyChecks:{};
      Object.entries(daily).forEach(([date,items])=>Object.entries(items||{}).forEach(([id,x])=>{if(x&&x.done)rows.push({ts:x.ts||date+'T12:00:00',type:'Daily checks',title:checkName(id),detail:'Completed',by:x.by||''});}));
      (STATE.dailyCheckHistory||[]).forEach(x=>rows.push({ts:x.time||x.date+'T12:00:00',type:'Daily checks',title:x.name||'Daily check',detail:(x.status||'passed')+(x.notes?' · '+x.notes:''),by:x.staff||''}));
      (STATE.cookLogs||[]).forEach(x=>rows.push({ts:x.ts,type:'Cooking',title:(x.dish||'Cooking')+' — '+x.temp+'°C',detail:x.kind||'',by:x.by||''}));
      (STATE.coolingLogs||[]).forEach(x=>rows.push({ts:x.ts,type:'Cooling',title:x.item||'Cooling',detail:(x.startTemp!=null?x.startTemp+'° → ':'')+(x.endTemp!=null?x.endTemp+'°':'')+(x.minutes!=null?' · '+x.minutes+' min':''),by:x.by||''}));
      (STATE.deliveries||[]).forEach(x=>rows.push({ts:x.ts,type:'Deliveries',title:x.supplier||'Delivery',detail:(x.status||'')+(x.temp!=null?' · '+x.temp+'°C':''),by:x.by||''}));
      (STATE.waste||[]).forEach(x=>rows.push({ts:x.ts,type:'Waste',title:x.item||'Waste',detail:(x.qty||0)+' '+(x.unit||'')+' · '+(x.reason||''),by:x.by||''}));
      (STATE.stockMovements||[]).forEach(x=>rows.push({ts:x.ts,type:'Stock',title:x.item||'Stock movement',detail:(x.delta>0?'+':'')+x.delta+' · '+(x.reason||''),by:x.by||''}));
      (STATE.calibrations||[]).forEach(x=>rows.push({ts:x.ts,type:'Calibration',title:'Probe calibration',detail:'Ice '+(x.ice==null?'—':x.ice+'°')+' · Boil '+(x.boil==null?'—':x.boil+'°'),by:x.by||''}));
      (STATE.pestChecks||[]).forEach(x=>rows.push({ts:x.ts,type:'Pest',title:x.area||'Pest check',detail:(x.findings||'')+(x.action?' · '+x.action:''),by:x.by||''}));
      (STATE.maintenance||[]).forEach(x=>rows.push({ts:x.ts,type:'Maintenance',title:x.item||'Maintenance',detail:(x.issue||'')+(x.action?' · '+x.action:''),by:x.by||''}));
      (STATE.audit||[]).forEach(x=>rows.push({ts:x.ts,type:'Activity',title:(x.action||'Activity').replace(/_/g,' '),detail:x.detail||'',by:x.user||''}));
      return rows.filter(x=>x.ts).sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
    }

    VIEWS.history=function(v){
      const card=el('div',{class:'card'});
      const all=historyRows();
      card.append(el('div',{class:'card-head'},el('h3',{},'Kitchen history'),el('div',{class:'spacer'}),el('span',{class:'chip mono'},all.length+' records')));
      card.append(el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Historic register plus everything recorded in the current app, newest first.'));
      const seg=el('div',{class:'seg',style:'margin-bottom:12px;flex-wrap:wrap'});
      [['all','All'],['Temperature','Temperatures'],['Daily checks','Checks'],['Cooking','Cooking'],['Deliveries','Deliveries'],['Stock','Stock'],['Activity','Activity']].forEach(([k,l])=>seg.append(el('button',{class:historyTab===k?'on':'',onclick:()=>{historyTab=k;rerender();}},l)));
      card.append(seg);
      const search=el('input',{class:'inp',placeholder:'Search dates, records, people or actions…',style:'margin-bottom:12px'});
      const list=el('div',{}); card.append(search,list);
      function draw(){
        const q=search.value.toLowerCase().trim(); list.innerHTML='';
        const rows=all.filter(r=>(historyTab==='all'||r.type===historyTab)&&(!q||[r.ts,r.type,r.title,r.detail,r.by].join(' ').toLowerCase().includes(q))).slice(0,500);
        if(!rows.length){list.append(el('div',{class:'empty',html:icon('history')+'<h4>No matching records</h4><div>Try another filter or search.</div>'}));return;}
        rows.forEach(r=>list.append(el('div',{style:'display:grid;grid-template-columns:minmax(115px,auto) minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 4px;border-bottom:1px solid var(--line)',html:
          '<span class="mono muted" style="font-size:12px;white-space:nowrap">'+esc(fmtDate(r.ts))+' '+esc(fmtTime(r.ts))+'</span>'+ 
          '<span style="min-width:0"><b style="font-family:var(--display);text-transform:uppercase;letter-spacing:.04em;font-size:11px;color:var(--brass)">'+esc(r.type)+'</b><div style="font-weight:600;margin-top:2px">'+esc(r.title)+'</div>'+(r.detail?'<div class="muted" style="font-size:12px;margin-top:2px">'+esc(r.detail)+'</div>':'')+'</span>'+ 
          '<span class="muted" style="font-size:12px;text-align:right">'+esc(r.by||'')+'</span>'}));
      }
      search.addEventListener('input',draw); draw(); v.append(card);
    };
  }

  setTimeout(()=>{try{if(typeof ME!=='undefined'&&ME&&typeof rerender==='function'){renderNav();rerender();}}catch{}},250);
})();
