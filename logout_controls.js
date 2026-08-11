// Explicit logout control for Command de Cuisine.
(function(){
  'use strict';

  async function logoutNow(btn){
    if(btn)btn.disabled=true;
    try{
      await api('/api/logout',{method:'POST',body:'{}'});
    }catch(err){
      // Reload anyway: if the request reached the server the cookie may already be cleared.
      console.error('Logout request failed',err);
    }
    try{ localStorage.removeItem('command_de_cuisine_session'); }catch{}
    window.location.replace('/');
  }

  if(typeof VIEWS!=='undefined'&&typeof VIEWS.account==='function'){
    const originalAccount=VIEWS.account;
    VIEWS.account=function(v){
      originalAccount(v);
      const card=el('div',{class:'card',style:'margin-top:16px'});
      const btn=el('button',{class:'btn danger',html:'Log out'});
      btn.addEventListener('click',()=>logoutNow(btn));
      card.append(
        el('div',{class:'card-head'},el('h3',{},'Session')),
        el('p',{class:'muted',style:'font-size:13px;margin-top:-4px'},'This device stays signed in for up to 12 hours unless you log out.'),
        el('div',{style:'display:flex;justify-content:flex-end'},btn)
      );
      v.append(card);
    };
  }
})();
