(function(){
  function cleanLogin(){
    const bodyText=(document.body&&document.body.innerText)||'';
    if(!bodyText.includes('Kitchen Pro')||!bodyText.includes('Username')||!bodyText.includes('Password')) return;

    document.querySelectorAll('button,a').forEach(el=>{
      const t=(el.textContent||'').trim().toLowerCase();
      if(t.includes('repair all local accounts')||t.includes('repair / reset local login')){
        el.remove();
      }
    });

    document.querySelectorAll('p,div,small').forEach(el=>{
      const t=(el.textContent||'').replace(/\s+/g,' ').trim();
      if((t.includes('Accounts:')&&(t.includes('ChangeMe123!')||t.includes('Kitchen123!'))) ||
         t.includes('Use “Repair all local accounts”') ||
         t.includes('Use "Repair all local accounts"') ||
         t.includes('Records are kept in this browser.')){
        if(el.children.length===0 || el.tagName==='P' || el.tagName==='SMALL') el.remove();
      }
    });
  }

  cleanLogin();
  new MutationObserver(cleanLogin).observe(document.documentElement,{childList:true,subtree:true});
})();
