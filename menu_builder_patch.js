(function(){
  function boot(){
    if(typeof state==='undefined'||typeof modal!=='function'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__menuBuilderPatchInstalledV2) return;
    window.__menuBuilderPatchInstalledV2=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const isManager=()=>{try{return !!(typeof me!=='undefined'&&me&&String(me.role||'').toLowerCase()==='manager');}catch(_){return false;}};

    window.menuBuilder=function(id=''){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      const existing=id?(state.menus||[]).find(x=>String(x.id)===String(id)):null;
      const selected=new Set((existing&&Array.isArray(existing.recipeIds)?existing.recipeIds:[]).map(String));
      const recipes=state.recipes||[];
      const choices=recipes.length?recipes.map(r=>`<label class="card menu-recipe-choice" style="display:flex;gap:12px;align-items:flex-start;margin:8px 0;padding:14px;cursor:pointer"><input style="width:24px;height:24px;flex:0 0 auto" type="checkbox" name="recipeIds" value="${escv(r.id)}" ${selected.has(String(r.id))?'checked':''}><span><b>${escv(r.name)}</b><br><small>${escv(r.category||'Uncategorised')} · ${Number(r.portions||0)} portions · ${escv(r.allergens||'VERIFY')}</small></span></label>`).join(''):'<div class="notice">No recipes are available yet. Add recipes or import your menu photos first.</div>';
      modal(`<h2>${existing?'Edit':'Create'} menu</h2><form id="menuBuilderForm" class="form">
        <label>Menu name<input name="name" required value="${escv(existing?.name||'')}"></label>
        <label>Description<textarea name="description">${escv(existing?.description||'')}</textarea></label>
        <div class="card" style="padding:14px;background:#f7f2df"><b>How to select dishes</b><p style="margin:6px 0 0">Tick the box beside each recipe. A menu needs at least two selected dishes.</p><p id="menuSelectedCount" style="margin:8px 0 0;font-weight:700">${selected.size} dishes selected</p></div>
        <h3>Select recipes for this menu</h3>
        <div style="max-height:48vh;overflow:auto">${choices}</div>
        <div class="btn-row" style="margin-top:14px"><button class="btn" id="saveMenuButton" type="submit">${existing?'Update':'Create'} menu</button><button class="btn ghost" type="button" onclick="closeModal();recipeForm()">Add another recipe</button></div>
      </form>`);
      const form=document.getElementById('menuBuilderForm');
      const count=document.getElementById('menuSelectedCount');
      const saveBtn=document.getElementById('saveMenuButton');
      function updateCount(){
        const n=form.querySelectorAll('input[name="recipeIds"]:checked').length;
        count.textContent=n+' dish'+(n===1?'':'es')+' selected'+(n<2?' — select at least two':' — ready to save');
        saveBtn.disabled=n<2;
        saveBtn.style.opacity=n<2?'0.55':'1';
      }
      form.addEventListener('change',updateCount); updateCount();
      form.onsubmit=async e=>{
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

    function addButtons(){
      if(!isManager()) return;
      const heading=[...document.querySelectorAll('h1,h2,h3')].find(h=>/saved menus/i.test(h.textContent||''));
      if(!heading) return;
      const card=heading.closest('.card')||heading.parentElement;
      if(card&&!card.querySelector('[data-menu-builder]')){
        const btn=document.createElement('button');
        btn.type='button'; btn.className='btn sm'; btn.textContent='Create menu'; btn.dataset.menuBuilder='1';
        btn.onclick=()=>window.menuBuilder();
        const head=heading.closest('.card-head');
        if(head) head.appendChild(btn); else heading.insertAdjacentElement('afterend',btn);
      }
      (state.menus||[]).forEach(m=>{
        const name=String(m.name||'').trim(); if(!name) return;
        [...document.querySelectorAll('b,strong,h3,h4')].filter(el=>String(el.textContent||'').trim()===name).forEach(el=>{
          const row=el.closest('.row')||el.closest('.card')||el.parentElement;
          if(!row||row.querySelector('[data-edit-menu="'+String(m.id)+'"]')) return;
          const btn=document.createElement('button'); btn.type='button'; btn.className='btn sm ghost'; btn.textContent='Edit dishes'; btn.dataset.editMenu=String(m.id); btn.onclick=()=>window.menuBuilder(m.id);
          const actions=row.querySelector('.btn-row')||row; actions.appendChild(btn);
        });
      });
    }

    new MutationObserver(addButtons).observe(document.documentElement,{childList:true,subtree:true});
    setInterval(addButtons,700);
    addButtons();
  }
  boot();
})();