from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

def rep(old, new, count=-1):
    global s
    if old not in s:
        raise SystemExit('Missing expected source contract: ' + old[:100])
    s = s.replace(old, new, count)

rep('  s.settings=s.settings||{}; s.settings.modules=s.settings.modules||{};\n', '  s.settings=s.settings||{}; s.settings.modules=s.settings.modules||{};\n  // Older server states used an array here; the UI expects a date-keyed object.\n  if(!s.dailyChecks || Array.isArray(s.dailyChecks) || typeof s.dailyChecks!=="object") s.dailyChecks={};\n')

rep('''  // give every unit its own wifi sensor; keep at least one handheld probe
  s.probes=s.probes||[];
  s.appliances.forEach(a=>{ if(!s.probes.some(p=>p.type==="wifi"&&p.appId===a.id)) s.probes.push({id:uid("pr"),name:a.name+" sensor",type:"wifi",appId:a.id,last:null,battery:100}); });
  if(!s.probes.some(p=>p.type==="bluetooth")) s.probes.push({id:uid("pr"),name:"Blue handheld probe",type:"bluetooth",appId:null,last:null,battery:90});
''','''  // Keep configured probes, but never invent connected WiFi sensors in a live kitchen.
  s.probes=Array.isArray(s.probes)?s.probes:[];
  if(!serverMode && !s.probes.some(p=>p.type==="bluetooth")) s.probes.push({id:uid("pr"),name:"Blue handheld probe",type:"bluetooth",appId:null,last:null,battery:90});
''')

rep('''  const probes=[{id:"pr0",name:"Blue handheld probe",type:"bluetooth",appId:null,last:null,battery:100}];
  appliances.forEach((a,i)=>probes.push({id:"prw"+(i+1),name:a.name+" sensor",type:"wifi",appId:a.id,last:null,battery:100}));
''','''  const probes=[{id:"pr0",name:"Blue handheld probe",type:"bluetooth",appId:null,last:null,battery:100}];
''', 1)

rep('function readAllWifi(){ let n=0; STATE.probes.filter(p=>p.type==="wifi"&&p.appId).forEach(p=>{const a=appById(p.appId);if(!a)return;const val=+((a.type==="freezer"?-19:a.type==="hot"?68:4)+(Math.random()*1.6-0.8)).toFixed(1);p.last=val;STATE.tempReadings.push({id:uid("t"),appId:a.id,value:val,ts:nowISO(),by:ME.username,source:"probe",photo:null});n++;}); save("wifi read"); if(ROUTE==="temps"||ROUTE==="pass")rerender(); renderNav(); return n; }', '''function readAllWifi(){
  if(serverMode){ toast("WiFi sensors are not connected yet — no reading was recorded","warn"); return 0; }
  let n=0; STATE.probes.filter(p=>p.type==="wifi"&&p.appId).forEach(p=>{const a=appById(p.appId);if(!a)return;const val=+((a.type==="freezer"?-19:a.type==="hot"?68:4)+(Math.random()*1.6-0.8)).toFixed(1);p.last=val;STATE.tempReadings.push({id:uid("t"),appId:a.id,value:val,ts:nowISO(),by:ME.username,source:"probe",photo:null});n++;}); save("preview wifi read"); if(ROUTE==="temps"||ROUTE==="pass")rerender(); renderNav(); return n;
}''')

rep('  STATE.appliances.forEach(a=>{\n    const r=latestReading(a.id);', '  STATE.appliances.filter(a=>a.type==="fridge"||a.type==="freezer").forEach(a=>{\n    const r=latestReading(a.id);', 1)

rep('''  const amDone=STATE.tempReadings.some(r=>r.ts.slice(0,10)===today&&+r.ts.slice(11,13)<12);
  const pmDone=STATE.tempReadings.some(r=>r.ts.slice(0,10)===today&&+r.ts.slice(11,13)>=12);
  const breaches=STATE.appliances.filter(a=>{const r=latestReading(a.id);return r&&tempStatus(a,r.value)==="danger";}).length;
  t.push({id:"temp_am",label:"Morning temperature round",route:"temps",icon:"temp",state:amDone?"done":(h>=11?"over":"due"),detail:amDone?"Logged":"All units"});
  t.push({id:"temp_pm",label:"Evening temperature round",route:"temps",icon:"temp",state:pmDone?"done":(h>=18?"over":h>=15?"due":"ok"),detail:pmDone?"Logged":"Before close"});
''','''  const coldUnits=STATE.appliances.filter(a=>a.type==="fridge"||a.type==="freezer");
  const slotCount=period=>coldUnits.filter(a=>STATE.tempReadings.some(r=>r.appId===a.id&&r.ts.slice(0,10)===today&&(period==="am"?+r.ts.slice(11,13)<12:+r.ts.slice(11,13)>=12))).length;
  const amCount=slotCount("am"), pmCount=slotCount("pm");
  const amDone=coldUnits.length>0&&amCount===coldUnits.length, pmDone=coldUnits.length>0&&pmCount===coldUnits.length;
  const breaches=coldUnits.filter(a=>{const r=latestReading(a.id);return r&&tempStatus(a,r.value)==="danger";}).length;
  t.push({id:"temp_am",label:"Morning temperature round",route:"temps",icon:"temp",state:amDone?"done":(h>=11?"over":"due"),detail:amCount+"/"+coldUnits.length+" units"});
  t.push({id:"temp_pm",label:"Evening temperature round",route:"temps",icon:"temp",state:pmDone?"done":(h>=18?"over":h>=15?"due":"ok"),detail:pmCount+"/"+coldUnits.length+" units"});
''')

rep('''  const grid=el("div",{class:"grid g2"});
  const draft={};
  STATE.appliances.forEach(a=>{
    const r=latestReading(a.id);
''','''  const grid=el("div",{class:"grid g2"});
  const draft={};
  const period=new Date().getHours()<12?"am":"pm";
  const today=todayISO();
  const coldUnits=STATE.appliances.filter(a=>a.type==="fridge"||a.type==="freezer");
  coldUnits.forEach(a=>{
    const r=latestReading(a.id);
    const doneNow=STATE.tempReadings.some(x=>x.appId===a.id&&x.ts.slice(0,10)===today&&(period==="am"?+x.ts.slice(11,13)<12:+x.ts.slice(11,13)>=12));
''')

rep('    const statusTag=el("span",{class:"tag dim"},"—");', '    const statusTag=el("span",{class:"tag "+(doneNow?"ok":"dim")},doneNow?"Done "+period.toUpperCase():"Due");')

rep('''    if(probe){ line.append(el("button",{class:"btn ghost icon",title:"Read "+probe.name,html:icon("probe"),onclick:()=>{
      // WiFi probe read (simulated jitter around target for preview; real deploy fetches sensor)
      const val=+((a.type==="freezer"?-19:a.type==="hot"?68:4)+(Math.random()*1.6-0.8)).toFixed(1);
      inp.value=val;inp.dispatchEvent(new Event("input"));toast(probe.name+": "+val+"°C","ok");}})); }
''','''    if(probe){ line.append(el("button",{class:"btn ghost icon",title:"Read "+probe.name,html:icon("probe"),onclick:()=>{
      if(serverMode){toast("Sensor integration not connected yet","warn");return;}
      const val=+((a.type==="freezer"?-19:4)+(Math.random()*1.6-0.8)).toFixed(1);
      inp.value=val;inp.dispatchEvent(new Event("input"));toast("Preview reading: "+val+"°C","ok");}})); }
''')

rep('    STATE.appliances.forEach(a=>{const val=draft[a.id];if(val==null||val==="")return;', '    coldUnits.forEach(a=>{const val=draft[a.id];if(val==null||val==="")return;')
rep('    tempTab="history";rerender();', '    tempTab="round";rerender();')
rep('p.type==="wifi"?"WiFi sensor":"Bluetooth probe"', 'p.type==="wifi"?(serverMode?"WiFi sensor · not connected":"WiFi sensor · preview"):"Bluetooth probe"')
rep('WiFi sensors report on their own; readings flow straight into the round. Bluetooth probes are read on demand from the Log round tab. Set which unit each sensor watches so its reading auto-fills.', 'WiFi sensors can be assigned to a unit here, but live sensor integration is not connected yet. Until it is connected, use manual temperature entries; the app will never invent a live reading.')

p.write_text(s, encoding='utf-8')
