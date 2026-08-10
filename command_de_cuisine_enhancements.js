// Command de Cuisine: typed Chef chat + unified operational history.
(function(){
  'use strict';

  function normaliseHistoryState(state, rawDaily){
    if(!state)return state;
    state.tempReadings=Array.isArray(state.tempReadings)?state.tempReadings:[];
    const legacy=(Array.isArray(state.checks)?state.checks:[]).filter(x=>x&&x.applianceId&&x.value!=null&&(x.time||x.date));
    const seen=new Set(state.tempReadings.map(r=>[r.appId,r.ts,r.value].join('|')));
    legacy.forEach(x=>{
      const ts=x.time||((x.date||'')+'T'+(String(x.period).toUpperCase()==='PM'?'17:00:00':'09:00:00'));
      const key=[x.applianceId,ts,+x.value].join('|');
      if(seen.has(key))return;
      state.tempReadings.push({id:'legacy_'+String(x.id||uid('t')),appId:x.applianceId,value:+x.value,ts,by:x.staff||x.by||'Kitchen Manager',source:x.source||'historic-register',photo:null,legacy:true});
      seen.add(key);
    });

    const defs=(Array.isArray(state.checks)?state.checks:[]).filter(c=>c&&!c.applianceId&&c.id&&c.period&&(c.name||c.task));
    state.checks=defs.length?defs:(typeof blankState==='function'?blankState().checks:[]);

    state.dailyCheckHistory=Array.isArray(state.dailyCheckHistory)?state.dailyCheckHistory:[];
    const dailySeen=new Set(state.dailyCheckHistory.map(x=>[x.date,x.name,x.time].join('|')));
    (Array.isArray(rawDaily)?rawDaily:[]).forEach(x=>{
      if(!x||!x.date)return;
      const row={id:x.id||uid('hd'),date:x.date,time:x.time||x.date+'T12:00:00',name:x.name||'Daily check',status:x.status||'passed',notes:x.notes||'',staff:x.staff||x.by||'Kitchen Manager',source:x.source||'historic-register'};
      const key=[row.date,row.name,row.time].join('|');
      if(!dailySeen.has(key)){state.dailyCheckHistory.push(row);dailySeen.add(key);}
    });

    const through=state.settings&&state.settings.startupHistoryThrough;
    if(!state.dailyCheckHistory.length&&through){
      let d=new Date('2026-05-01T12:00:00');
      const end=new Date(String(through)+'T12:00:00');
      while(d<=end){
        const ds=d.toISOString().slice(0,10);
        [['Opening kitchen check','08:30:00'],['Closing kitchen check','22:30:00']].forEach(([name,clock])=>{
          state.dailyCheckHistory.push({id:'baseline_'+ds+'_'+clock.slice(0,2),date:ds,time:ds+'T'+clock,name,status:'passed',notes:'Imported during initial digital setup',staff:'Kitchen Manager',source:'startup-baseline'});
        });
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

  try{
    if(typeof STATE!=='undefined'&&STATE){
      normaliseHistoryState(STATE,Array.isArray(STATE.dailyChecks)?STATE.dailyChecks.slice():[]);
    }
  }catch{}

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
      card.append(el('div',{class:'card-head'},el('h3',{},'Chef — kitchen assistant'),el('div',{class:'spacer'}),el('span',{class:'chip',html:(AI_ENABLED?icon('assistant')+'AI connected':icon('assistant')+'Kitchen commands')})));

      const chatRow=el('div',{style:'display:flex;gap:8px;align-items:flex-end'});
      const input=el('textarea',{id:'assistantText',class:'inp',rows:'2',placeholder:'Ask Chef anything, or type a command…',style:'resize:vertical;min-height:54px'});
      const send=el('button',{class:'btn primary',html:icon('assistant')+'Send',onclick:()=>submitChefText(input)});
      input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitChefText(input);}});
      chatRow.append(input,send);
      card.append(chatRow,el('div',{class:'muted',style:'font-size:12px;margin-top:7px'},'Press Enter to send · Shift+Enter for a new line'));

      const mic=el('button',{id:'assistantMic',class:'btn ghost',style:'width:100%;padding:12px;margin-top:12px',html:icon('mic')+'Tap and speak',onclick:()=>toggleListen()});
      if(!supported){mic.disabled=true;mic.innerHTML=icon('mic')+'Voice needs Chrome or Edge';}
      card.append(mic,el('div',{style:'display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px;color:var(--muted)'},el('span',{id:'listenOrb',class:'listening-orb',style:'display:none'}),el('span',{},supported?'Type normally or use the mic when your hands are busy.':'Text chat works here; voice needs Chrome/Edge.')));

      const log=el('div',{id:'assistantLog',class:'assistant-log',style:'margin-top:16px'});
      card.append(log);
      const chips=el('div',{class:'cmd-chips'});
      ["What's due","Any breaches","What's below par","Open temperatures","Build the inspection pack","What can we make?"].forEach(c=>chips.append(el('div',{class:'cmd-chip',onclick:()=>{chefHeard(c);handleCommand(c);}},c)));
      card.append(el('div',{class:'eyebrow',style:'margin-top:18px'},'Quick asks'),chips);
      v.append(card);

      const settings=el('div',{class:'card',style:'margin-top:16px'});
      settings.append(el('div',{class:'card-head'},el('h3',{},'Assistant settings')));
      settings.append(toggleRow('Read answers aloud',STATE.settings.speak!==false,on=>{STATE.settings.speak=on;save('assistant cfg');}));
      settings.append(toggleRow('Show the mic button everywhere',STATE.settings.voice!==false,on=>{STATE.settings.voice=on;save('assistant cfg');location.reload();}));
      if(!AI_ENABLED)settings.append(el('div',{class:'set-note',style:'margin-top:10px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;font-size:12.5px;color:var(--muted)'},'Kitchen commands still work without an AI key. Free-form questions need the server AI connection.'));
      v.append(settings);
      renderAssistantLog();
      setTimeout(()=>input.focus(),0);
    };

    const originalLog=renderAssistantLog;
    renderAssistantLog=function(){
      originalLog();
      const log=document.getElementById('assistantLog');
      if(log&&!CHAT.length){
        log.innerHTML='';
        log.append(el('div',{class:'empty',style:'padding:20px'},el('h4',{},'Ask Chef'),el('div',{},'Type a question or command, or use the mic.')));
      }
    };

    let historyTab='all';
    function checkName(id){
      const c=(STATE.checks||[]).find(x=>x.id===id);
      return c?(c.name||c.task||id):id;
    }
    function add(rows,ts,type,title,detail,by){if(ts)rows.push({ts,type,title,detail:detail||'',by:by||''});}
    function historyRows(){
      const rows=[];
      (STATE.tempReadings||[]).forEach(r=>{const a=appById(r.appId);add(rows,r.ts,'Temperature',(a?a.name:'Unknown unit')+' — '+r.value+'°C',(r.legacy?'Historic register · ':'')+(r.source||''),r.by);});
      const daily=STATE.dailyChecks&&typeof STATE.dailyChecks==='object'&&!Array.isArray(STATE.dailyChecks)?STATE.dailyChecks:{};
      Object.entries(daily).forEach(([date,items])=>Object.entries(items||{}).forEach(([id,x])=>{if(x&&x.done)add(rows,x.ts||date+'T12:00:00','Daily checks',checkName(id),'Completed',x.by);}));
      (STATE.dailyCheckHistory||[]).forEach(x=>add(rows,x.time||x.date+'T12:00:00','Daily checks',x.name||'Daily check',(x.status||'passed')+(x.notes?' · '+x.notes:''),x.staff));
      (STATE.cookLogs||[]).forEach(x=>add(rows,x.ts,'Cooking',(x.dish||'Cooking')+' — '+x.temp+'°C',x.kind,x.by));
      (STATE.coolingLogs||[]).forEach(x=>add(rows,x.ts,'Cooling',x.item||'Cooling',(x.startTemp!=null?x.startTemp+'° → ':'')+(x.endTemp!=null?x.endTemp+'°':'')+(x.minutes!=null?' · '+x.minutes+' min':''),x.by));
      (STATE.deliveries||[]).forEach(x=>add(rows,x.ts,'Deliveries',x.supplier||'Delivery',(x.status||'')+(x.temp!=null?' · '+x.temp+'°C':''),x.by));
      (STATE.waste||[]).forEach(x=>add(rows,x.ts,'Waste',x.item||'Waste',(x.qty||0)+' '+(x.unit||'')+' · '+(x.reason||''),x.by));
      (STATE.stockMovements||[]).forEach(x=>add(rows,x.ts,'Stock',x.item||'Stock movement',(x.delta>0?'+':'')+x.delta+' · '+(x.reason||''),x.by));
      (STATE.calibrations||[]).forEach(x=>add(rows,x.ts,'Calibration','Probe calibration','Ice '+(x.ice==null?'—':x.ice+'°')+' · Boil '+(x.boil==null?'—':x.boil+'°'),x.by));
      (STATE.pestChecks||[]).forEach(x=>add(rows,x.ts,'Pest',x.area||'Pest check',(x.findings||'')+(x.action?' · '+x.action:''),x.by));
      (STATE.maintenance||[]).forEach(x=>add(rows,x.ts,'Maintenance',x.item||'Maintenance',(x.issue||'')+(x.action?' · '+x.action:''),x.by));
      (STATE.audit||[]).forEach(x=>add(rows,x.ts,'Activity',(x.action||'Activity').replace(/_/g,' '),x.detail,x.user));
      return rows.sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
    }

    VIEWS.history=function(v){
      const all=historyRows();
      const card=el('div',{class:'card'});
      card.append(el('div',{class:'card-head'},el('h3',{},'Kitchen history'),el('div',{class:'spacer'}),el('span',{class:'chip mono'},all.length+' records')));
      card.append(el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Historic register plus everything recorded in the current app, newest first.'));
      const seg=el('div',{class:'seg',style:'margin-bottom:12px;flex-wrap:wrap'});
      [['all','All'],['Temperature','Temperatures'],['Daily checks','Checks'],['Cooking','Cooking'],['Deliveries','Deliveries'],['Stock','Stock'],['Activity','Activity']].forEach(([k,l])=>seg.append(el('button',{class:historyTab===k?'on':'',onclick:()=>{historyTab=k;rerender();}},l)));
      card.append(seg);
      const search=el('input',{class:'inp',placeholder:'Search dates, records, people or actions…',style:'margin-bottom:12px'});
      const list=el('div',{});
      card.append(search,list);

      function draw(){
        list.innerHTML='';
        const q=search.value.toLowerCase().trim();
        const rows=all.filter(r=>(historyTab==='all'||r.type===historyTab)&&(!q||[r.ts,r.type,r.title,r.detail,r.by].join(' ').toLowerCase().includes(q))).slice(0,500);
        if(!rows.length){list.append(el('div',{class:'empty'},el('h4',{},'No matching records'),el('div',{},'Try another filter or search.')));return;}
        rows.forEach(r=>{
          const row=el('div',{style:'display:grid;grid-template-columns:minmax(115px,auto) minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 4px;border-bottom:1px solid var(--line)'});
          row.append(el('span',{class:'mono muted',style:'font-size:12px;white-space:nowrap'},fmtDate(r.ts)+' '+fmtTime(r.ts)));
          const middle=el('span',{style:'min-width:0'});
          middle.append(el('b',{style:'font-family:var(--display);text-transform:uppercase;letter-spacing:.04em;font-size:11px;color:var(--brass)'},r.type),el('div',{style:'font-weight:600;margin-top:2px'},r.title));
          if(r.detail)middle.append(el('div',{class:'muted',style:'font-size:12px;margin-top:2px'},r.detail));
          row.append(middle,el('span',{class:'muted',style:'font-size:12px;text-align:right'},r.by));
          list.append(row);
        });
      }
      search.addEventListener('input',draw);
      draw();
      v.append(card);
    };
  }

  setTimeout(()=>{try{if(typeof ME!=='undefined'&&ME&&typeof rerender==='function'){renderNav();rerender();}}catch{}},250);
})();
