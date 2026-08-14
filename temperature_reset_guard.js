// Command de Cuisine: simplified temperature register workflow.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof api!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__temperatureRegisterSimpleInstalled)return;
    window.__temperatureRegisterSimpleInstalled=true;

    if(typeof SUBTITLES==='object')SUBTITLES.temprecords='Temperature register & normal history';

    const cols={
      'Fridge 1 AM':['Fridge 1','AM'],'Fridge 1 PM':['Fridge 1','PM'],
      'Fridge 2 AM':['Fridge 2','AM'],'Fridge 2 PM':['Fridge 2','PM'],
      'Fridge 3 AM':['Fridge 3','AM'],'Fridge 3 PM':['Fridge 3','PM'],
      'Freezer 1 AM':['Freezer 1','AM'],'Freezer 1 PM':['Freezer 1','PM'],
      'Freezer 2 AM':['Freezer 2','AM'],'Freezer 2 PM':['Freezer 2','PM'],
      'Freezer 3 AM':['Freezer 3','AM'],'Freezer 3 PM':['Freezer 3','PM'],
      'Cold Room AM':['Cold Room','AM'],'Cold Room PM':['Cold Room','PM']
    };

    function parseCSV(text){
      const rows=[];let row=[],field='',quoted=false;
      for(let i=0;i<text.length;i++){
        const ch=text[i];
        if(quoted){
          if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
          else if(ch==='"')quoted=false;
          else field+=ch;
        }else if(ch==='"')quoted=true;
        else if(ch===','){row.push(field);field='';}
        else if(ch==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
        else field+=ch;
      }
      if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
      if(!rows.length)return [];
      const headers=rows.shift().map(x=>String(x||'').trim());
      return rows.filter(r=>r.some(x=>String(x||'').trim()!=='')).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()])));
    }

    function buildDocument(records,fileName){
      const readings=[];
      for(const rec of records){
        const date=String(rec.Date||'').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
        for(const [col,[unit,period]] of Object.entries(cols)){
          const raw=String(rec[col]??'').trim();
          if(raw==='')continue;
          const value=Number(raw);
          if(!Number.isFinite(value))continue;
          readings.push({date,unit,period,value,signed:String(rec['Recorded by']||'').trim(),sourceSheet:fileName});
        }
      }
      return {
        format:'command-de-cuisine-temperature-backfill',version:1,
        title:'Uploaded temperature register',source:'uploaded-temperature-register',
        readings,gaps:[]
      };
    }

    async function review(file){
      const text=await file.text();
      const doc=buildDocument(parseCSV(text),file.name);
      if(!doc.readings.length)throw new Error('No temperature readings were found in this CSV.');
      const dates=doc.readings.map(x=>x.date).sort();
      const body=el('div',{});
      body.append(
        el('div',{class:'notice'},'This puts the CSV temperatures into the same normal History list used by live temperature checks. Existing date + unit + AM/PM readings are kept and are not overwritten.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},doc.readings.length+' temperature readings'),
          el('div',{class:'dk-s'},dates[0]+' to '+dates[dates.length-1]+' · '+file.name)
        ))
      );
      let m;
      const go=el('button',{class:'btn primary',html:'Put into normal History'});
      go.onclick=async()=>{
        go.disabled=true;
        try{
          const res=await api('/api/temperature-paper-import/undo',{method:'POST',body:JSON.stringify({action:'import-backfill-file',document:doc})});
          toast((res&&res.message)||'Temperature register imported','ok');
          m.close();setTimeout(()=>location.reload(),350);
        }catch(e){go.disabled=false;toast((e&&e.message)||String(e),'bad');}
      };
      m=modal({title:'Import temperature register',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),go]});
    }

    function choose(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const input=document.createElement('input');
      input.type='file';input.accept='.csv,text/csv';
      input.onchange=async()=>{const f=input.files&&input.files[0];if(!f)return;try{await review(f);}catch(e){toast((e&&e.message)||String(e),'bad');}};
      input.click();
    }

    VIEWS.temprecords=function(v){
      const card=el('div',{class:'card'});
      const head=el('div',{class:'card-head'},el('h3',{},'Temperature records'),el('div',{class:'spacer'}));
      card.append(head,el('p',{class:'muted'},'One register, one History. Upload the temperature-register CSV here, then carry on with normal live temperature checks.'));
      const actions=el('div',{style:'display:flex;gap:10px;flex-wrap:wrap'});
      if(typeof isMgr!=='function'||isMgr())actions.append(el('button',{class:'btn primary',html:'Import temperature register',onclick:choose}));
      actions.append(
        el('button',{class:'btn ghost',html:'Open normal History',onclick:()=>navigate('history')}),
        el('button',{class:'btn ghost',html:'Open live temperatures',onclick:()=>navigate('temps')})
      );
      card.append(actions);
      const registerRows=(STATE.tempReadings||[]).filter(r=>r&&r.source==='backfill-file-import'&&r.backfillFileSource==='uploaded-temperature-register');
      if(registerRows.length){
        const dates=registerRows.map(r=>String(r.ts||'').slice(0,10)).filter(Boolean).sort();
        card.append(el('div',{class:'notice ok',style:'margin-top:14px'},registerRows.length+' uploaded register readings are in normal History'+(dates.length?' · '+dates[0]+' to '+dates[dates.length-1]:'')));
      }
      v.append(card);
    };
  }
  install();
})();

// Do not trim the client audit list during a save cycle. The original save route protects
// existing history, so keeping the rows intact prevents a legitimate kitchen save from
// looking like an old audit entry was deleted.
(function(){
  'use strict';
  function installAuditSaveFix(){
    if(typeof STATE==='undefined'||typeof uid!=='function'||typeof nowISO!=='function')return setTimeout(installAuditSaveFix,150);
    if(window.__boundedAuditSaveFixInstalled)return;
    window.__boundedAuditSaveFixInstalled=true;
    audit=function(action,detail){
      STATE.audit=Array.isArray(STATE.audit)?STATE.audit:[];
      STATE.audit.unshift({id:uid('a'),ts:nowISO(),user:(typeof ME!=='undefined'&&ME?ME.username:'local'),action,detail:detail||''});
    };
  }
  installAuditSaveFix();
})();
