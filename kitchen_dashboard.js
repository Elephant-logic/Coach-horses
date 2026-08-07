(function(){
'use strict';
function boot(){
  if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function') return setTimeout(boot,150);
  if(window.__kitchenDashboardV1) return;window.__kitchenDashboardV1=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr=n=>Array.isArray(state[n])?state[n]:[];
  const val=(o,ks,d='')=>{for(const k of ks){if(o&&o[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k];}return d;};
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
  const today=()=>new Date().toISOString().slice(0,10);
  const money=n=>'£'+num(n).toFixed(2);
  const countBy=(records,get)=>{const m=new Map();for(const r of records){const k=String(get(r)||'Unknown');m.set(k,(m.get(k)||0)+1);}return [...m.entries()].sort((a,b)=>b[1]-a[1]);};
  function style(){if(document.getElementById('kitchen-dashboard-style'))return;const s=document.createElement('style');s.id='kitchen-dashboard-style';s.textContent=`
    .kd-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:12px}.kd-card{background:#fff;border:1px solid #ddd;border-radius:14px;padding:14px}.kd-card h3{margin:0 0 6px;font-size:14px}.kd-value{font-size:28px;font-weight:800;line-height:1.1}.kd-sub{font-size:12px;color:#666;margin-top:5px}.kd-alert{border-left:5px solid currentColor}.kd-actions{display:flex;gap:8px;flex-wrap:wrap}.kd-actions button{flex:1;min-width:130px}.kd-bars{display:grid;gap:8px}.kd-row{display:grid;grid-template-columns:minmax(80px,1fr) 2.2fr auto;gap:8px;align-items:center;font-size:12px}.kd-track{height:10px;background:#eee;border-radius:999px;overflow:hidden}.kd-fill{height:100%;background:currentColor;opacity:.7}.kd-list{display:grid;gap:8px}.kd-item{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #eee}.kd-item:last-child{border-bottom:0}.kd-section{margin-top:14px}.kd-good{color:#247a3b}.kd-warn{color:#9a6412}.kd-bad{color:#a83030}@media(max-width:640px){.kd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.kd-value{font-size:23px}.kd-actions button{min-width:46%}}
  `;document.head.appendChild(s);}
  function metric(title,value,sub,klass=''){return `<div class="kd-card ${klass}"><h3>${esc(title)}</h3><div class="kd-value">${esc(value)}</div><div class="kd-sub">${esc(sub||'')}</div></div>`;}
  function bars(title,rows){const max=Math.max(1,...rows.map(r=>num(r[1])));return `<div class="kd-card"><h3>${esc(title)}</h3><div class="kd-bars">${rows.slice(0,6).map(([k,v])=>`<div class="kd-row"><span>${esc(k)}</span><div class="kd-track"><div class="kd-fill" style="width:${Math.max(3,num(v)/max*100)}%"></div></div><b>${esc(v)}</b></div>`).join('')||'<div class="kd-sub">No data yet.</div>'}</div></div>`;}
  function go(routeName){try{route=routeName;if(typeof renderNav==='function')renderNav();if(typeof render==='function')render();}catch(e){console.warn('Dashboard navigation failed',e);}}
  function button(label,routeName){return `<button class="btn ghost" type="button" data-kd-route="${esc(routeName)}">${esc(label)}</button>`;}
  function dashboardView(){
    const d=today(),checks=arr('checks'),todayTemps=checks.filter(x=>String(x.date||'')===d),badTemps=todayTemps.filter(x=>String(x.status||'').toLowerCase()!=='ok');
    const haccp=Array.isArray(state.haccpRecords)?state.haccpRecords:arr('haccp'),todayHaccp=haccp.filter(x=>String(x.date||'')===d),badHaccp=todayHaccp.filter(x=>String(val(x,['result','status'],'')).toLowerCase()==='fail');
    const daily=arr('dailyChecks').filter(x=>String(x.date||'')===d),badDaily=daily.filter(x=>String(val(x,['result','status'],'')).toLowerCase()==='fail');
    const prep=arr('prepLists').filter(x=>String(x.date||'')===d),jobs=prep.flatMap(x=>Array.isArray(x.jobs)?x.jobs:[]),done=jobs.filter(x=>x.completed).length,prepPct=jobs.length?Math.round(done/jobs.length*100):0;
    const cleaning=arr('scheduleCompletions').filter(x=>String(x.date||'')===d),schedules=arr('cleaningSchedules'),dueCleaning=schedules.filter(x=>{const due=String(val(x,['nextDue','dueDate'],''));return due&&due<=d;});
    const waste=arr('waste').filter(x=>String(x.date||'')===d),wasteCost=waste.reduce((a,x)=>a+num(val(x,['estimatedCost','cost'])),0);
    const incidents=(Array.isArray(state.incidents)?state.incidents:arr('incidentRecords')).filter(x=>String(val(x,['status'],'Open')).toLowerCase()!=='closed');
    const stock=arr('stock'),lowStock=stock.filter(x=>{const q=num(val(x,['qty','quantity']));const min=num(val(x,['min','minimum','parLevel','reorderLevel']));return min>0?q<=min:q<=0;});
    const clockStores=['clockins','clockIns','timeEntries','timesheets'];let clock=[];for(const s of clockStores){if(arr(s).length){clock=arr(s);break;}}const activeStaff=clock.filter(x=>val(x,['clockIn','start','in'])&&!val(x,['clockOut','end','out'])).length;
    const issues=badTemps.length+badHaccp.length+badDaily.length+incidents.length+dueCleaning.length;
    const statusClass=issues?'kd-bad kd-alert':'kd-good kd-alert';
    const attention=[];
    if(badTemps.length)attention.push(['Temperature alerts',badTemps.length,'probe']);
    if(badHaccp.length)attention.push(['Failed HACCP checks',badHaccp.length,'haccp']);
    if(badDaily.length)attention.push(['Failed daily checks',badDaily.length,'dailychecks']);
    if(dueCleaning.length)attention.push(['Cleaning due / overdue',dueCleaning.length,'cleaning']);
    if(incidents.length)attention.push(['Open incidents',incidents.length,'incidents']);
    if(lowStock.length)attention.push(['Low / empty stock lines',lowStock.length,'stock']);
    const checksBreakdown=countBy([...todayHaccp,...daily],x=>val(x,['result','status'],'Unknown'));
    page('Kitchen dashboard','Today at a glance — what needs attention, what is complete, and where to go next.',`
      <div class="kd-grid">
        ${metric('Kitchen status',issues?issues+' issue'+(issues===1?'':'s'):'All clear',issues?'Items need attention today':'No current red flags',statusClass)}
        ${metric('Prep complete',prepPct+'%',jobs.length?`${done} of ${jobs.length} jobs`:'No prep list for today',prepPct===100&&jobs.length?'kd-good':'')}
        ${metric('Temperature alerts',badTemps.length,`${todayTemps.length} readings today`,badTemps.length?'kd-bad':'kd-good')}
        ${metric('Waste today',money(wasteCost),`${waste.length} waste records`)}
        ${metric('Cleaning completed',cleaning.length,`${dueCleaning.length} due / overdue`,dueCleaning.length?'kd-warn':'kd-good')}
        ${metric('Staff clocked in',activeStaff,clock.length?'Based on current time records':'No clocking data yet')}
      </div>
      <div class="grid cols-even kd-section">
        <div class="card"><h2>Needs attention</h2><div class="kd-list">${attention.length?attention.map(([label,n,r])=>`<div class="kd-item"><span>${esc(label)}</span><button class="btn sm ghost" data-kd-route="${esc(r)}">${esc(n)} · Open</button></div>`).join(''):'<p class="muted">Nothing urgent is currently flagged.</p>'}</div></div>
        <div class="card"><h2>Quick actions</h2><div class="kd-actions">${button('Prep','prep')}${button('Temperatures','probe')}${button('Daily checks','dailychecks')}${button('Cleaning','cleaning')}${button('Stock','stock')}${button('Deliveries','deliveries')}${button('Waste','waste')}${button('Incidents','incidents')}</div></div>
      </div>
      <div class="kd-grid kd-section">
        ${bars('Today’s check results',checksBreakdown)}
        ${bars('Waste reasons today',countBy(waste,x=>val(x,['reason','category'],'Unknown')))}
        ${bars('Open incidents by type',countBy(incidents,x=>val(x,['incidentType','type'],'Unknown')))}
      </div>
      <div class="card kd-section"><h2>Today’s operations</h2><div class="kd-list">
        <div class="kd-item"><span>Prep lists</span><b>${prep.length}</b></div>
        <div class="kd-item"><span>Temperature readings</span><b>${todayTemps.length}</b></div>
        <div class="kd-item"><span>HACCP checks</span><b>${todayHaccp.length}</b></div>
        <div class="kd-item"><span>Daily checks</span><b>${daily.length}</b></div>
        <div class="kd-item"><span>Cleaning completions</span><b>${cleaning.length}</b></div>
        <div class="kd-item"><span>Waste records</span><b>${waste.length}</b></div>
      </div>`);
    document.querySelectorAll('[data-kd-route]').forEach(b=>b.onclick=()=>go(b.dataset.kdRoute));
  }
  style();
  VIEWS.dashboard=dashboardView;
  if(typeof VIEWS.home==='function')VIEWS.home=dashboardView;
  if(typeof VIEWS.overview==='function')VIEWS.overview=dashboardView;
  function addNav(){const nav=document.querySelector('nav,#nav,.nav,.sidebar,.side-nav');if(!nav||nav.querySelector('[data-kd-dashboard]'))return;const b=document.createElement('button');b.type='button';b.className='nav-item';b.setAttribute('data-kd-dashboard','1');b.textContent='Dashboard';b.onclick=()=>go('dashboard');nav.prepend(b);}
  setTimeout(addNav,300);setTimeout(addNav,1200);
  window.openKitchenDashboard=()=>go('dashboard');
}
boot();
})();