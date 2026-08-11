// Manager-only Chef AI commands for genuine historic temperature backfill.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const coldUnits=()=>STATE.appliances.filter(a=>a.type==='fridge'||a.type==='freezer');
  const slotForReading=r=>{
    if(r&&r.period)return String(r.period).toLowerCase()==='pm'?'pm':'am';
    const h=+(String(r&&r.ts||'').slice(11,13)||0);
    return h>=12?'pm':'am';
  };
  const readingFor=(appId,date,period)=>(STATE.tempReadings||[]).find(r=>r.appId===appId&&String(r.ts||'').slice(0,10)===date&&slotForReading(r)===period);
  const isBackfillIntent=t=>/\b(back\s*fill|backfill|fill in|fill|enter|add|log|record)\b.*\b(temp|temperature|temps|reading|readings|fridge|freezer|round)\b|\b(missed|missing)\b.*\b(temp|temperature|temps|reading|readings|round)\b/i.test(t);
  const hasTemperatureNumber=t=>/-?\d+(?:\.\d+)?/.test(String(t||''));

  function unitByName(name){
    const n=norm(name).replace(/\bone\b/g,'1').replace(/\btwo\b/g,'2').replace(/\bthree\b/g,'3').replace(/\bfour\b/g,'4').replace(/\bfive\b/g,'5');
    return coldUnits().find(a=>norm(a.name)===n)||coldUnits().find(a=>n.includes(norm(a.name))||norm(a.name).includes(n));
  }

  function missingGroups(days=7){
    const out=[]; const units=coldUnits(); const now=new Date();
    for(let d=days-1;d>=0;d--){
      const x=new Date(now.getFullYear(),now.getMonth(),now.getDate()-d,12,0,0);
      const date=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
      const periods=date<todayISO()?['am','pm']:(date===todayISO()?(new Date().getHours()>=18?['am','pm']:new Date().getHours()>=11?['am']:[]):[]);
      periods.forEach(period=>{
        const missing=units.filter(a=>!readingFor(a.id,date,period));
        if(missing.length)out.push({date,period,units:missing});
      });
    }
    return out;
  }

  function tellMissing(){
    const groups=missingGroups(7);
    if(!groups.length){chefSay('There are no missing due fridge or freezer temperature readings in the last 7 days.',false);return;}
    chefSay('I can back-fill them, but I need the readings that were genuinely taken. Missing: '+groups.map(g=>g.date+' '+g.period.toUpperCase()+' — '+g.units.map(a=>a.name).join(', ')).join('; ')+'. Tell me the actual values, for example “yesterday AM, Fridge 1 4.2, Fridge 2 3.8”.',false);
  }

  async function parseBackfill(raw){
    const units=coldUnits().map(a=>a.name);
    const prompt=[
      'Convert this manager instruction into historic kitchen temperature entries.',
      'Return ONLY JSON: {"entries":[{"date":"YYYY-MM-DD","period":"am|pm","unit":"exact unit name","value":number}]}',
      'Today is '+todayISO()+'. Resolve yesterday and named weekdays relative to today.',
      'Allowed units: '+units.join(', ')+'.',
      'Do not invent values. If a unit has no explicit temperature value in the instruction, omit it.',
      'Do not infer one value for several units unless the user explicitly gives that value for each/all named units.',
      'Morning means am; evening/afternoon/PM means pm.',
      'Instruction: '+raw
    ].join('\n');
    const r=await api('/api/openai/responses',{method:'POST',body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt}]}]})});
    let text=r.output_text||'';
    if(!text){try{text=(r.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');}catch{}}
    const a=text.indexOf('{'),b=text.lastIndexOf('}');
    if(a<0||b<a)throw new Error('I could not understand those readings.');
    const obj=JSON.parse(text.slice(a,b+1));
    return Array.isArray(obj.entries)?obj.entries:[];
  }

  function validateEntries(entries){
    const good=[],problems=[];
    entries.forEach(e=>{
      const date=String(e.date||'').slice(0,10),period=String(e.period||'').toLowerCase()==='pm'?'pm':'am',app=unitByName(e.unit),value=Number(e.value);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>todayISO()){problems.push((e.unit||'Reading')+': invalid date');return;}
      if(!app){problems.push((e.unit||'Unknown unit')+': unit not found');return;}
      if(!Number.isFinite(value)||value<-50||value>100){problems.push(app.name+': invalid temperature');return;}
      if(readingFor(app.id,date,period)){problems.push(app.name+' '+date+' '+period.toUpperCase()+': already recorded');return;}
      good.push({app,date,period,value});
    });
    return {good,problems};
  }

  function confirmBackfill(entries,problems){
    if(!entries.length){
      chefSay(problems.length?'I did not add anything. '+problems.join('; ')+'.':'I could not find any explicit temperature values to add.',false);
      return;
    }
    const b=el('div',{});
    b.append(el('p',{class:'muted',style:'margin-top:0'},'These will be recorded as readings entered later by '+(ME.name||ME.username)+'. Only confirm if these values were genuinely taken at the time.'));
    entries.forEach(x=>b.append(el('div',{class:'docket',style:'margin-bottom:6px'},
      el('div',{class:'dk-ic'},icon('temp')),
      el('div',{style:'flex:1'},el('div',{class:'dk-t'},x.app.name+' — '+x.value+'°C'),el('div',{class:'dk-s'},fmtDate(x.date)+' · '+x.period.toUpperCase()+' round')))));
    if(problems.length)b.append(el('div',{class:'set-note',style:'margin-top:10px'},'Not included: '+problems.join('; ')));
    const m=modal({title:'Confirm historic temperatures',body:b,footer:[
      el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),
      el('button',{class:'btn primary',html:icon('save')+'Confirm & save',onclick:()=>{
        let added=0;
        entries.forEach(x=>{
          if(readingFor(x.app.id,x.date,x.period))return;
          STATE.tempReadings.push({id:uid('t'),appId:x.app.id,value:x.value,ts:x.date+'T'+(x.period==='am'?'09:00:00':'17:00:00'),period:x.period,by:ME.username,source:'manager-backfill',backfilled:true,enteredAt:nowISO(),enteredVia:'chef-ai',photo:null});
          added++;
        });
        if(!added){toast('Those readings are already present','warn');m.close();return;}
        audit('temp_backfill_ai',added+' historic readings entered via Chef AI');
        save('Chef AI historic temperature backfill');
        m.close();
        chefSay(added+' historic temperature reading'+(added===1?'':'s')+' saved and marked as manager back-fill.',false);
        if(ROUTE==='temps'||ROUTE==='reports')rerender();
      }})
    ]});
  }

  const originalHandle=handleCommand;
  handleCommand=async function(raw){
    const t=String(raw||'').trim();
    if(isBackfillIntent(t)){
      if(!ME||ME.role!=='manager'){
        chefSay('Historic temperature back-fill is manager-only.',false);
        return;
      }
      if(!hasTemperatureNumber(t)){
        tellMissing();
        return;
      }
      chefSay('I’ll check those historic readings before saving anything…',false);
      try{
        const parsed=await parseBackfill(t);
        const {good,problems}=validateEntries(parsed);
        confirmBackfill(good,problems);
      }catch(err){
        chefSay((err&&err.message)||'I could not safely understand those readings. Give me the date or round, unit names and actual temperatures.',false);
      }
      return;
    }
    return originalHandle(raw);
  };
})();
