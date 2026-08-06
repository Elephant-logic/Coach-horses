(function(){
  function boot(){
    if(window.__globalKitchenAssistantV1) return;
    if(typeof window.fetch!=='function') return setTimeout(boot,200);
    window.__globalKitchenAssistantV1=true;

    const history=[];
    let busy=false;

    function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}
    function responseText(data){
      let out=data&&data.output_text||'';
      if(!out&&Array.isArray(data&&data.output)){
        for(const item of data.output||[]) for(const part of item.content||[]) if(part&&part.text) out+=part.text;
      }
      return String(out||'').trim();
    }
    function pageContext(){
      const title=(document.querySelector('main h1, main h2, #app h1, #app h2, h1')||{}).textContent||document.title||'Kitchen app';
      let summary='';
      try{
        const menus=Array.isArray(window.state&&state.menus)?state.menus.length:0;
        const recipes=Array.isArray(window.state&&state.recipes)?state.recipes.length:0;
        const prep=Array.isArray(window.state&&state.prepPlans)?state.prepPlans.length:0;
        summary='Saved menus: '+menus+'. Saved recipes: '+recipes+'. Saved prep plans: '+prep+'.';
      }catch(_){ }
      return {title:String(title).trim(),summary};
    }
    function ensureUI(){
      if(document.getElementById('globalKitchenAssistant')) return;
      const style=document.createElement('style');
      style.textContent='#globalKitchenAssistantButton{position:fixed;right:18px;bottom:18px;z-index:99990;border:0;border-radius:999px;padding:13px 18px;font-weight:700;box-shadow:0 6px 22px rgba(0,0,0,.25);cursor:pointer}#globalKitchenAssistant{position:fixed;right:14px;bottom:76px;width:min(390px,calc(100vw - 28px));max-height:72vh;z-index:99991;background:#fff;border-radius:14px;box-shadow:0 10px 35px rgba(0,0,0,.32);display:none;overflow:hidden;border:1px solid #ddd}#globalKitchenAssistant.open{display:flex;flex-direction:column}#globalKitchenAssistantHeader{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #ddd}#globalKitchenAssistantMessages{padding:12px;overflow:auto;min-height:180px;max-height:45vh;background:#faf8f1}#globalKitchenAssistantForm{padding:10px;border-top:1px solid #ddd;background:#fff}#globalKitchenAssistantInput{width:100%;min-height:74px;resize:vertical;box-sizing:border-box}#globalKitchenAssistant .gka-msg{padding:9px 10px;margin:7px 0;border-radius:10px;white-space:pre-wrap}#globalKitchenAssistant .gka-user{background:#efe5c8}#globalKitchenAssistant .gka-ai{background:#fff;border:1px solid #e2e2e2}';
      document.head.appendChild(style);
      const button=document.createElement('button');
      button.id='globalKitchenAssistantButton';
      button.className='btn';
      button.type='button';
      button.textContent='Ask Kitchen AI';
      const panel=document.createElement('section');
      panel.id='globalKitchenAssistant';
      panel.innerHTML='<div id="globalKitchenAssistantHeader"><div><b>Kitchen AI assistant</b><div class="muted" id="globalKitchenAssistantPage"></div></div><button type="button" class="btn sm ghost" id="globalKitchenAssistantClose">Close</button></div><div id="globalKitchenAssistantMessages"><div class="gka-msg gka-ai">Ask about the page you are on, recipes, prep, stock, ordering, paperwork, staffing or kitchen ideas.</div></div><form id="globalKitchenAssistantForm"><textarea id="globalKitchenAssistantInput" placeholder="Ask the assistant anything about this page..."></textarea><div class="btn-row" style="margin-top:8px"><button class="btn" type="submit" id="globalKitchenAssistantSend">Send</button><button class="btn ghost" type="button" id="globalKitchenAssistantClear">Clear</button></div></form>';
      document.body.appendChild(button);
      document.body.appendChild(panel);
      button.onclick=()=>{panel.classList.toggle('open');updatePageLabel();if(panel.classList.contains('open'))document.getElementById('globalKitchenAssistantInput').focus();};
      document.getElementById('globalKitchenAssistantClose').onclick=()=>panel.classList.remove('open');
      document.getElementById('globalKitchenAssistantClear').onclick=()=>{history.length=0;document.getElementById('globalKitchenAssistantMessages').innerHTML='<div class="gka-msg gka-ai">Chat cleared. What do you need help with?</div>';};
      document.getElementById('globalKitchenAssistantForm').onsubmit=send;
      updatePageLabel();
    }
    function updatePageLabel(){
      const el=document.getElementById('globalKitchenAssistantPage');
      if(el) el.textContent='Current page: '+pageContext().title;
    }
    function addMessage(role,text){
      const box=document.getElementById('globalKitchenAssistantMessages');
      if(!box)return;
      const div=document.createElement('div');
      div.className='gka-msg '+(role==='user'?'gka-user':'gka-ai');
      div.innerHTML='<b>'+(role==='user'?'You':'AI')+':</b> '+esc(text);
      box.appendChild(div);
      box.scrollTop=box.scrollHeight;
    }
    async function send(e){
      e.preventDefault();
      if(busy)return;
      const input=document.getElementById('globalKitchenAssistantInput');
      const text=String(input&&input.value||'').trim();
      if(!text)return;
      busy=true;input.value='';input.disabled=true;
      const sendBtn=document.getElementById('globalKitchenAssistantSend');if(sendBtn){sendBtn.disabled=true;sendBtn.textContent='Thinking…';}
      addMessage('user',text);history.push({role:'user',content:text});
      const ctx=pageContext();
      const system='You are the practical AI kitchen assistant inside Coach & Horses Kitchen Pro. Help with the current page and the user request. Be concise, operational and specific to a British pub kitchen. Do not invent saved data. Current page: '+ctx.title+'. '+ctx.summary+' You may explain what to do, suggest improvements, diagnose issues, draft kitchen content and help improve recipes. When asked to change app data, explain the exact change but do not claim it has already been saved unless the app explicitly performs that action.';
      try{
        const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',instructions:system,input:history.slice(-12)})});
        const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI request failed');
        const answer=responseText(data)||'No answer was returned.';
        history.push({role:'assistant',content:answer});addMessage('assistant',answer);
      }catch(err){addMessage('assistant','Could not answer: '+err.message);}
      finally{busy=false;input.disabled=false;if(sendBtn){sendBtn.disabled=false;sendBtn.textContent='Send';}input.focus();}
    }

    ensureUI();
    new MutationObserver(()=>{ensureUI();updatePageLabel();}).observe(document.documentElement,{childList:true,subtree:true});
  }
  boot();
})();