(function(){
  function boot(){
    if(window.__menuImportStatusV1) return;
    window.__menuImportStatusV1=true;

    let beforeMenus=0,beforeRecipes=0,active=false;

    function statusBox(){
      const form=document.getElementById('completeMenuPhotoForm');
      if(!form) return null;
      let box=document.getElementById('menuImportStatus');
      if(!box){
        box=document.createElement('div');
        box.id='menuImportStatus';
        box.className='card';
        box.style.cssText='padding:14px;margin:12px 0;background:#fff7d6;border:2px solid #d4a017';
        box.innerHTML='<b id="menuImportStatusTitle">Ready for menu photos</b><div id="menuImportStatusText" class="muted" style="margin-top:5px">Take or choose every page. The app will confirm each stage.</div>';
        form.insertBefore(box,form.firstChild.nextSibling);
      }
      return box;
    }

    function setStatus(title,text,kind){
      const box=statusBox(); if(!box) return;
      const h=document.getElementById('menuImportStatusTitle');
      const p=document.getElementById('menuImportStatusText');
      if(h) h.textContent=title;
      if(p) p.textContent=text||'';
      box.style.background=kind==='bad'?'#ffe5e5':kind==='done'?'#e7f7e7':'#fff7d6';
      box.style.borderColor=kind==='bad'?'#b42318':kind==='done'?'#238636':'#d4a017';
      box.scrollIntoView({block:'nearest',behavior:'smooth'});
    }

    document.addEventListener('change',function(e){
      if(!e.target||!['completeMenuCamera','completeMenuGallery'].includes(e.target.id)) return;
      setTimeout(function(){
        const count=document.getElementById('completePhotoCount');
        setStatus('Menu photos accepted',count?count.textContent:'Photos added','done');
      },50);
    },true);

    document.addEventListener('submit',function(e){
      if(!e.target||e.target.id!=='completeMenuPhotoForm') return;
      active=true;
      beforeMenus=Array.isArray(window.state&&state.menus)?state.menus.length:0;
      beforeRecipes=Array.isArray(window.state&&state.recipes)?state.recipes.length:0;
      const count=document.getElementById('completePhotoCount');
      setStatus('Uploading menu pages',((count&&count.textContent)||'Photos accepted')+'. Please keep this screen open.','working');
      setTimeout(function(){if(active)setStatus('Reading the menu','The AI is checking every uploaded page and building the dish list. This can take a little while.','working');},1200);
    },true);

    document.addEventListener('click',function(e){
      const btn=e.target&&e.target.closest&&e.target.closest('#completeSaveMenu');
      if(!btn) return;
      beforeMenus=Array.isArray(window.state&&state.menus)?state.menus.length:0;
      beforeRecipes=Array.isArray(window.state&&state.recipes)?state.recipes.length:0;
      setStatus('Saving accepted menu','Creating the saved menu and editable draft recipes…','working');
      setTimeout(checkSaved,300);
    },true);

    function checkSaved(){
      const menus=Array.isArray(window.state&&state.menus)?state.menus.length:0;
      const recipes=Array.isArray(window.state&&state.recipes)?state.recipes.length:0;
      if(menus>beforeMenus){
        active=false;
        const added=Math.max(0,recipes-beforeRecipes);
        if(typeof toast==='function') toast('Menu accepted and saved. '+added+' draft recipes created.','ok');
        return;
      }
      if(document.getElementById('completeSaveMenu')) setTimeout(checkSaved,350);
    }

    const observer=new MutationObserver(function(){
      statusBox();
      const review=document.getElementById('completeMenuReview');
      if(review&&review.textContent&&/review detected menu/i.test(review.textContent)){
        active=false;
        const m=review.textContent.match(/(\d+)\s+dishes/i);
        setStatus('Menu accepted for review',(m?m[1]+' dishes found. ':'')+'Check the list, then press Save menu and draft recipes.','done');
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});

    const originalFetch=window.fetch;
    if(originalFetch&&!originalFetch.__menuStatusWrapped){
      const wrapped=async function(){
        try{
          const response=await originalFetch.apply(this,arguments);
          const url=String(arguments[0]||'');
          if(active&&url.includes('/api/openai/responses')&&!response.ok){
            active=false;setStatus('Menu scan failed','The menu was not accepted. Please try again or use clearer photos.','bad');
          }
          return response;
        }catch(err){
          if(active){active=false;setStatus('Menu scan failed','Connection failed before the menu could be accepted. Please try again.','bad');}
          throw err;
        }
      };
      wrapped.__menuStatusWrapped=true;
      window.fetch=wrapped;
    }
  }
  boot();
})();