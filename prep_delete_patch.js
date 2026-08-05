(function(){
  function start(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(start,150);
    if(window.__prepDeletePatchInstalled) return;
    window.__prepDeletePatchInstalled=true;

    function isManager(){
      try{return !!(typeof me!=='undefined'&&me&&String(me.role||'').toLowerCase()==='manager');}catch(_){return false;}
    }
    function list(){return Array.isArray(state.prepLists)?state.prepLists:[];}
    function prepName(p){return String(p.name||p.title||p.menuName||p.menu||p.dish||'Prep list').trim();}
    function prepDate(p){return String(p.date||p.serviceDate||p.createdAt||'').slice(0,10);}

    window.deletePrepList=async function(id){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      const p=list().find(x=>String(x.id)===String(id));
      if(!p) return typeof toast==='function'&&toast('Prep list not found','bad');
      if(!confirm('Delete this prep plan?\n\n'+prepName(p)+(prepDate(p)?' — '+prepDate(p):''))) return;
      state.prepLists=list().filter(x=>String(x.id)!==String(id));
      if(typeof audit==='function') await audit('delete','prep_list',{id:p.id,name:prepName(p),date:prepDate(p),by:(typeof me!=='undefined'&&me?me.name:'Manager')});
      save();
      if(typeof closeModal==='function') try{closeModal();}catch(_){ }
      if(typeof toast==='function') toast('Prep plan deleted','ok');
      if(typeof render==='function') render();
    };

    function addDeleteButtons(){
      if(!isManager()) return;
      const preps=list();
      if(!preps.length) return;
      const all=[...document.querySelectorAll('h1,h2,h3,h4,strong,b')];
      preps.forEach(p=>{
        const name=prepName(p);
        const matches=all.filter(el=>String(el.textContent||'').trim()===name);
        matches.forEach(el=>{
          const card=el.closest('.card')||el.parentElement;
          if(!card||card.dataset.prepDeleteFixed==='1') return;
          const text=String(card.textContent||'');
          if(!/prep|cover|complete|lead|created|service/i.test(text)) return;
          card.dataset.prepDeleteFixed='1';
          const row=document.createElement('div');
          row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:10px';
          const btn=document.createElement('button');
          btn.type='button'; btn.className='btn sm'; btn.textContent='Delete';
          btn.style.cssText='background:#9f2d2d;color:white;border-color:#9f2d2d';
          btn.onclick=function(e){e.preventDefault();e.stopPropagation();window.deletePrepList(p.id);};
          row.appendChild(btn);
          const existing=[...card.querySelectorAll('button')];
          const open=existing.find(b=>/open/i.test(b.textContent||''));
          if(open&&open.parentElement){open.parentElement.appendChild(btn);}else{card.appendChild(row);}
        });
      });

      // Detail view: match the heading and add a manager delete action beside Print/Back.
      preps.forEach(p=>{
        const heading=[...document.querySelectorAll('h1,h2,h3')].find(h=>String(h.textContent||'').trim()===prepName(p));
        if(!heading) return;
        const pageRoot=heading.closest('.card')||heading.parentElement;
        if(!pageRoot||pageRoot.querySelector('[data-delete-prep-id="'+CSS.escape(String(p.id))+'"]')) return;
        const actions=[...pageRoot.querySelectorAll('button')];
        const back=actions.find(b=>/back/i.test(b.textContent||''));
        if(!back) return;
        const btn=document.createElement('button');
        btn.type='button'; btn.className='btn sm'; btn.textContent='Delete prep plan';
        btn.dataset.deletePrepId=String(p.id);
        btn.style.cssText='background:#9f2d2d;color:white;border-color:#9f2d2d;margin-right:8px';
        btn.onclick=function(e){e.preventDefault();e.stopPropagation();window.deletePrepList(p.id);};
        back.parentElement.insertBefore(btn,back);
      });
    }

    new MutationObserver(addDeleteButtons).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(addDeleteButtons,700);
    addDeleteButtons();
  }
  start();
})();
