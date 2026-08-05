(function(){
  function boot(){
    if(typeof page!=='function'||typeof state==='undefined') return setTimeout(boot,150);
    if(window.__prepNavRepairPatchV2) return;
    window.__prepNavRepairPatchV2=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
    const plans=()=>[].concat(
      Array.isArray(state.prepPlans)?state.prepPlans:[],
      Array.isArray(state.prepLists)?state.prepLists:[],
      Array.isArray(state.productionPlans)?state.productionPlans:[]
    );

    function prepView(){
      const menus=Array.isArray(state.menus)?state.menus:[];
      const existing=plans();
      const menuOptions=menus.map(m=>`<option value="${escv(m.id)}">${escv(m.name||'Saved menu')}</option>`).join('');
      const planHtml=existing.length?existing.slice().reverse().map(p=>`<div class="row"><span></span><div><b>${escv(p.menuName||p.name||p.title||'Prep plan')}</b><br><small>${escv(p.date||p.serviceDate||String(p.createdAt||'').slice(0,10))} · ${Number(p.covers||0)} covers</small></div></div>`).join(''):'<p class="muted">No prep plans created yet.</p>';
      page('Prep Lists','Build production and shopping requirements from a saved menu.',`
        <div class="card"><h2>Build today’s prep</h2>
          <div class="form">
            <label>Saved menu<select id="safePrepMenu"><option value="">Select a menu</option>${menuOptions}</select></label>
            <label>Projected covers<input id="safePrepCovers" type="number" min="1" value="40"></label>
            <label>Service date<input id="safePrepDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
            <button class="btn" type="button" onclick="safeOpenPrepBuilder()">Open prep builder</button>
          </div>
        </div>
        <div class="card mt"><h2>Saved prep plans</h2><div class="rows">${planHtml}</div></div>`);
    }

    window.safeOpenPrepBuilder=function(){
      const menuId=String(document.getElementById('safePrepMenu')?.value||'');
      if(!menuId) return typeof toast==='function'&&toast('Select a saved menu first','bad');
      const menu=(state.menus||[]).find(m=>String(m.id)===menuId);
      if(!menu) return typeof toast==='function'&&toast('Saved menu not found','bad');
      const covers=Math.max(1,Number(document.getElementById('safePrepCovers')?.value||1));
      const date=document.getElementById('safePrepDate')?.value||new Date().toISOString().slice(0,10);
      state.prepDraft={menuId:menu.id,menuName:menu.name,covers,date};
      if(typeof toast==='function') toast('Menu loaded. Prep calculation will be restored next.','ok');
    };

    if(typeof VIEWS!=='undefined'){
      VIEWS.prep=prepView;
      VIEWS.prepLists=prepView;
      VIEWS.preplists=prepView;
    }

    document.addEventListener('click',function(e){
      const el=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');
      if(!el) return;
      const text=String(el.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
      const data=String((el.dataset&&(el.dataset.route||el.dataset.view||el.dataset.tab))||'').toLowerCase();
      if(text.includes('prep list')||data.includes('prep')){
        e.preventDefault();
        e.stopImmediatePropagation();
        try{window.route='prep';}catch(_){ }
        prepView();
      }
    },true);

    window.openPrepLists=prepView;
  }
  boot();
})();
