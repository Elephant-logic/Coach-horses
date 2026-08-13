// Command de Cuisine: authoritative historic recovery reset UI.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function'||typeof api!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__temperatureResetGuardInstalled)return;
    window.__temperatureResetGuardInstalled=true;

    const endpoint='/api/temperature-recovery/reset';
    const cleared=()=>!!(STATE.settings&&STATE.settings.historicTemperatureRecoveryClearedAt);

    async function call(action,extra){
      return api(endpoint,{method:'POST',body:JSON.stringify(Object.assign({action},extra||{}))});
    }

    async function openReset(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      let p;
      try{p=await call('preview');}catch(e){return toast((e&&e.message)||String(e),'bad');}
      const body=el('div',{});
      body.append(
        el('div',{class:'notice warn'},'This archives and clears historic recovery/import data only. Normal live temperature readings are kept.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},String(p.readings||0)+' recovery readings · '+String(p.gaps||0)+' documented gaps'),
          el('div',{class:'dk-s'},p.from&&p.to?p.from+' to '+p.to:'No recovery date range')
        )),
        el('label',{style:'display:block;margin-top:12px'},
          el('div',{class:'eyebrow',style:'margin-bottom:6px'},'Type RESET HISTORIC to confirm'),
          el('input',{class:'inp',id:'historicResetServerConfirm',placeholder:'RESET HISTORIC',autocomplete:'off'})
        )
      );
      let m;
      const reset=el('button',{class:'btn danger',html:'Clear historic recovery'});
      reset.onclick=async()=>{
        const confirm=(body.querySelector('#historicResetServerConfirm')||{}).value||'';
        if(confirm!=='RESET HISTORIC')return toast('Type RESET HISTORIC exactly','warn');
        reset.disabled=true;
        try{
          const r=await call('reset',{confirm});
          toast(r.message||'Historic recovery cleared','ok');
          m.close();setTimeout(()=>location.reload(),300);
        }catch(e){reset.disabled=false;toast((e&&e.message)||String(e),'bad');}
      };
      m=modal({title:'Start historic temperatures afresh',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),reset]});
    }

    async function restoreLast(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      try{const r=await call('restore-last');toast(r.message||'Historic recovery restored','ok');setTimeout(()=>location.reload(),300);}catch(e){toast((e&&e.message)||String(e),'bad');}
    }

    window.openHistoricTemperatureResetServer=openReset;

    function removeHistoricNoise(root){
      if(!cleared())return;
      root.querySelectorAll('.card').forEach(card=>{
        const h=(card.querySelector('h3')&&card.querySelector('h3').textContent||'').trim().toLowerCase();
        if(h==='temperature gaps'||h==='paper gaps / unreadable entries'||h==='paper gaps / unreadable entries')card.remove();
      });
      root.querySelectorAll('h3').forEach(h=>{
        const t=(h.textContent||'').trim().toLowerCase();
        if(t==='paper gaps / unreadable entries'){
          const card=h.closest('.card');if(card)card.remove();
        }
      });
    }

    const old=VIEWS.temprecords;
    if(typeof old==='function')VIEWS.temprecords=function(v){
      const top=el('div',{class:'card',style:'margin-bottom:16px;border-color:rgba(255,170,70,.35)'});
      const head=el('div',{class:'card-head'},el('h3',{},cleared()?'Historic recovery cleared':'Historic recovery controls'),el('div',{class:'spacer'}));
      if(typeof isMgr!=='function'||isMgr())head.append(el('button',{class:'btn danger',html:'Start afresh',onclick:openReset}));
      top.append(head,el('p',{class:'muted'},cleared()?'The historic recovery layer is clean. Live readings were kept. No old gap list will be calculated until you deliberately restore/import historic records.':'Use this to archive and clear the historic recovery layer without touching live readings.'));
      if(cleared()&&(typeof isMgr!=='function'||isMgr()))top.append(el('button',{class:'btn ghost sm',html:'Restore last reset',onclick:restoreLast}));
      v.append(top);
      old(v);
      removeHistoricNoise(v);
    };
  }
  install();
})();
