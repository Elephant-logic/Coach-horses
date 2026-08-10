// Command de Cuisine: coverage/backfill, better Chef context, and gallery-friendly image picking.
(function(){
  'use strict';

  const coldUnits=()=>STATE.appliances.filter(a=>a.type==='fridge'||a.type==='freezer');
  const slotForReading=r=>{
    if(r&&r.period)return String(r.period).toLowerCase()==='pm'?'pm':'am';
    const h=+(String(r&&r.ts||'').slice(11,13)||0);
    return h>=12?'pm':'am';
  };
  const dayKey=d=>{
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+day;
  };
  function duePeriods(ds){
    const today=todayISO();
    if(ds<today)return ['am','pm'];
    if(ds>today)return [];
    const h=new Date().getHours(), out=[];
    if(h>=11)out.push('am');
    if(h>=18)out.push('pm');
    return out;
  }
  function readingFor(appId,ds,period){
    return (STATE.tempReadings||[]).filter(r=>r.appId===appId&&String(r.ts||'').slice(0,10)===ds&&slotForReading(r)===period)
      .sort((a,b)=>String(b.ts).localeCompare(String(a.ts)))[0]||null;
  }
  function coverage(days=7){
    const units=coldUnits(), slots=[], today=new Date();
    for(let offset=days-1;offset>=0;offset--){
      const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-offset,12,0,0);
      const ds=dayKey(d);
      duePeriods(ds).forEach(period=>units.forEach(a=>{
        const reading=readingFor(a.id,ds,period);
        slots.push({date:ds,period,app:a,reading,missing:!reading});
      }));
    }
    const missing=slots.filter(x=>x.missing);
    const logged=slots.filter(x=>!x.missing);
    const safe=logged.filter(x=>tempStatus(x.app,x.reading.value)!=='danger');
    return {slots,missing,logged,safe,expected:slots.length,coveragePct:slots.length?Math.round(logged.length/slots.length*100):100,safePct:logged.length?Math.round(safe.length/logged.length*100):100};
  }
  function missingRoundGroups(days=7){
    const groups={};
    coverage(days).missing.forEach(x=>{
      const key=x.date+'|'+x.period;
      if(!groups[key])groups[key]={date:x.date,period:x.period,units:[]};
      groups[key].units.push(x.app);
    });
    return Object.values(groups).sort((a,b)=>(b.date+b.period).localeCompare(a.date+a.period));
  }
  function missingSummary(days=7){
    const groups=missingRoundGroups(days);
    if(!groups.length)return 'No temperature checks are missing in the last '+days+' days.';
    const daysMissing=[...new Set(groups.map(g=>g.date))];
    return groups.length+' temperature round'+(groups.length===1?' is':'s are')+' incomplete across '+daysMissing.length+' day'+(daysMissing.length===1?'':'s')+'. '+groups.slice(0,6).map(g=>g.date+' '+g.period.toUpperCase()+' ('+g.units.length+' unit'+(g.units.length===1?'':'s')+')').join('; ')+(groups.length>6?'; plus '+(groups.length-6)+' more.':'.');
  }

  // A missing day is not 100% compliant. Recorded-but-safe and complete coverage are separate measures.
  weekCompliance=function(){
    const out=[];
    for(let d=6;d>=0;d--){
      const day=new Date(); day.setHours(12,0,0,0); day.setDate(day.getDate()-d);
      const ds=dayKey(day), units=coldUnits(), periods=duePeriods(ds);
      let expected=0,good=0;
      periods.forEach(period=>units.forEach(a=>{
        expected++;
        const r=readingFor(a.id,ds,period);
        if(r&&tempStatus(a,r.value)!=='danger')good++;
      }));
      const pct=expected?Math.round(good/expected*100):100;
      out.push({label:dayName(day),value:pct,color:pct>=95?'var(--ok)':pct>=80?'var(--warn)':'var(--danger)'});
    }
    return out;
  };

  function backfillRound(date,period){
    if(!isMgr()){toast('Managers can add a missed historic temperature round','warn');return;}
    const units=coldUnits();
    const b=el('div',{});
    const dateInp=el('input',{class:'inp',type:'date',value:date,max:todayISO()});
    const periodInp=el('select',{class:'inp'},el('option',{value:'am'},'Morning (AM)'),el('option',{value:'pm'},'Evening (PM)'));
    periodInp.value=period;
    b.append(el('div',{class:'grid g2'},lf('Date',dateInp),lf('Round',periodInp)));
    b.append(el('p',{class:'muted',style:'font-size:12.5px'},'Use this only to enter readings that were genuinely taken at the time (for example from paper notes). The app records that they were entered later.'));
    const values={};
    const host=el('div',{class:'grid g2'}); b.append(host);
    function draw(){
      host.innerHTML='';
      units.forEach(a=>{
        const existing=readingFor(a.id,dateInp.value,periodInp.value);
        const inp=el('input',{class:'inp num mono',type:'number',step:'0.1',placeholder:existing?'Already logged: '+existing.value+'°C':'°C'});
        if(existing)inp.disabled=true;
        inp.addEventListener('input',()=>values[a.id]=inp.value===''?null:+inp.value);
        host.append(lf(a.name,inp));
      });
    }
    dateInp.addEventListener('change',draw); periodInp.addEventListener('change',draw); draw();
    const m=modal({title:'Fill missed temperature round',body:b,footer:[
      el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),
      el('button',{class:'btn primary',html:icon('save')+'Save historic readings',onclick:()=>{
        const ds=dateInp.value,p=periodInp.value;
        if(!ds||ds>todayISO()){toast('Choose a valid past date','warn');return;}
        let added=0;
        units.forEach(a=>{
          if(readingFor(a.id,ds,p))return;
          const val=values[a.id]; if(val==null||!Number.isFinite(val))return;
          STATE.tempReadings.push({id:uid('t'),appId:a.id,value:val,ts:ds+'T'+(p==='am'?'09:00:00':'17:00:00'),period:p,by:ME.username,source:'manager-backfill',backfilled:true,enteredAt:nowISO(),photo:null});
          added++;
        });
        if(!added){toast('Enter at least one missing reading','warn');return;}
        audit('temp_backfill',ds+' '+p.toUpperCase()+' · '+added+' readings entered later');
        save('historic temperature backfill'); m.close(); toast(added+' historic reading'+(added===1?'':'s')+' added','ok'); rerender();
      }})
    ]});
  }

  const originalTempHistory=tempHistory;
  tempHistory=function(v){
    const c=coverage(7), groups=missingRoundGroups(7);
    const card=el('div',{class:'card',style:'margin-bottom:16px;border-color:'+(c.missing.length?'#5a3f26':'var(--line)')});
    card.append(el('div',{class:'card-head'},el('h3',{},'Temperature coverage — last 7 days'),el('div',{class:'spacer'}),el('span',{class:'chip mono'},c.logged.length+'/'+c.expected+' checks')));
    card.append(el('div',{class:'grid g3'},
      kpi('Coverage',c.coveragePct+'%',c.missing.length?c.missing.length+' missing checks':'Complete',c.missing.length?'down':'up','','temp'),
      kpi('Recorded readings safe',c.safePct+'%',c.logged.length+' recorded','','','ok'),
      kpi('Incomplete rounds',groups.length,groups.length?'Needs review':'None','','','alert')));
    if(groups.length){
      const list=el('div',{style:'margin-top:12px'});
      groups.slice(0,14).forEach(g=>{
        const row=el('div',{class:'docket over',style:'margin-bottom:6px'});
        row.append(el('div',{class:'dk-ic'},icon('alert')),el('div',{style:'flex:1'},el('div',{class:'dk-t'},fmtDate(g.date)+' · '+g.period.toUpperCase()+' round'),el('div',{class:'dk-s'},g.units.map(a=>a.name).join(', ')+' missing')));
        if(isMgr())row.append(el('button',{class:'btn sm ghost',html:'Fill in',onclick:()=>backfillRound(g.date,g.period)}));
        list.append(row);
      });
      card.append(list);
      if(isMgr())card.append(el('div',{class:'muted',style:'font-size:12px;margin-top:8px'},'Historic entries are marked as back-filled so the audit trail stays clear.'));
    }
    v.append(card);
    originalTempHistory(v);
  };

  const originalReports=VIEWS.reports;
  VIEWS.reports=function(v){
    const c=coverage(7), groups=missingRoundGroups(7);
    const card=el('div',{class:'card',style:'margin-bottom:16px;border-color:'+(groups.length?'#5a3f26':'var(--line)')});
    card.append(el('div',{class:'card-head'},el('h3',{},'Temperature record coverage — last 7 days'),el('div',{class:'spacer'}),el('span',{class:'tag '+(groups.length?'warn':'ok')},groups.length?'Incomplete':'Complete')));
    card.append(el('div',{class:'grid g3'},
      kpi('Required checks',c.expected,'Fridge/freezer unit checks','','','temp'),
      kpi('Recorded',c.logged.length,c.coveragePct+'% coverage','','','checks'),
      kpi('Missing',c.missing.length,groups.length+' incomplete round'+(groups.length===1?'':'s'),groups.length?'down':'up','','alert')));
    card.append(el('p',{class:'muted',style:'font-size:12.5px;margin:10px 0 0'},groups.length?'The compliance chart now counts missing due readings as incomplete — it will no longer show a missing day as 100% OK.':'All due temperature records are present for this period.'));
    if(groups.length&&isMgr())card.append(el('button',{class:'btn ghost sm',style:'margin-top:10px',html:icon('history')+'Review missing rounds',onclick:()=>{tempTab='history';navigate('temps');}}));
    v.append(card); originalReports(v);
  };

  // Let phones choose an existing photo/file as well as offering the camera.
  photoInput=function(onPick){
    const inp=el('input',{type:'file',accept:'image/*,.jpg,.jpeg,.png,.webp,.heic,.heif',style:'display:none'});
    inp.addEventListener('change',()=>{
      const f=inp.files&&inp.files[0]; if(!f)return;
      const rd=new FileReader(); rd.onload=()=>onPick(rd.result,f); rd.readAsDataURL(f);
    });
    return inp;
  };

  // Make Chef useful for questions about this kitchen, not just the latest temperature.
  aiContext=function(){
    const c=coverage(7), groups=missingRoundGroups(7);
    const low=STATE.stock.filter(s=>+s.qty<+s.par).slice(0,20).map(s=>s.item+' '+s.qty+'/'+s.par+' '+(s.unit||''));
    const temps=coldUnits().map(a=>{const r=latestReading(a.id);return a.name+': '+(r?r.value+'C at '+fmtDate(r.ts)+' '+fmtTime(r.ts):'no reading');});
    const due=(typeof complianceTasks==='function'?complianceTasks():[]).filter(x=>x.state==='due'||x.state==='over').map(x=>x.label+' ('+(x.detail||x.state)+')');
    const prep=(STATE.prepLists||[]).filter(x=>!x.done).slice(0,15).map(x=>x.item+(x.assignee?' -> '+x.assignee:''));
    const funcs=(STATE.functions||[]).filter(f=>f.date>=todayISO()&&f.status!=='done').sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8).map(f=>f.date+' '+f.name+' '+(f.finalGuests||f.guests||0)+' guests');
    const events=(STATE.events||[]).filter(e=>e.date>=todayISO()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8).map(e=>e.date+' '+e.title);
    return [
      'Signed in: '+(ME.name||ME.username)+' ('+ME.role+').',
      'Temperature coverage last 7 days: '+c.logged.length+'/'+c.expected+' required checks, '+c.missing.length+' missing; recorded-reading safety '+c.safePct+'%.',
      'Missing temperature rounds: '+(groups.length?groups.map(g=>g.date+' '+g.period.toUpperCase()+' ['+g.units.map(a=>a.name).join(', ')+']').join('; '):'none')+'.',
      'Latest cold-chain readings: '+temps.join('; ')+'.',
      'Outstanding compliance: '+(due.join('; ')||'none')+'.',
      'Below par: '+(low.join('; ')||'none')+'.',
      'Outstanding prep: '+(prep.join('; ')||'none')+'.',
      'Upcoming functions: '+(funcs.join('; ')||'none')+'.',
      'Upcoming planner items: '+(events.join('; ')||'none')+'.'
    ].join(' ');
  };

  askAI=async function(question){
    chefSay('Let me check…',false);
    try{
      const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({
        model:'gpt-4o-mini',
        input:[
          {role:'system',content:'You are Chef AI inside Command de Cuisine for a working pub kitchen. Be useful, specific and concise. Use the supplied live app data first. Never say records are complete when the context says readings/checks are missing. If the user asks how to do something in the app, give the exact section and action. If the user asks what is missing, name the dates, rounds and units from context. Do not invent readings, completed checks, stock, bookings or actions. When a manager can correct a historic missed temperature record, explain that Temperatures > History has a manager back-fill control and that it is only for readings genuinely taken at the time. For general kitchen questions not answered by live data, say that you are giving general guidance. Give enough detail to act on, usually 2-5 short paragraphs or bullets, not a one-line answer.'},
          {role:'system',content:'Live kitchen data: '+aiContext()},
          {role:'user',content:question}
        ]
      })});
      let out='';
      try{out=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join(' ').trim();}catch{}
      if(!out&&r.output_text)out=r.output_text;
      chefSay(out||'I could not get a useful answer just now.',false);
    }catch(err){chefSay('The AI service is not reachable right now. Kitchen commands and the app still work.',false);}
  };

  const originalHandle=handleCommand;
  handleCommand=function(raw){
    const t=String(raw||'').toLowerCase();
    if(/missing.*temp|temp.*missing|missed.*(temp|round)|which.*(temp|round).*(missing|missed)/.test(t)){
      chefSay(missingSummary(7),false);
      if(ROUTE!=='temps'){tempTab='history';navigate('temps');}
      return;
    }
    return originalHandle(raw);
  };
})();
