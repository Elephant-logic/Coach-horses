// Command de Cuisine: safe, reversible historic temperature recovery reset.
(function(){
  'use strict';
  function install(){
    if(typeof VIEWS==='undefined'||typeof el!=='function'||typeof api!=='function'||typeof modal!=='function')return setTimeout(install,150);
    if(window.__temperatureRecoveryResetInstalled)return;
    window.__temperatureRecoveryResetInstalled=true;

    const endpoint='/api/temperature-recovery/reset';
    async function call(action,extra){
      return api(endpoint,{method:'POST',body:JSON.stringify({action,...(extra||{})})});
    }
    function sourceText(summary){
      const map=summary&&summary.bySource||{};
      const labels={'paper-log-import':'paper imports','backfill-file-import':'prepared recovery','manager-backfill':'manager historic entries'};
      return Object.entries(map).map(([k,v])=>(labels[k]||k)+': '+v).join(' · ')||'No recovery readings';
    }
    async function openReset(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      let preview;
      try{preview=await call('preview');}catch(e){return toast((e&&e.message)||String(e),'bad');}
      const s=preview.summary||{};
      const body=el('div',{});
      body.append(
        el('div',{class:'notice warn'},'This resets historic recovery data only. Normal live temperature readings are kept.'),
        el('div',{class:'docket',style:'margin-top:10px'},el('div',{},
          el('div',{class:'dk-t'},String(s.readings||0)+' recovery readings · '+String(s.gaps||0)+' documented gaps'),
          el('div',{class:'dk-s'},(s.from&&s.to? s.from+' to '+s.to+' · ':'')+sourceText(s))
        )),
        el('p',{class:'muted'},'The removed recovery data is archived first, so the last reset can be restored if needed.'),
        el('label',{style:'display:block;margin-top:12px'},
          el('div',{class:'eyebrow',style:'margin-bottom:6px'},'Type RESET HISTORIC to confirm'),
          el('input',{class:'inp',type:'text',id:'tempRecoveryResetConfirm',placeholder:'RESET HISTORIC',autocomplete:'off'})
        )
      );
      let m;
      const reset=el('button',{class:'btn danger',html:'Reset historic recovery'});
      reset.onclick=async()=>{
        const value=(body.querySelector('#tempRecoveryResetConfirm')||{}).value||'';
        if(value!=='RESET HISTORIC')return toast('Type RESET HISTORIC exactly','warn');
        reset.disabled=true;
        try{
          const res=await call('reset',{confirm:value});
          toast(res.message||'Historic recovery reset','ok');
          m.close();setTimeout(()=>location.reload(),300);
        }catch(e){reset.disabled=false;toast((e&&e.message)||String(e),'bad');}
      };
      const footer=[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),reset];
      m=modal({title:'Start temperature history afresh',body,footer});
    }
    async function restoreLast(){
      if(typeof isMgr==='function'&&!isMgr())return toast('Manager access required','warn');
      try{
        const preview=await call('preview');
        if(!preview.canRestoreLast)return toast('There is no reset to restore','warn');
      }catch(e){return toast((e&&e.message)||String(e),'bad');}
      let m;
      const body=el('div',{},el('div',{class:'notice warn'},'Restore the most recent historic-temperature reset archive? Existing live readings remain untouched.'));
      const restore=el('button',{class:'btn primary',html:'Restore last reset'});
      restore.onclick=async()=>{restore.disabled=true;try{const res=await call('restore-last');toast(res.message||'Reset restored','ok');m.close();setTimeout(()=>location.reload(),300);}catch(e){restore.disabled=false;toast((e&&e.message)||String(e),'bad');}};
      m=modal({title:'Restore last temperature reset',body,footer:[el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),restore]});
    }
    window.openTemperatureRecoveryReset=openReset;
    window.restoreLastTemperatureRecoveryReset=restoreLast;

    function card(){
      const c=el('div',{class:'card',style:'margin-bottom:16px;border-color:rgba(255,170,70,.35)'});
      const head=el('div',{class:'card-head'},el('h3',{},'Start historic temperatures afresh'),el('div',{class:'spacer'}));
      if(typeof isMgr!=='function'||isMgr()){
        head.append(el('button',{class:'btn danger',html:'Reset historic recovery',onclick:openReset}));
      }
      c.append(head,el('p',{class:'muted'},'Clears paper imports, prepared recovery imports and manager historic backfills, but keeps genuine live temperature readings. The reset is archived and reversible.'));
      if(typeof isMgr!=='function'||isMgr())c.append(el('button',{class:'btn ghost sm',html:'Restore last reset',onclick:restoreLast}));
      return c;
    }
    const old=VIEWS.temprecords;
    if(typeof old==='function')VIEWS.temprecords=function(v){v.append(card());old(v);};
  }
  install();
})();
