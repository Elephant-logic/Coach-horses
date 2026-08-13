// Command de Cuisine: clean authoritative temperature working view.
// Historic recovery data remains stored but is not used to drive the working screen.
(function(){
  'use strict';
  const LIVE_START='2026-08-13';
  const TRANSITION_FROM='2026-05-01';
  const TRANSITION_TO='2026-08-12';

  function install(){
    if(typeof VIEWS==='undefined'||typeof STATE==='undefined'||typeof el!=='function')return setTimeout(install,150);
    if(window.__temperatureFreshTimelineInstalled)return;
    window.__temperatureFreshTimelineInstalled=true;

    const dateOf=r=>String(r&&r.ts||'').slice(0,10);
    const periodOf=r=>String(r&&r.period||((+(String(r&&r.ts||'').slice(11,13))<12)?'AM':'PM')).toUpperCase();
    const applianceName=id=>{
      const a=(STATE.appliances||[]).find(x=>x&&x.id===id);
      return a&&a.name||'Temperature unit';
    };
    const liveRows=()=> (STATE.tempReadings||[])
      .filter(r=>r&&r.source!=='startup-baseline'&&dateOf(r)>=LIVE_START&&r.value!==null&&r.value!=='')
      .sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')));

    function goLive(){
      try{
        if(typeof nav==='function'){nav('temps');return;}
        if(typeof render==='function'){window.location.hash='#temps';render();return;}
      }catch{}
      window.location.hash='#temps';
    }

    function liveTable(rows){
      if(!rows.length){
        return el('div',{class:'empty'},
          el('h4',{},'No live readings yet'),
          el('div',{},'Start today’s normal temperature checks. New readings from today onward will appear here.')
        );
      }
      const wrap=el('div',{style:'overflow:auto'});
      const table=el('table',{class:'table'});
      const thead=el('thead',{},el('tr',{},
        el('th',{},'Date'),el('th',{},'Round'),el('th',{},'Unit'),el('th',{},'Temperature'),el('th',{},'Recorded by')
      ));
      const tbody=el('tbody',{});
      rows.forEach(r=>tbody.append(el('tr',{},
        el('td',{class:'mono'},dateOf(r)),
        el('td',{},periodOf(r)),
        el('td',{},applianceName(r.appId)),
        el('td',{class:'mono'},String(r.value)+' °C'),
        el('td',{},String(r.by||r.enteredBy||''))
      )));
      table.append(thead,tbody);wrap.append(table);return wrap;
    }

    function freshView(v){
      v.innerHTML='';
      const hero=el('div',{class:'card',style:'margin-bottom:16px;border-color:rgba(198,154,86,.45)'});
      const head=el('div',{class:'card-head'},el('h3',{},'Temperature record'),el('div',{class:'spacer'}));
      head.append(el('span',{class:'chip'},'Fresh timeline'));
      hero.append(head,
        el('p',{class:'muted',style:'margin-top:0'},'The working temperature record has been simplified. Old recovery, reset and import data is no longer used to drive this screen.'),
        el('div',{class:'notice warn'},'1 May 2026 to 12 August 2026 · transition period. No numeric readings are being recreated for this period.'),
        el('div',{class:'notice ok',style:'margin-top:8px'},'13 August 2026 onward · normal live temperature checks.'),
        el('button',{class:'btn primary',style:'margin-top:10px',html:'Start today’s temperature checks',onclick:goLive})
      );
      v.append(hero);

      const live=el('div',{class:'card'});
      const lh=el('div',{class:'card-head'},el('h3',{},'Live readings · from 13 August'),el('div',{class:'spacer'}));
      const rows=liveRows();
      lh.append(el('span',{class:'chip mono'},rows.length+' readings'));
      live.append(lh,liveTable(rows));
      v.append(live);

      const note=el('div',{class:'card',style:'margin-top:16px'});
      note.append(el('div',{class:'card-head'},el('h3',{},'Historic data')),el('p',{class:'muted'},'Older temperature/import/archive records remain stored in the app for audit/recovery purposes, but they are intentionally hidden from this working view so they cannot interfere with today’s checks.'));
      v.append(note);
    }

    VIEWS.temprecords=freshView;
  }
  install();
})();
