(function(){
  function boot(){
    if(typeof state==='undefined') return setTimeout(boot,150);
    if(window.__prepMenuUploadPatch) return;
    window.__prepMenuUploadPatch=true;

    function isPrepScreen(){
      return [...document.querySelectorAll('h1,h2')].some(h=>/prep lists|build today.?s prep and order/i.test(String(h.textContent||'')));
    }

    function addUploadButton(){
      if(!isPrepScreen()) return;
      const select=document.getElementById('prepMenu');
      if(!select) return;
      const card=select.closest('.card');
      if(!card||card.querySelector('[data-prep-menu-upload]')) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn ghost';
      btn.dataset.prepMenuUpload='1';
      btn.textContent='Upload menu photos';
      btn.onclick=function(e){
        e.preventDefault();
        if(typeof window.importMenuPhotos==='function') window.importMenuPhotos();
        else if(typeof toast==='function') toast('Menu photo upload is not available yet','bad');
      };
      const create=document.getElementById('prepCreate');
      if(create&&create.parentElement) create.parentElement.insertBefore(btn,create);
      else card.appendChild(btn);
    }

    const oldRender=window.render;
    if(typeof oldRender==='function'&&!oldRender.__prepMenuUploadWrapped){
      const wrapped=function(){const r=oldRender.apply(this,arguments);setTimeout(addUploadButton,0);return r;};
      wrapped.__prepMenuUploadWrapped=true;
      window.render=wrapped;
    }

    new MutationObserver(addUploadButton).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(addUploadButton,500);
    addUploadButton();
  }
  boot();
})();