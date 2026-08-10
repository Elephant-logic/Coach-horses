// Secure staff account controls for Command de Cuisine.
(function(){
  'use strict';

  const accountNav={id:'account',label:'My account',icon:'team',sect:'Manage'};
  if(typeof NAV!=='undefined'&&!NAV.some(n=>n.id==='account')) NAV.push(accountNav);

  const originalNavItems=typeof navItems==='function'?navItems:null;
  if(originalNavItems){
    navItems=function(){
      const items=originalNavItems();
      if(typeof ME!=='undefined'&&ME&&ME.role!=='manager') return items.filter(n=>n.id!=='team'&&n.id!=='settings');
      return items;
    };
  }

  const originalNavigate=typeof navigate==='function'?navigate:null;
  if(originalNavigate){
    navigate=function(route){
      if((route==='team'||route==='settings')&&typeof ME!=='undefined'&&ME&&ME.role!=='manager'){
        toast('Manager access required','warn');
        return originalNavigate('account');
      }
      return originalNavigate(route);
    };
  }

  async function refreshSharedState(){
    const r=await api('/api/session');
    if(r&&r.authenticated){
      ME=r.user;
      STATE=migrate(r.state);
      REV=r.revision||REV;
      renderNav();
    }
  }

  function passwordCard(){
    const card=el('div',{class:'card'});
    card.append(el('div',{class:'card-head'},el('h3',{},'Change my password')),
      el('p',{class:'muted',style:'font-size:13px;margin-top:-4px'},'Only you need to know your password. Enter your current password first.'));
    const current=el('input',{class:'inp',type:'password',autocomplete:'current-password',placeholder:'Current password'});
    const next=el('input',{class:'inp',type:'password',autocomplete:'new-password',placeholder:'New password — at least 10 characters'});
    const confirm=el('input',{class:'inp',type:'password',autocomplete:'new-password',placeholder:'Confirm new password'});
    const btn=el('button',{class:'btn primary',html:icon('save')+'Change password'});
    btn.addEventListener('click',async()=>{
      if(!current.value){toast('Enter your current password','warn');return;}
      if(next.value.length<10){toast('Use at least 10 characters','warn');return;}
      if(next.value!==confirm.value){toast('The new passwords do not match','warn');return;}
      btn.disabled=true;
      try{
        const r=await api('/api/password/change',{method:'POST',body:JSON.stringify({currentPassword:current.value,newPassword:next.value})});
        if(r.revision)REV=r.revision;
        current.value='';next.value='';confirm.value='';
        toast('Password changed','ok');
      }catch(err){toast(err.message||'Could not change password','bad');}
      btn.disabled=false;
    });
    card.append(el('div',{class:'grid g3'},lf('Current password',current),lf('New password',next),lf('Confirm password',confirm)),
      el('div',{style:'display:flex;justify-content:flex-end;margin-top:14px'},btn));
    return card;
  }

  function managerBadge(){
    return el('div',{class:'card',style:'margin-bottom:16px;border-color:#6a5534'},
      el('div',{class:'card-head'},el('h3',{},'Manager control'),el('div',{class:'spacer'}),el('span',{class:'tag warn'},'Final control')),
      el('div',{class:'muted',style:'font-size:13px'},'Managers control accounts, roles, activation and password resets. Staff cannot promote themselves or change manager settings.'));
  }

  if(typeof VIEWS!=='undefined'){
    VIEWS.account=function(v){
      const top=el('div',{class:'card',style:'margin-bottom:16px'});
      top.append(el('div',{class:'card-head'},el('h3',{},'My account')),
        el('div',{style:'display:flex;align-items:center;gap:12px'},
          el('div',{class:'av',style:'width:44px;height:44px;font-size:18px'},(ME.name||'?')[0]),
          el('div',{},el('div',{style:'font-weight:700'},ME.name||ME.username),el('div',{class:'muted',style:'font-size:12.5px'},(ME.jobTitle||ME.role)+' · @'+ME.username))));
      v.append(top,passwordCard());
      if(ME.role==='manager')v.append(managerBadge());
    };

    const originalTeam=VIEWS.team;
    VIEWS.team=function(v){
      if(!ME||ME.role!=='manager'){
        v.append(el('div',{class:'card'},el('div',{class:'empty'},el('h4',{},'Manager access required'),el('div',{},'Only managers can control staff accounts.'))));
        return;
      }
      v.append(managerBadge());
      if(originalTeam)originalTeam(v);

      const card=el('div',{class:'card',style:'margin-top:16px'});
      card.append(el('div',{class:'card-head'},el('h3',{},'Staff accounts'),el('div',{class:'spacer'}),el('span',{class:'chip'},STATE.users.length+' accounts')),
        el('p',{class:'muted',style:'font-size:13px;margin-top:-4px'},'Change roles, disable access, or issue a temporary password. Passwords themselves are never shown here.'));
      (STATE.users||[]).forEach(u=>{
        const row=el('div',{class:'docket',style:'margin-bottom:8px;align-items:center'});
        const info=el('div',{style:'flex:1;min-width:180px'},el('div',{class:'dk-t'},u.name||u.username),el('div',{class:'dk-s'},'@'+u.username+' · '+(u.jobTitle||u.role)));
        const role=el('select',{class:'inp',style:'max-width:125px'});
        ['staff','manager'].forEach(r=>{const o=el('option',{value:r},r==='manager'?'Manager':'Staff');if(u.role===r)o.selected=true;role.append(o);});
        const active=el('button',{class:'btn sm '+(u.active===false?'danger':'ghost'),html:u.active===false?'Disabled':'Active'});
        active.addEventListener('click',async()=>{
          const next=u.active===false;
          try{await api('/api/users/manage',{method:'POST',body:JSON.stringify({username:u.username,active:next})});await refreshSharedState();toast(next?'Account enabled':'Account disabled','ok');rerender();}
          catch(err){toast(err.message||'Could not update account','bad');}
        });
        role.addEventListener('change',async()=>{
          try{await api('/api/users/manage',{method:'POST',body:JSON.stringify({username:u.username,role:role.value})});await refreshSharedState();toast('Role updated','ok');rerender();}
          catch(err){role.value=u.role;toast(err.message||'Could not update role','bad');}
        });
        const reset=el('button',{class:'btn sm ghost',html:'Reset password'});
        reset.addEventListener('click',()=>resetPassword(u));
        row.append(info,role,active,reset);card.append(row);
      });
      v.append(card);
    };
  }

  function resetPassword(user){
    const body=el('div',{});
    body.append(el('p',{class:'muted',style:'margin-top:0'},'Set a temporary password for '+(user.name||user.username)+'. They should change it from My account after signing in.'));
    const pw=el('input',{class:'inp',type:'password',autocomplete:'new-password',placeholder:'Temporary password — at least 10 characters'});
    const confirm=el('input',{class:'inp',type:'password',autocomplete:'new-password',placeholder:'Confirm temporary password'});
    body.append(lf('Temporary password',pw),lf('Confirm',confirm));
    const m=modal({title:'Reset password',body,footer:[
      el('button',{class:'btn ghost',html:'Cancel',onclick:()=>m.close()}),
      el('button',{class:'btn primary',html:'Set temporary password',onclick:async()=>{
        if(pw.value.length<10){toast('Use at least 10 characters','warn');return;}
        if(pw.value!==confirm.value){toast('Passwords do not match','warn');return;}
        try{await api('/api/users/manage',{method:'POST',body:JSON.stringify({username:user.username,newPassword:pw.value})});await refreshSharedState();m.close();toast('Temporary password set','ok');}
        catch(err){toast(err.message||'Could not reset password','bad');}
      }})
    ]});
  }
})();
