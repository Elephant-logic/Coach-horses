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
      card.append(el('p',{class:'muted',style:'font-size:12.5px;margin-top:-5px'},'Coverage checked from '+c.from+' to '+c.to+'. Missing means at least one fridge/freezer reading is absent for that AM/PM round.'));
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

    window.openTemperatureGapFill=fillGap;
    const oldHistory=VIEWS.history;
    if(typeof oldHistory==='function')VIEWS.history=function(v){oldHistory(v);v.append(gapCard());};
    const oldRecords=VIEWS.temprecords;
    if(typeof oldRecords==='function')VIEWS.temprecords=function(v){oldRecords(v);v.append(gapCard());};
  }
  install();
})();
