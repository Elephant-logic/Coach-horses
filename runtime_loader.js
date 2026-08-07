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
    'settings_pro_patch.js'
  ];

  function load(name){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/'+name+'?runtime=20260807b';
      script.async=false;
      script.onload=resolve;
      script.onerror=()=>reject(new Error('Could not load '+name));
      document.body.appendChild(script);
    });
  }

  async function start(){
    try{
      for(const name of modules) await load(name);
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
