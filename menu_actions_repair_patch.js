(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__menuActionsRepairPatch) return;
    window.__menuActionsRepairPatch=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
    const isManager=()=>{try{return !!(typeof me!=='undefined'&&me&&norm(me.role)==='manager');}catch(_){return false;}};

    function savedMenusCard(){
      const h=[...document.querySelectorAll('h1,h2,h3')].find(x=>/saved menus/i.test(String(x.textContent||'')));
      return h&&(h.closest('.card')||h.parentElement);
    }
    function menuFromButton(btn){
      const card=savedMenusCard();
      if(!card||!card.contains(btn)) return null;
      const row=btn.closest('.row')||btn.parentElement;
      if(!row) return null;
      const nameEl=row.querySelector('b,strong,h3,h4');
      const name=String(nameEl&&nameEl.textContent||'').trim();
      return (state.menus||[]).find(m=>norm(m.name)===norm(name))||null;
    }
    function recipesFor(menu){
      const ids=(Array.isArray(menu&&menu.recipeIds)?menu.recipeIds:[]).map(String);
      return (state.recipes||[]).filter(r=>ids.includes(String(r.id)));
    }
    function openMenu(menu){
      const recipes=recipesFor(menu);
      const body=recipes.length?recipes.map(r=>`<div class="row"><span></span><div><b>${escv(r.name||'Untitled dish')}</b><br><small>${escv(r.category||r.course||'Uncategorised')} · ${Number(r.portions||0)} portions</small></div><button class="btn sm" type="button" onclick="closeModal();recipeForm('${escv(r.id)}')">Open recipe</button></div>`).join(''):'<p class="muted">No recipes are attached to this menu.</p>';
      if(typeof modal==='function') modal(`<h2>${escv(menu.name||'Menu')}</h2><p class="muted">${escv(menu.description||'')}</p><div class="rows">${body}</div><div class="btn-row mt"><button class="btn" type="button" onclick="closeModal();menuBuilder('${escv(menu.id)}')">Edit dishes</button><button class="btn ghost" type="button" onclick="closeModal()">Close</button></div>`);
    }
    async function deleteMenu(menu){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      if(!confirm('Delete menu “'+String(menu.name||'Menu')+'”? Recipes will not be deleted.')) return;
      state.menus=(state.menus||[]).filter(m=>String(m.id)!==String(menu.id));
      try{if(typeof audit==='function') await audit('delete','menu',{id:menu.id,name:menu.name});}catch(_){ }
      save();
      if(typeof toast==='function') toast('Menu deleted','ok');
      if(typeof render==='function') render();
    }

    document.addEventListener('click',function(e){
      const btn=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');
      if(!btn) return;
      const menu=menuFromButton(btn); if(!menu) return;
      const t=norm(btn.textContent);
      if(t==='open menu'){
        e.preventDefault();e.stopImmediatePropagation();openMenu(menu);
      }else if(t==='edit dishes'){
        e.preventDefault();e.stopImmediatePropagation();
        if(typeof window.menuBuilder==='function') window.menuBuilder(menu.id);
        else if(typeof toast==='function') toast('Menu editor is unavailable','bad');
      }else if(t==='delete'){
        e.preventDefault();e.stopImmediatePropagation();deleteMenu(menu);
      }
    },true);

    window.openSavedMenu=openMenu;
    window.deleteSavedMenu=deleteMenu;
  }
  boot();
})();