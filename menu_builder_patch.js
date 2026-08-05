(function(){
  function boot(){
    if(typeof state==='undefined'||typeof modal!=='function'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__menuBuilderPatchInstalled) return;
    window.__menuBuilderPatchInstalled=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const isManager=()=>{try{return !!(typeof me!=='undefined'&&me&&String(me.role||'').toLowerCase()==='manager');}catch(_){return false;}};

    window.menuBuilder=function(id=''){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      const existing=id?(state.menus||[]).find(x=>String(x.id)===String(id)):null;
      const selected=new Set((existing&&Array.isArray(existing.recipeIds)?existing.recipeIds:[]).map(String));
      const recipes=state.recipes||[];
      if(recipes.length<2) return typeof toast==='function'&&toast('Add at least two recipes before creating a menu','bad');
      const choices=recipes.map(r=>`<label class="card" style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;padding:12px"><input type="checkbox" name="recipeIds" value="${escv(r.id)}" ${selected.has(String(r.id))?'checked':''}><span><b>${escv(r.name)}</b><br><small>${escv(r.category||'Uncategorised')} · ${Number(r.portions||0)} portions · ${escv(r.allergens||'VERIFY')}</small></span></label>`).join('');
      modal(`<h2>${existing?'Edit':'Create'} menu</h2><form id="menuBuilderForm" class="form">
        <label>Menu name<input name="name" required value="${escv(existing?.name||'')}"></label>
        <label>Description<textarea name="description">${escv(existing?.description||'')}</textarea></label>
        <h3>Select dishes</h3><p class="muted">A menu must contain at least two recipes.</p>
        <div style="max-height:48vh;overflow:auto">${choices}</div>
        <button class="btn" type="submit">${existing?'Update':'Save'} menu</button>
      </form>`);
      document.getElementById('menuBuilderForm').onsubmit=async e=>{
        e.preventDefault();
        const fd=new FormData(e.target);
        const recipeIds=fd.getAll('recipeIds').map(String);
        if(recipeIds.length<2) return toast('Select at least two dishes','bad');
        const data={name:String(fd.get('name')||'').trim(),description:String(fd.get('description')||'').trim(),recipeIds,updatedAt:typeof nowISO==='function'?nowISO():new Date().toISOString()};
        if(existing) Object.assign(existing,data);
        else (state.menus=state.menus||[]).push({id:uid(),...data,createdAt:data.updatedAt,createdBy:typeof me!=='undefined'&&me?me.name:'Manager'});
        if(typeof audit==='function') await audit(existing?'update':'create','menu',{name:data.name,recipeCount:recipeIds.length});
        save(); closeModal(); toast(existing?'Menu updated':'Menu created','ok'); if(typeof render==='function') render();
      };
    };

    function addCreateButton(){
      const heading=[...document.querySelectorAll('h1,h2,h3')].find(h=>/saved menus/i.test(h.textContent||''));
      if(!heading||!isManager()) return;
      const card=heading.closest('.card')||heading.parentElement;
      if(!card||card.querySelector('[data-menu-builder]')) return;
      const btn=document.createElement('button');
      btn.type='button'; btn.className='btn sm'; btn.textContent='Create menu'; btn.dataset.menuBuilder='1';
      btn.onclick=()=>window.menuBuilder();
      const head=heading.closest('.card-head');
      if(head) head.appendChild(btn); else heading.insertAdjacentElement('afterend',btn);
    }

    new MutationObserver(addCreateButton).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(addCreateButton,900);
    addCreateButton();
  }
  boot();
})();