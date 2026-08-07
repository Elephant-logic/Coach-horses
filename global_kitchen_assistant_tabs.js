(function(){
  'use strict';
  if(window.__globalKitchenAssistantV2) return;
  window.__globalKitchenAssistantV2=true;
  const history=[];

  function loggedIn(){
    try{
      if(typeof me==='undefined'||!me) return false;
      const app=document.getElementById('app');if(app&&app.classList.contains('hidden'))return false;
      const login=document.getElementById('login');if(login&&!login.classList.contains('hidden')&&login.offsetParent!==null)return false;
      return true;
    }catch(_){return false;}
  }
  function routeName(){try{return typeof route!=='undefined'?String(route):'';}catch(_){return '';}}
  function pageTitle(){const h=document.querySelector('#pageTitle,main h1,main h2,#app h1,#app h2');return (h&&h.textContent||document.title||'Kitchen app').trim();}
  function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function stripState(){
    if(typeof state==='undefined'||!state)return {};
    const r=routeName();
    const out={route:r,page:pageTitle()};
    if(typeof window.getPrepV2Context==='function'&&(r==='prep'||r==='preplists'))out.prep=window.getPrepV2Context();
    if(r==='menus'){
      out.menus=(Array.isArray(state.menus)?state.menus:[]).slice(0,20).map(m=>({id:m.id,name:m.name,description:m.description||'',recipeIds:Array.isArray(m.recipeIds)?m.recipeIds:[]}));
      out.recipes=(Array.isArray(state.recipes)?state.recipes:[]).slice(0,40).map(x=>({id:x.id,name:x.name,category:x.category||x.course||'',portions:x.portions||x.yield||10,allergens:x.allergens||''}));
    }
    if(r==='stock')out.stock=(Array.isArray(state.stock)?state.stock:[]).slice(0,60).map(s=>({name:s.name,qty:s.qty,unit:s.unit,useBy:s.useBy||'',supplier:s.supplier||'',allergens:s.allergens||''}));
    if(r==='temps'||r==='checks'){
      const day=new Date().toISOString().slice(0,10);out.todayChecks=(Array.isArray(state.checks)?state.checks:[]).filter(x=>x.date===day).slice(-40).map(x=>({applianceId:x.applianceId,period:x.period,value:x.value,status:x.status,notes:x.notes||'',staff:x.staff||''}));
    }
    if(r==='operations')out.operations=(Array.isArray(state.operations)?state.operations:[]).filter(x=>x.status!=='done').slice(0,30).map(x=>({title:x.title||x.f?.title||'',status:x.status,dueDate:x.dueDate||x.f?.dueDate||'',assignedTo:x.assignedTo||x.f?.assignedTo||''}));
    const modal=document.getElementById('modalWrap');if(modal&&!modal.classList.contains('hidden')){const txt=document.getElementById('modal')?.innerText||'';out.openDialog=txt.slice(0,6000);}
    return out;
  }
  function remove(){document.getElementById('tabKitchenAIButton')?.remove();document.getElementById('tabKitchenAIPanel')?.remove();}
  function install(){
    if(!loggedIn()){remove();return;}
    if(document.getElementById('tabKitchenAIButton'))return;
    const btn=document.createElement('button');btn.id='tabKitchenAIButton';btn.type='button';btn.textContent='Ask Kitchen AI';btn.setAttribute('aria-label','Open Kitchen AI');
    btn.style.cssText='position:fixed;right:16px;bottom:16px;z-index:1200;border:0;border-radius:999px;padding:12px 16px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,.25);cursor:pointer';
    btn.onclick=open;document.body.appendChild(btn);
  }
  function renderHistory(box){
    box.innerHTML=history.length?history.map(m=>'<div style="margin:8px 0;padding:8px 10px;border-radius:9px;background:'+(m.role==='user'?'#f1ead5':'#f7f7f7')+'"><b>'+(m.role==='user'?'You':'AI')+':</b> '+esc(m.text).replace(/\n/g,'<br>')+'</div>').join(''):'<p class="muted">Ask about the page you are on. On Prep you can also say “assign fish pie to Ian” or “mark gravy complete”.</p>';
    box.scrollTop=box.scrollHeight;
  }
  function open(){
    if(!loggedIn())return remove();
    let panel=document.getElementById('tabKitchenAIPanel');if(panel){panel.remove();return;}
    panel=document.createElement('section');panel.id='tabKitchenAIPanel';panel.style.cssText='position:fixed;right:16px;bottom:72px;width:min(410px,calc(100vw - 32px));max-height:72vh;z-index:1201;background:white;border:1px solid #ccc;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);padding:14px;overflow:auto';
    panel.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>Kitchen AI · '+esc(pageTitle())+'</b><button type="button" id="tabKitchenAIClose">×</button></div><div id="tabKitchenAIMessages" style="margin:10px 0;max-height:40vh;overflow:auto"></div><form id="tabKitchenAIForm"><textarea id="tabKitchenAIInput" rows="3" placeholder="Ask about this page or tell me what to change…" style="width:100%;box-sizing:border-box"></textarea><button class="btn" type="submit" style="margin-top:8px">Send</button></form>';
    document.body.appendChild(panel);renderHistory(panel.querySelector('#tabKitchenAIMessages'));
    panel.querySelector('#tabKitchenAIClose').onclick=()=>panel.remove();panel.querySelector('#tabKitchenAIForm').onsubmit=ask;
  }
  async function tryLocalAction(text){
    if(typeof window.applyPrepAICommand==='function'&&(routeName()==='prep'||routeName()==='preplists')){const result=await window.applyPrepAICommand(text);if(result)return result;}
    const recipeForm=document.getElementById('stableRecipeChatForm'),recipeInput=document.getElementById('stableRecipeChatInput');
    if(recipeForm&&recipeInput&&/\b(make|improve|change|adjust|rewrite|reduce|increase|remove|add|gluten|vegan|vegetarian|cheaper|better|detailed|scratch)\b/i.test(text)){
      recipeInput.value=text;recipeForm.requestSubmit();return 'I sent that change to the recipe AI. It will update and save the recipe when the new version is ready.';
    }
    return null;
  }
  async function ask(e){
    e.preventDefault();const input=document.getElementById('tabKitchenAIInput'),text=String(input?.value||'').trim();if(!text)return;input.value='';history.push({role:'user',text});
    const box=document.getElementById('tabKitchenAIMessages');renderHistory(box);
    const local=await tryLocalAction(text);if(local){history.push({role:'assistant',text:local});renderHistory(box);return;}
    const waiting={role:'assistant',text:'Thinking…'};history.push(waiting);renderHistory(box);
    try{
      const context=stripState();
      const prompt='You are the Kitchen AI inside Coach & Horses Kitchen Pro. Use the supplied CURRENT APP CONTEXT as the source of truth. Do not invent quantities, stock, assignments, completion or records not in the context. Be concise and practical for a working pub kitchen. If the user asks for an app change that you cannot safely perform, say what should be changed rather than claiming you changed it.\n\nCURRENT APP CONTEXT:\n'+JSON.stringify(context)+'\n\nRECENT CHAT:\n'+JSON.stringify(history.slice(-8,-1))+'\n\nUSER:\n'+text;
      const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:prompt,max_output_tokens:900})});
      const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI request failed');let out=data.output_text||'';if(!out&&Array.isArray(data.output))for(const item of data.output)for(const part of(item.content||[]))if(part.text)out+=part.text;
      waiting.text=out||'No answer returned.';
    }catch(err){waiting.text='Could not answer: '+err.message;}
    renderHistory(box);
  }
  setInterval(install,800);new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});install();
})();
