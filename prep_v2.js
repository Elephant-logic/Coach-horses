(function(){
  'use strict';
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof save!=='function') return setTimeout(boot,200);
    if(window.__prepV2Active) return;
    window.__prepV2Active=true;
    if(!Array.isArray(state.prepLists)) state.prepLists=[];

    const STAFF=['Keith Davies','Ian Park','Harry Duckworth'];
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
    const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
    const round=n=>Math.round((Number(n)||0)*100)/100;
    const uid=()=>('prep_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7));
    const today=()=>new Date().toISOString().slice(0,10);
    const menus=()=>Array.isArray(state.menus)?state.menus:[];
    const recipes=()=>Array.isArray(state.recipes)?state.recipes:[];
    const preps=()=>Array.isArray(state.prepLists)?state.prepLists:[];
    const menuFor=id=>menus().find(m=>String(m.id)===String(id));
    const recipeFor=id=>recipes().find(r=>String(r.id)===String(id));
    const recipesFor=m=>{const ids=(Array.isArray(m&&m.recipeIds)?m.recipeIds:[]).map(String);return recipes().filter(r=>ids.includes(String(r.id)));};
    const isManager=()=>{try{return String(me&&me.role||'').toLowerCase()==='manager';}catch(_){return false;}};
    let activeId=null;

    function liveStockFor(name,unit){
      const lines=Array.isArray(state.stock)?state.stock:[];
      return round(lines.filter(s=>norm(s.name)===norm(name)&&norm(s.unit)===norm(unit)).reduce((a,s)=>a+Math.max(0,num(s.qty)),0));
    }

    function calculate(menu,covers,existing){
      const map=new Map();
      const jobs=[];
      const oldJobs=new Map(((existing&&existing.jobs)||[]).map(j=>[String(j.recipeId),j]));
      recipesFor(menu).forEach(r=>{
        const base=Math.max(1,num(r.portions||r.yield)||10),factor=covers/base;
        const old=oldJobs.get(String(r.id))||{};
        jobs.push({recipeId:r.id,recipeName:r.name||'Recipe',portions:covers,assignedTo:old.assignedTo||'',completed:!!old.completed,notes:old.notes||''});
        (Array.isArray(r.ingredients)?r.ingredients:[]).forEach(i=>{
          if(!i||typeof i==='string'||!i.name)return;
          const qty=num(i.qty??i.quantity),unit=String(i.unit||'').trim();
          if(qty<=0||!unit)return;
          const key=norm(i.name)+'|'+norm(unit),row=map.get(key)||{key,name:String(i.name).trim(),unit,required:0};
          row.required=round(row.required+qty*factor);map.set(key,row);
        });
      });
      const oldStock=(existing&&existing.stock)||{};
      const order=[...map.values()].map(r=>{
        const stock=Object.prototype.hasOwnProperty.call(oldStock,r.key)?Math.max(0,num(oldStock[r.key])):liveStockFor(r.name,r.unit);
        return {...r,inStock:stock,toBuy:round(Math.max(0,r.required-stock))};
      });
      return {jobs,order};
    }

    function recordFromForm(){
      const menuId=document.getElementById('prepV2Menu')?.value||'';
      const menu=menuFor(menuId);if(!menu)throw new Error('Select a saved menu');
      const covers=Math.max(1,Math.round(num(document.getElementById('prepV2Covers')?.value)||0));
      const date=document.getElementById('prepV2Date')?.value||today();
      const existing=activeId?preps().find(p=>String(p.id)===String(activeId)):null;
      const calc=calculate(menu,covers,existing);
      return {
        id:existing?.id||uid(),menuId:menu.id,menuName:menu.name||'Menu',date,covers,
        jobs:calc.jobs,order:calc.order,stock:Object.fromEntries(calc.order.map(x=>[x.key,x.inStock])),
        createdAt:existing?.createdAt||new Date().toISOString(),createdBy:existing?.createdBy||(typeof me!=='undefined'&&me?me.name:''),
        updatedAt:new Date().toISOString(),notes:existing?.notes||''
      };
    }

    function syncFromScreen(p){
      document.querySelectorAll('[data-prep-job]').forEach(el=>{
        const job=p.jobs.find(j=>String(j.recipeId)===String(el.dataset.prepJob));if(!job)return;
        const row=el.closest('[data-prep-row]');
        job.assignedTo=row?.querySelector('[data-prep-assignee]')?.value||'';
        job.completed=!!row?.querySelector('[data-prep-complete]')?.checked;
        job.notes=row?.querySelector('[data-prep-notes]')?.value||'';
      });
      document.querySelectorAll('[data-prep-stock]').forEach(el=>{p.stock[el.dataset.prepStock]=Math.max(0,num(el.value));});
      p.order.forEach(r=>{r.inStock=Math.max(0,num(p.stock[r.key]));r.toBuy=round(Math.max(0,r.required-r.inStock));});
      p.notes=document.getElementById('prepV2Notes')?.value||p.notes||'';
      p.updatedAt=new Date().toISOString();
      return p;
    }

    async function persist(p,message){
      const idx=preps().findIndex(x=>String(x.id)===String(p.id));
      if(idx>=0)state.prepLists[idx]=p;else state.prepLists.push(p);
      activeId=p.id;
      await Promise.resolve(save());
      if(typeof toast==='function')toast(message||'Prep list saved','ok');
    }

    function staffOptions(selected){return '<option value="">Unassigned</option>'+STAFF.map(s=>'<option '+(s===selected?'selected':'')+'>'+esc(s)+'</option>').join('');}

    function renderEditor(p){
      activeId=p.id;
      const jobRows=p.jobs.map(j=>'<div class="row" data-prep-row><input data-prep-complete type="checkbox" '+(j.completed?'checked':'')+' title="Completed"><div style="min-width:180px"><b>'+esc(j.recipeName)+'</b><br><small>'+p.covers+' portions</small><input type="hidden" data-prep-job="'+esc(j.recipeId)+'"></div><label>Assigned to<select data-prep-assignee>'+staffOptions(j.assignedTo)+'</select></label><label>Job note<input data-prep-notes value="'+esc(j.notes||'')+'" placeholder="e.g. cool before service"></label></div>').join('');
      const orderRows=p.order.map(r=>'<div class="row"><span></span><div><b>'+esc(r.name)+'</b><br><small>Required '+r.required+' '+esc(r.unit)+'</small></div><label>In stock<input data-prep-stock="'+esc(r.key)+'" type="number" min="0" step="0.01" value="'+r.inStock+'"></label><b data-prep-buy="'+esc(r.key)+'">Order '+r.toBuy+' '+esc(r.unit)+'</b></div>').join('');
      document.getElementById('prepV2Workspace').innerHTML='<div class="card mt"><div class="card-head"><div><h2>'+esc(p.menuName)+' · '+esc(p.date)+'</h2><p class="muted">'+p.covers+' covers · '+p.jobs.filter(j=>j.completed).length+'/'+p.jobs.length+' jobs complete</p></div><div class="btn-row"><button class="btn" id="prepV2Save">Save changes</button><button class="btn ghost" id="prepV2Print">Print</button><button class="btn ghost" id="prepV2Csv">Order CSV</button></div></div><div class="rows">'+(jobRows||'<p>No prep jobs.</p>')+'</div></div><div class="card mt"><h2>Order list</h2><p class="muted">Stock starts from matching live stock where available; anything missing starts at zero.</p><div class="rows">'+(orderRows||'<p>No order lines.</p>')+'</div></div><div class="card mt"><label>Prep notes<textarea id="prepV2Notes" placeholder="Service notes, shortages, handover…">'+esc(p.notes||'')+'</textarea></label></div>';
      const recalc=()=>{document.querySelectorAll('[data-prep-stock]').forEach(el=>{const row=p.order.find(x=>x.key===el.dataset.prepStock);if(!row)return;row.inStock=Math.max(0,num(el.value));row.toBuy=round(Math.max(0,row.required-row.inStock));const out=document.querySelector('[data-prep-buy="'+CSS.escape(row.key)+'"]');if(out)out.textContent='Order '+row.toBuy+' '+row.unit;});};
      document.querySelectorAll('[data-prep-stock]').forEach(el=>el.addEventListener('input',recalc));
      document.getElementById('prepV2Save').onclick=async()=>{syncFromScreen(p);await persist(p,'Prep list saved');renderPrep();openPrep(p.id);};
      document.getElementById('prepV2Print').onclick=()=>window.print();
      document.getElementById('prepV2Csv').onclick=()=>downloadOrderCsv(syncFromScreen(p));
    }

    function downloadOrderCsv(p){
      const rows=[['date','menu','covers','item','required','unit','in_stock','to_order'],...p.order.map(r=>[p.date,p.menuName,p.covers,r.name,r.required,r.unit,r.inStock,r.toBuy])];
      const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='prep-order-'+p.date+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }

    function openPrep(id){
      const p=preps().find(x=>String(x.id)===String(id));if(!p)return;
      activeId=p.id;
      const menu=menuFor(p.menuId);if(menu){const current=calculate(menu,p.covers,p);p.jobs=current.jobs;p.order=current.order;p.stock=Object.fromEntries(current.order.map(x=>[x.key,x.inStock]));}
      const m=document.getElementById('prepV2Menu'),d=document.getElementById('prepV2Date'),c=document.getElementById('prepV2Covers');if(m)m.value=String(p.menuId);if(d)d.value=p.date;if(c)c.value=p.covers;
      renderEditor(p);
    }

    async function createPrep(){
      try{const p=recordFromForm();await persist(p,'Prep list created');renderPrep();openPrep(p.id);}catch(err){if(typeof toast==='function')toast(err.message,'bad');}
    }

    async function deletePrep(id){
      if(!isManager())return typeof toast==='function'&&toast('Manager access required','bad');
      if(!confirm('Delete this saved prep list?'))return;
      state.prepLists=preps().filter(p=>String(p.id)!==String(id));if(String(activeId)===String(id))activeId=null;await Promise.resolve(save());renderPrep();
    }

    function renderPrep(){
      const opts=menus().map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name||'Menu')+' ('+recipesFor(m).length+' recipes)</option>').join('');
      const saved=preps().slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).map(p=>'<div class="row"><span></span><div><b>'+esc(p.menuName||'Prep')+'</b><br><small>'+esc(p.date||'')+' · '+Number(p.covers||0)+' covers · '+((p.jobs||[]).filter(j=>j.completed).length)+'/'+((p.jobs||[]).length)+' complete</small></div><div class="btn-row"><button class="btn sm" data-open-prep="'+esc(p.id)+'">Open</button><button class="btn sm ghost" data-print-prep="'+esc(p.id)+'">Print</button>'+(isManager()?'<button class="btn sm bad" data-delete-prep="'+esc(p.id)+'">Delete</button>':'')+'</div></div>').join('');
      page('Prep Lists','Saved prep, assignments, completion and ordering from the selected menu.','<div class="card"><h2>Create / recalculate prep</h2><div class="form"><label>Saved menu<select id="prepV2Menu"><option value="">Select menu</option>'+opts+'</select></label><label>Prep date<input id="prepV2Date" type="date" value="'+today()+'"></label><label>Projected covers<input id="prepV2Covers" type="number" min="1" value="40"></label><button class="btn" id="prepV2Create">Build & save prep</button></div></div><div class="card mt"><h2>Saved prep lists</h2><div class="rows">'+(saved||'<p class="muted">No saved prep lists yet.</p>')+'</div></div><div id="prepV2Workspace"></div>');
      document.getElementById('prepV2Create').onclick=createPrep;
      document.querySelectorAll('[data-open-prep]').forEach(b=>b.onclick=()=>openPrep(b.dataset.openPrep));
      document.querySelectorAll('[data-print-prep]').forEach(b=>b.onclick=()=>{openPrep(b.dataset.printPrep);setTimeout(()=>window.print(),100);});
      document.querySelectorAll('[data-delete-prep]').forEach(b=>b.onclick=()=>deletePrep(b.dataset.deletePrep));
      if(activeId&&preps().some(p=>String(p.id)===String(activeId)))openPrep(activeId);
    }

    window.getPrepV2Context=function(){
      const p=preps().find(x=>String(x.id)===String(activeId));
      if(!p)return {savedPrepCount:preps().length,activePrep:null};
      return {savedPrepCount:preps().length,activePrep:{id:p.id,date:p.date,menu:p.menuName,covers:p.covers,notes:p.notes||'',jobs:(p.jobs||[]).map(j=>({recipe:j.recipeName,assignedTo:j.assignedTo||'',completed:!!j.completed,notes:j.notes||''})),order:(p.order||[]).map(r=>({item:r.name,required:r.required,unit:r.unit,inStock:r.inStock,toOrder:r.toBuy}))}};
    };
    window.applyPrepAICommand=async function(text){
      const p=preps().find(x=>String(x.id)===String(activeId));if(!p)return null;
      const q=String(text||'').trim();
      let m=q.match(/assign\s+(.+?)\s+to\s+(keith|ian|harry)\b/i);
      if(m){const term=norm(m[1]),who={keith:'Keith Davies',ian:'Ian Park',harry:'Harry Duckworth'}[m[2].toLowerCase()];let n=0;p.jobs.forEach(j=>{if(norm(j.recipeName).includes(term)){j.assignedTo=who;n++;}});if(n){await persist(p,n+' prep job'+(n===1?'':'s')+' assigned to '+who);renderPrep();openPrep(p.id);return 'Assigned '+n+' matching prep job'+(n===1?'':'s')+' to '+who+'.';}return 'I could not find a prep job matching “'+m[1]+'”.';}
      m=q.match(/mark\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)\b/i);
      if(m){const term=norm(m[1]);let n=0;p.jobs.forEach(j=>{if(norm(j.recipeName).includes(term)){j.completed=true;n++;}});if(n){await persist(p,n+' prep job'+(n===1?'':'s')+' completed');renderPrep();openPrep(p.id);return 'Marked '+n+' matching prep job'+(n===1?'':'s')+' complete.';}return 'I could not find a prep job matching “'+m[1]+'”.';}
      return null;
    };

    VIEWS.prep=renderPrep;
    if(VIEWS.preplists) VIEWS.preplists=renderPrep;
    window.renderPrepV2=renderPrep;
  }
  boot();
})();
