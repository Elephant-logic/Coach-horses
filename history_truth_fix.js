// Command de Cuisine: truthful unified kitchen history.
(function(){
  'use strict';
  if(typeof STATE==='undefined'||typeof VIEWS==='undefined')return;

  const real=row=>!(row&&row.source==='startup-baseline');
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
    if(x==='menu-import')return 'Menu import';
    return String(x).replace(/[-_]/g,' ');
  }
  function rows(){
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
    (STATE.cookLogs||[]).forEach(x=>add(out,x.ts,'Cooking',(x.dish||'Cooking')+(x.temp!=null?' — '+x.temp+'°C':''),x.kind||'',x.by,x.source));
    (STATE.coolingLogs||[]).forEach(x=>add(out,x.ts,'Cooling',x.item||'Cooling',(x.startTemp!=null?x.startTemp+'° → ':'')+(x.endTemp!=null?x.endTemp+'°':'')+(x.minutes!=null?' · '+x.minutes+' min':''),x.by,x.source));
    (STATE.deliveries||[]).forEach(x=>add(out,x.ts,'Deliveries',x.supplier||'Delivery',(x.status||'')+(x.temp!=null?' · '+x.temp+'°C':''),x.by,x.source));
    (STATE.waste||[]).forEach(x=>add(out,x.ts,'Waste',x.item||'Waste',(x.qty||0)+' '+(x.unit||'')+(x.reason?' · '+x.reason:''),x.by,x.source));
    (STATE.stockMovements||[]).forEach(x=>add(out,x.ts,'Stock',x.item||'Stock movement',(x.delta>0?'+':'')+(x.delta??'')+(x.reason?' · '+x.reason:''),x.by,x.source));
    (STATE.calibrations||[]).forEach(x=>add(out,x.ts,'Calibration','Probe calibration','Ice '+(x.ice==null?'—':x.ice+'°')+' · Boil '+(x.boil==null?'—':x.boil+'°'),x.by,x.source));
    (STATE.pestChecks||[]).forEach(x=>add(out,x.ts,'Pest',x.area||'Pest check',(x.findings||'')+(x.action?' · '+x.action:''),x.by,x.source));
    (STATE.maintenance||[]).forEach(x=>add(out,x.ts,'Maintenance',x.item||'Maintenance',(x.issue||'')+(x.action?' · '+x.action:''),x.by,x.source));
    (STATE.audit||[]).filter(real).forEach(x=>add(out,x.ts,'Activity',(x.action||'Activity').replace(/_/g,' '),x.detail||'',x.user,x.source));
    return out.sort((a,b)=>String(b.ts).localeCompare(String(a.ts)));
  }

  VIEWS.history=function(v){
    const all=rows();
    const card=el('div',{class:'card'});
    card.append(
      el('div',{class:'card-head'},el('h3',{},'Kitchen history'),el('div',{class:'spacer'}),el('span',{class:'chip mono'},all.length+' genuine records')),
      el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Actual recorded kitchen activity only. The old generated startup baseline is excluded. Manager back-fills remain visible and are labelled as entered later.')
    );

    const types=['Temperature','Daily checks','Cooking','Cooling','Deliveries','Waste','Stock','Calibration','Pest','Maintenance','Activity'];
    const seg=el('div',{class:'seg',style:'margin-bottom:12px;flex-wrap:wrap'});
    [['all','All'],...types.map(x=>[x,x==='Daily checks'?'Checks':x])].forEach(([k,l])=>seg.append(el('button',{class:historyTab===k?'on':'',onclick:()=>{historyTab=k;rerender();}},l)));
    card.append(seg);

    const search=el('input',{class:'inp',placeholder:'Search date, record, person, source or action…',style:'margin-bottom:12px'});
    const list=el('div',{});card.append(search,list);
    function draw(){
      list.innerHTML='';
      const q=search.value.toLowerCase().trim();
      const filtered=all.filter(r=>(historyTab==='all'||r.type===historyTab)&&(!q||[r.ts,r.type,r.title,r.detail,r.by,r.source].join(' ').toLowerCase().includes(q))).slice(0,1000);
      if(!filtered.length){list.append(el('div',{class:'empty'},el('h4',{},'No matching records'),el('div',{},'There are no genuine records matching this filter.')));return;}
      filtered.forEach(r=>{
        const row=el('div',{style:'display:grid;grid-template-columns:minmax(115px,auto) minmax(0,1fr) auto;gap:12px;align-items:start;padding:10px 4px;border-bottom:1px solid var(--line)'});
        row.append(el('span',{class:'mono muted',style:'font-size:12px;white-space:nowrap'},fmtDate(r.ts)+' '+fmtTime(r.ts)));
        const mid=el('span',{style:'min-width:0'});
        mid.append(el('b',{style:'font-family:var(--display);text-transform:uppercase;letter-spacing:.04em;font-size:11px;color:var(--brass)'},r.type),el('div',{style:'font-weight:600;margin-top:2px'},r.title));
        if(r.detail)mid.append(el('div',{class:'muted',style:'font-size:12px;margin-top:2px'},r.detail));
        if(r.source)mid.append(el('div',{class:'mono muted',style:'font-size:10.5px;margin-top:3px'},sourceLabel(r.source)));
        row.append(mid,el('span',{class:'muted',style:'font-size:12px;text-align:right'},r.by));
        list.append(row);
      });
    }
    search.addEventListener('input',draw);draw();v.append(card);
  };
})();
