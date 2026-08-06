(function(){
  function boot(){
    if(typeof state==='undefined') return setTimeout(boot,150);
    if(window.__uiFlowCleanupV1) return;
    window.__uiFlowCleanupV1=true;

    function isMenusPage(){
      const title=[...document.querySelectorAll('h1')].find(h=>/menus\s*&\s*recipes/i.test(h.textContent||''));
      return !!title;
    }

    function cleanUploadButtons(){
      const buttons=[...document.querySelectorAll('[data-complete-menu-upload]')];
      if(!isMenusPage()){
        buttons.forEach(b=>b.remove());
        return;
      }
      let kept=false;
      buttons.forEach(b=>{
        const card=b.closest('.card');
        const text=(card&&card.textContent||'').toLowerCase();
        const allowed=/menu tools/.test(text);
        if(allowed&&!kept){kept=true;b.textContent='Upload complete menu photos';}
        else b.remove();
      });
    }

    function cleanLegacyUploadButtons(){
      [...document.querySelectorAll('button')].forEach(btn=>{
        const text=String(btn.textContent||'').trim().toLowerCase();
        if(!/upload.*menu.*photo|import.*menu.*photo/.test(text)) return;
        if(isMenusPage() && (btn.closest('.card')?.textContent||'').toLowerCase().includes('menu tools')) return;
        if(btn.dataset.completeMenuUpload==='1') btn.remove();
      });
    }

    function clean(){cleanUploadButtons();cleanLegacyUploadButtons();}
    new MutationObserver(clean).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(clean,800);
    clean();
  }
  boot();
})();
