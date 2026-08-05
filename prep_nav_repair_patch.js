(function(){
  function boot(){
    if(typeof VIEWS==='undefined') return setTimeout(boot,150);
    if(window.__prepNavRepairPatch) return;
    window.__prepNavRepairPatch=true;

    function findPrepView(){
      var keys=Object.keys(VIEWS||{});
      return keys.find(function(k){return /^prep$/i.test(k);})||
             keys.find(function(k){return /prep.?lists?/i.test(k);})||
             keys.find(function(k){return /prep|production/i.test(k);})||'';
    }

    function openPrep(e){
      var key=findPrepView();
      if(!key){
        if(typeof toast==='function') toast('Prep Lists view is missing','bad');
        return;
      }
      if(e){e.preventDefault();e.stopImmediatePropagation();}
      try{ route=key; }catch(_){ window.route=key; }
      try{
        if(typeof render==='function') render();
        else if(typeof VIEWS[key]==='function') VIEWS[key]();
      }catch(err){
        try{ if(typeof VIEWS[key]==='function') VIEWS[key](); }
        catch(err2){ if(typeof toast==='function') toast('Could not open Prep Lists: '+(err2.message||err.message),'bad'); }
      }
    }

    document.addEventListener('click',function(e){
      var el=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');
      if(!el) return;
      var text=String(el.textContent||'').trim();
      var data=String((el.dataset&&(el.dataset.route||el.dataset.view||el.dataset.tab))||'');
      if(/^prep lists?$/i.test(text)||/prep.?lists?/i.test(data)) openPrep(e);
    },true);

    window.openPrepLists=openPrep;
  }
  boot();
})();
