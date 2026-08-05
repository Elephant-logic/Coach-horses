(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__clockinSessionPatchInstalled) return;
    window.__clockinSessionPatchInstalled=true;

    function currentUser(){
      try{return (typeof me!=='undefined'&&me&&me.username)?me:null;}catch(_){return null;}
    }
    function entries(){
      if(!Array.isArray(state.timeEntries)) state.timeEntries=[];
      return state.timeEntries;
    }
    function openFor(username){
      const u=String(username||'').trim().toLowerCase();
      return entries().find(x=>String(x.username||'').trim().toLowerCase()===u && !x.clockOut && String(x.status||'open').toLowerCase()!=='closed');
    }
    async function ensureClockedIn(){
      const user=currentUser();
      if(!user) return false;
      if(openFor(user.username)) return true;
      const t=typeof nowISO==='function'?nowISO():new Date().toISOString();
      const d=typeof today==='function'?today():t.slice(0,10);
      const item={
        id:typeof uid==='function'?uid():('shift_'+Date.now()),
        username:user.username,
        name:user.name||user.username,
        role:user.role||'staff',
        date:d,
        clockIn:t,
        clockOut:'',
        breakMinutes:0,
        notes:'',
        status:'open'
      };
      entries().push(item);
      try{
        if(typeof audit==='function') await audit('clock_in','time_entry',{id:item.id,username:item.username,clockIn:item.clockIn,source:'secure_session'});
        await Promise.resolve(save());
      }catch(err){
        console.warn('Automatic clock-in save failed',err);
      }
      if(typeof render==='function') render();
      return true;
    }

    window.ensureCurrentUserClockedIn=ensureClockedIn;

    // Secure login restores the session asynchronously, so check until the user object exists.
    let tries=0;
    const timer=setInterval(async()=>{
      tries++;
      const user=currentUser();
      if(user){
        clearInterval(timer);
        await ensureClockedIn();
      }else if(tries>120){
        clearInterval(timer);
      }
    },250);

    // Also repair the status after navigation or a state refresh without making duplicates.
    new MutationObserver(()=>{
      const user=currentUser();
      if(user&&!openFor(user.username)) ensureClockedIn();
    }).observe(document.documentElement,{childList:true,subtree:true});
  }
  boot();
})();