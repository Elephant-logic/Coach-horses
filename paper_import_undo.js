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
        const key=String(r.paperImportBatchId||r.enteredAt||'').trim();
        if(!key)continue;
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
        const res=await api('/api/temperature-paper-import/undo',{
          method:'POST',
          body:JSON.stringify({batch:batch.key})
        });
        toast((res&&res.message)||'Paper import removed','ok');
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
        el('div',{class:'notice bad'},'This removes only the selected paper-import batch. Live readings and manager back-fills are not touched.'),
        el('div',{class:'docket',style:'margin-top:10px'},
          el('div',{},
            el('div',{class:'dk-t'},batch.count+' imported readings · '+(batch.from||'unknown')+(batch.to&&batch.to!==batch.from?' to '+batch.to:'')),
            el('div',{class:'dk-s'},batch.files.length?batch.files.join(', '):'Paper photo import')
          )
        )
      );
      let m;
      const cancel=el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()});
      const undo=el('button',{class:'btn danger',html:'Undo this paper import'});
      undo.onclick=()=>undoBatch(batch,undo,()=>m.close());
      m=modal({title:'Undo paper temperature import',body,footer:[cancel,undo]});
    }

    function card(){
      const bs=batches();
      const c=el('div',{class:'card',style:'margin-top:16px'});
      c.append(el('div',{class:'card-head'},el('h3',{},'Paper import batches')));
      if(typeof isMgr==='function'&&!isMgr()){
        c.append(el('p',{class:'muted'},'Managers can review and undo mistaken paper imports.'));
        return c;
      }
      if(!bs.length){
        c.append(el('div',{class:'empty'},el('h4',{},'No paper import batches'),el('div',{},'There are no paper temperature imports to undo.')));
        return c;
      }
      c.append(el('p',{class:'muted',style:'font-size:12.5px'},'Use this only to remove a mistaken paper-sheet import before re-importing the correct sheets.'));
      for(const b of bs){
        const row=el('div',{class:'docket',style:'display:flex;gap:10px;align-items:center;margin-bottom:6px'});
        const info=el('div',{style:'min-width:0;flex:1'});
        info.append(
          el('div',{class:'dk-t'},b.count+' readings · '+(b.from||'unknown')+(b.to&&b.to!==b.from?' to '+b.to:'')),
          el('div',{class:'dk-s'},b.files.length?b.files.join(', '):'Paper import batch')
        );
        row.append(info,el('button',{class:'btn danger sm',html:'Undo import',onclick:()=>confirmUndo(b)}));
        c.append(row);
      }
      return c;
    }

    const oldRecords=VIEWS.temprecords;
    if(typeof oldRecords==='function')VIEWS.temprecords=function(v){oldRecords(v);v.append(card());};
  }
  install();
})();
