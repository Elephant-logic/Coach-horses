(function(){
  function boot(){
    if(window.__prepCreateButtonFix) return;
    window.__prepCreateButtonFix=true;

    function fix(){
      var button=document.getElementById('prepCreate');
      if(!button) return;
      if(button.dataset.prepCreateFixed==='1') return;
      button.dataset.prepCreateFixed='1';
      button.textContent='Build production and order';
    }

    new MutationObserver(fix).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(fix,400);
    fix();
  }
  boot();
})();
