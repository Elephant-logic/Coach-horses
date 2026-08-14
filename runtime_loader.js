(function(){
  'use strict';
  if(window.__coachRuntimeLoaderStarted) return;
  window.__coachRuntimeLoaderStarted=true;

  const modules=[
    'delivery_patch.js',
    'ai_server_patch.js',
    'compliance_patch.js',
    'login_cleanup_patch.js',
    'recipe_management_patch.js',
    'clockin_session_patch.js',
    'ai_recipe_save_patch.js',
    'ai_ideas_variety_patch.js',
    'recipe_category_patch.js',
    'menu_photo_complete_import_patch.js',
    'kitchen_workflow_stable.js',
    'prep_v2.js',
    'global_kitchen_assistant_tabs.js',
    'settings_pro_patch.js',
    'tab_specific_forms.js',
    'tab_spreadsheet_upgrade.js',
    'analytics_tabs_upgrade.js',
    'kitchen_dashboard.js'
  ];

  function load(name){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/'+name+'?runtime=20260814-savefix1';
      script.async=false;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('Could not load '+name));
      document.body.appendChild(script);
    });
  }

  function openManagementDashboard(){
    try{
      route='management';
      if(typeof renderNav==='function') renderNav();
      if(typeof render==='function') render();
    }catch(error){
      console.warn('Management dashboard navigation failed',error);
    }
  }

  function installFinalTemperaturePersistence(){
    if(typeof STATE==='undefined'||typeof api!=='function'||typeof persist!=='function'||typeof updateSync!=='function'||typeof serverMode==='undefined'||typeof ME==='undefined'){
      return setTimeout(installFinalTemperaturePersistence,150);
    }
    if(serverMode&&!ME) return setTimeout(installFinalTemperaturePersistence,150);
    if(window.__finalTemperaturePersistenceInstalled) return;
    window.__finalTemperaturePersistenceInstalled=true;

    let fallbackPersist=persist;
    const canon=value=>JSON.stringify(value);
    const clone=value=>JSON.parse(JSON.stringify(value));
    const byId=rows=>new Map((Array.isArray(rows)?rows:[]).filter(r=>r&&r.id!=null).map(r=>[String(r.id),r]));
    let baseline=clone(STATE);
    let ready=false;

    function additions(current,previous){
      const old=byId(previous);
      return (Array.isArray(current)?current:[]).filter(r=>r&&r.id!=null&&!old.has(String(r.id)));
    }

    function existingChanged(current,previous){
      const now=byId(current);
      for(const row of (Array.isArray(previous)?previous:[])){
        if(!row||row.id==null) continue;
        const kept=now.get(String(row.id));
        if(!kept||canon(kept)!==canon(row)) return true;
      }
      return false;
    }

    function nonTemperatureChanged(){
      const ignore=new Set(['tempReadings','audit']);
      const keys=new Set([...Object.keys(baseline||{}),...Object.keys(STATE||{})]);
      for(const key of keys){
        if(ignore.has(key)) continue;
        if(canon((baseline||{})[key])!==canon(STATE[key])) return true;
      }
      return false;
    }

    async function postRows(rows){
      const requested=(Array.isArray(rows)?rows:[]).filter(r=>r&&r.id!=null);
      for(let i=0;i<requested.length;i+=64){
        const chunk=requested.slice(i,i+64);
        const res=await api('/api/temperature-readings',{method:'POST',body:JSON.stringify({readings:chunk})});
        if(!res||res.ok!==true) throw new Error('Temperature save was not confirmed by the server.');
      }
    }

    function queuedState(){
      try{
        if(typeof LS_QUEUE==='undefined') return null;
        const raw=localStorage.getItem(LS_QUEUE);
        if(!raw) return null;
        const parsed=JSON.parse(raw);
        return parsed&&parsed.state&&typeof parsed.state==='object'?parsed.state:null;
      }catch(_e){return null;}
    }

    async function hydrateRecoverAndInstall(){
      try{
        let res=await api('/api/temperature-readings');
        if(!res||!Array.isArray(res.readings)) throw new Error('Temperature history endpoint returned no readings.');
        let serverRows=res.readings;
        const have=new Set(serverRows.filter(r=>r&&r.id!=null).map(r=>String(r.id)));
        const candidates=[];
        const seen=new Set();
        const collect=rows=>{
          for(const row of (Array.isArray(rows)?rows:[])){
            if(!row||row.id==null) continue;
            const id=String(row.id);
            if(have.has(id)||seen.has(id)) continue;
            seen.add(id);candidates.push(row);
          }
        };
        const queued=queuedState();
        if(queued) collect(queued.tempReadings);
        collect(STATE.tempReadings);
        if(candidates.length){
          await postRows(candidates);
          res=await api('/api/temperature-readings');
          serverRows=Array.isArray(res.readings)?res.readings:serverRows;
          if(typeof toast==='function') toast('Recovered '+candidates.length+' temperature reading'+(candidates.length===1?'':'s'),'ok');
        }
        STATE.tempReadings=serverRows;
        baseline=clone(STATE);
        ready=true;
        ONLINE=true;
        if(typeof LS_QUEUE!=='undefined'&&queued) localStorage.removeItem(LS_QUEUE);
        updateSync();
        if(typeof rerender==='function') rerender();
      }catch(err){
        ready=false;
        console.error('Temperature persistence startup failed',err);
        if(typeof toast==='function') toast('Temperature database connection failed: '+((err&&err.message)||'unknown error'),'bad');
      }
    }

    const finalPersist=async function(reason){
      if(!serverMode||!ME||!ready) return fallbackPersist(reason);
      const tempAdds=additions(STATE.tempReadings,baseline.tempReadings);
      if(!tempAdds.length||nonTemperatureChanged()||existingChanged(STATE.tempReadings,baseline.tempReadings)){
        return fallbackPersist(reason);
      }
      try{
        await postRows(tempAdds);
        const check=await api('/api/temperature-readings');
        const savedIds=new Set((check.readings||[]).filter(r=>r&&r.id!=null).map(r=>String(r.id)));
        const missing=tempAdds.filter(r=>!savedIds.has(String(r.id)));
        if(missing.length) throw new Error(missing.length+' temperature reading'+(missing.length===1?' was':'s were')+' not confirmed in Supabase.');
        STATE.tempReadings=check.readings;
        baseline=clone(STATE);
        DIRTY=false;ONLINE=true;
        if(typeof LS_QUEUE!=='undefined') localStorage.removeItem(LS_QUEUE);
        updateSync();
        if(typeof rerender==='function') rerender();
      }catch(err){
        ONLINE=false;
        try{
          if(typeof LS_QUEUE!=='undefined') localStorage.setItem(LS_QUEUE,JSON.stringify({state:STATE,ts:Date.now()}));
        }catch(_e){}
        updateSync();
        if(typeof toast==='function') toast('Temperature not saved: '+((err&&err.message)||'server error'),'bad');
        throw err;
      }
    };

    persist=finalPersist;
    window.__finalTemperaturePersist=finalPersist;
    hydrateRecoverAndInstall();
  }

  async function start(){
    try{
      let originalDashboard=null;
      let originalHome=null;
      let originalOverview=null;
      for(const name of modules){
        if(name==='kitchen_dashboard.js' && typeof VIEWS!=='undefined'){
          originalDashboard=typeof VIEWS.dashboard==='function'?VIEWS.dashboard:null;
          originalHome=typeof VIEWS.home==='function'?VIEWS.home:null;
          originalOverview=typeof VIEWS.overview==='function'?VIEWS.overview:null;
        }
        await load(name);
        if(name==='kitchen_dashboard.js' && typeof VIEWS!=='undefined'){
          const managementDashboard=typeof VIEWS.dashboard==='function'?VIEWS.dashboard:null;
          if(managementDashboard) VIEWS.management=managementDashboard;
          if(originalDashboard) VIEWS.dashboard=originalDashboard;
          if(originalHome) VIEWS.home=originalHome;
          if(originalOverview) VIEWS.overview=originalOverview;
          window.openKitchenDashboard=openManagementDashboard;
          const retargetDashboardButton=()=>{
            const button=document.querySelector('[data-kd-dashboard]');
            if(!button) return;
            button.textContent='Management';
            button.onclick=openManagementDashboard;
          };
          setTimeout(retargetDashboardButton,350);
          setTimeout(retargetDashboardButton,1300);
        }
      }
      installFinalTemperaturePersistence();
      window.__coachRuntimeReady=true;
      window.dispatchEvent(new CustomEvent('coach-runtime-ready'));
    }catch(error){
      console.error('Coach runtime failed to start',error);
      const loginVisible=document.getElementById('loginForm');
      if(!loginVisible&&typeof toast==='function') toast('The kitchen app could not finish loading. Refresh once.','bad');
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();