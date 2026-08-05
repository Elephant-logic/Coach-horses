(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__prepDeletePatchV2) return;
    window.__prepDeletePatchV2=true;

    const user=()=>{try{if(typeof me!=='undefined'&&me)return me;}catch(e){}return window.me||state.currentUser||state.user||{};};
    const isManager=()=>{const u=user();return String(u.role||'').toLowerCase()==='manager'||String(u.username||'').toLowerCase()==='manager'||String(u.name||'').toLowerCase()==='kitchen manager';};
    const txt=v=>String(v==null?'':v).trim();
    const keys=()=>['prepLists','prepPlans','prepRuns','productionPlans','plans'].filter(k=>Array.isArray(state[k]));
    const entries=()=>keys().flatMap(k=>state[k].map(plan=>({key:k,plan})));
    const name=p=>txt(p.name||p.title||p.menuName||p.menu||p.dish||p.recipeName||'Prep plan');
    const date=p=>txt(p.date||p.serviceDate||p.createdAt||'').slice(0,10);

    function findPlan(id,planName,planDate){
      const all=entries();
      return all.find(x=>id&&String(x.plan.id)===String(id))||all.find(x=>planName&&name(x.plan).toLowerCase()===txt(planName).toLowerCase()&&(!planDate||date(x.plan)===planDate))||null;
    }

    window.deletePrepPlan=window.deletePrepList=async function(id,planName,planDate){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      const found=findPlan(id,planName,planDate);
      if(!found) return typeof toast==='function'&&toast('Prep plan not found','bad');
      const p=found.plan;
      if(!confirm('Delete prep plan “'+name(p)+'”?')) return;
      state[found.key]=state[found.key].filter(x=>String(x.id)!==String(p.id));
      ['prepJobs','productionJobs','tasks'].forEach(k=>{if(Array.isArray(state[k]))state[k]=state[k].filter(j=>String(j.planId||j.prepPlanId||'')!==String(p.id));});
      try{if(typeof audit==='function')await audit('delete','prep_plan',{id:p.id,name:name(p),date:date(p),by:user().name||'Manager'});}catch(e){}
      save();
      if(typeof toast==='function')toast('Prep plan deleted','ok');
      if(typeof closeModal==='function')try{closeModal();}catch(e){}
      if(typeof render==='function')render();
    };

    function makeButton(p,label){
      const b=document.createElement('button');
      b.type='button';b.className='btn sm bad prep-delete-btn';b.textContent=label||'Delete';
      b.style.cssText='background:#9f2d2d;color:#fff;border-color:#9f2d2d;margin-left:8px';
      b.onclick=e=>{e.preventDefault();e.stopPropagation();deletePrepPlan(p.id,name(p),date(p));};
      return b;
    }

    function inject(){
      if(!isManager())return;
      const plans=entries().map(x=>x.plan);
      for(const p of plans){
        const n=name(p);
        const matches=[...document.querySelectorAll('b,strong,h1,h2,h3,h4')].filter(el=>txt(el.textContent)===n);
        for(const el of matches){
          const card=el.closest('.row,.card')||el.parentElement;
          if(!card||card.querySelector('.prep-delete-btn'))continue;
          const buttons=[...card.querySelectorAll('button')];
          const open=buttons.find(b=>/open/i.test(txt(b.textContent)));
          const back=buttons.find(b=>/back/i.test(txt(b.textContent)));
          const print=buttons.find(b=>/print/i.test(txt(b.textContent)));
          const target=(open||back||print)?.parentElement||card;
          target.appendChild(makeButton(p,back||print?'Delete prep plan':'Delete'));
        }
      }
    }

    new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(inject,500);
    inject();
  }
  boot();
})();