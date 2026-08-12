// Command de Cuisine: controlled manager rollback for mistaken paper temperature imports.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof api!=='function')return setTimeout(install,150);
    if(window.__paperImportUndoInstalled)return;
    window.__paperImportUndoInstalled=true;

    function batches(){
      const map=new Map();
      for(const r of (STATE.tempReadings||[])){
        if(!r||r.source!=='paper-log-import')continue;
        const key=String(r.paperImportBatchId||r.enteredAt||'legacy-paper-import').trim();
        if(!map.has(key))map.set(key,{key,rows:[],files:new Set(),dates:[]});
        const b=map.get(key);b.rows.push(r);
        if(r.paperSourceFile)b.files.add(String(r.paperSourceFile));
        if(r.ts)b.dates.push(String(r.ts).slice(0,10));
      }
      return [...map.values()].map(b=>{
        b.dates.sort();
        return {key:b.key,count:b.rows.length,files:[...b.files],from:b.dates[0]||'',to:b.dates[b.dates.length-1]||''};
      }).sort((a,b)=>String(b.key).localeCompare(String(a.key)));
    }

    async function undoBatch(batch,button,close){
      button.disabled=true;
      try{
        const res=await api('/api/temperature-paper-import/undo',{method:'POST',body:JSON.stringify({batch:batch.key})});
        toast((res&&res.message)||'Paper import deleted','ok');
        if(close)close();
        setTimeout(()=>location.reload(),300);
      }catch(e){
        button.disabled=false;
        toast((e&&e.message)||String(e),'bad');
      }
    }

    function confirmUndo(batch){
      const body=el('div',{});
      body.append(
        el('div',{class:'notice bad'},'This deletes only this paper-photo import. Live readings, manager back-fills and other history are not touched.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},batch.count+' imported readings · '+(batch.from||'unknown')+(batch.to&&batch.to!==batch.from?' to '+batch.to:'')),
          el('div',{class:'dk-s'},batch.files.length?batch.files.join(', '):'Paper photo import')
        ))
      );
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const del=el('button',{class:'btn danger',html:'Delete this bad import'});
      del.onclick=()=>undoBatch(batch,del,()=>m.close());
      m=modal({title:'Delete bad paper import',body,footer:[cancel,del]});
    }

    function openManager(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      const bs=batches();
      const body=el('div',{});
      if(!bs.length){
        body.append(el('div',{class:'empty'},el('h4',{},'No paper imports found'),el('div',{},'There are no paper temperature imports to delete.')));
        modal({title:'Delete bad paper import',body});
        return;
      }
      body.append(el('p',{class:'muted',style:'margin-top:0'},'Choose the mistaken import. Check its date range and photo names before deleting it.'));
      let m;
      for(const b of bs){
        const row=el('div',{class:'docket',style:'display:flex;gap:10px;align-items:center;margin-bottom:7px'});
        const info=el('div',{style:'min-width:0;flex:1'});
        info.append(
          el('div',{class:'dk-t'},b.count+' readings · '+(b.from||'unknown')+(b.to&&b.to!==b.from?' to '+b.to:'')),
          el('div',{class:'dk-s'},b.files.length?b.files.join(', '):'Paper import')
        );
        row.append(info,el('button',{class:'btn danger sm',html:'Delete',onclick:()=>{m.close();confirmUndo(b);}}));
        body.append(row);
      }
      m=modal({title:'Delete bad paper import',body,footer:[el('button',{class:'btn ghost',html:'Close',onclick:()=>m.close()})]});
    }
    window.openPaperImportDelete=openManager;

    function topCard(){
      const c=el('div',{class:'card',style:'margin-bottom:16px;border-color:rgba(255,90,90,.35)'});
      const head=el('div',{class:'card-head'},el('h3',{},'Paper import controls'),el('div',{class:'spacer'}));
      if(typeof isMgr!=='function'||isMgr())head.append(el('button',{class:'btn danger',html:'Delete bad paper import',onclick:openManager}));
      c.append(head,el('p',{class:'muted'},'Remove a mistaken paper-sheet import as one batch, without touching live readings or manager back-fills.'));
      return c;
    }

    const oldRecords=VIEWS.temprecords;
    if(typeof oldRecords==='function')VIEWS.temprecords=function(v){v.append(topCard());oldRecords(v);};
    const oldHistory=VIEWS.history;
    if(typeof oldHistory==='function')VIEWS.history=function(v){oldHistory(v);if(typeof isMgr!=='function'||isMgr())v.append(topCard());};
  }
  install();
})();
