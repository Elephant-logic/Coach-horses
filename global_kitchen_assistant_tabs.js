(function(){
  function loggedIn(){
    try{
      if(typeof me==='undefined'||!me) return false;
      const login=document.getElementById('loginForm');
      if(login){const s=getComputedStyle(login);if(s.display!=='none'&&s.visibility!=='hidden'&&login.offsetParent!==null)return false;}
      return true;
    }catch(_){return false;}
  }
  function pageTitle(){
    const h=document.querySelector('main h1,main h2,#app h1,#app h2');
    return (h&&h.textContent||document.title||'Kitchen app').trim();
  }
  function remove(){document.getElementById('tabKitchenAIButton')?.remove();document.getElementById('tabKitchenAIPanel')?.remove();}
  function install(){
    if(!loggedIn()){remove();return;}
    if(document.getElementById('tabKitchenAIButton'))return;
    const btn=document.createElement('button');btn.id='tabKitchenAIButton';btn.type='button';btn.textContent='Ask Kitchen AI';
    btn.style.cssText='position:fixed;right:16px;bottom:16px;z-index:1200;border:0;border-radius:999px;padding:12px 16px;font-weight:700;box-shadow:0 4px 18px rgba(0,0,0,.25);cursor:pointer';
    btn.onclick=open;
    document.body.appendChild(btn);
  }
  function open(){
    if(!loggedIn())return remove();
    let panel=document.getElementById('tabKitchenAIPanel');if(panel){panel.remove();return;}
    panel=document.createElement('section');panel.id='tabKitchenAIPanel';
    panel.style.cssText='position:fixed;right:16px;bottom:72px;width:min(390px,calc(100vw - 32px));max-height:70vh;z-index:1201;background:white;border:1px solid #ccc;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.28);padding:14px;overflow:auto';
    panel.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>Kitchen AI · '+escapeHtml(pageTitle())+'</b><button type="button" id="tabKitchenAIClose">×</button></div><div id="tabKitchenAIMessages" style="margin:10px 0;max-height:36vh;overflow:auto"><p class="muted">Ask about the page you are on.</p></div><form id="tabKitchenAIForm"><textarea id="tabKitchenAIInput" rows="3" placeholder="What do you need help with?" style="width:100%;box-sizing:border-box"></textarea><button class="btn" type="submit" style="margin-top:8px">Send</button></form>';
    document.body.appendChild(panel);
    panel.querySelector('#tabKitchenAIClose').onclick=()=>panel.remove();
    panel.querySelector('#tabKitchenAIForm').onsubmit=ask;
  }
  function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function ask(e){
    e.preventDefault();const input=document.getElementById('tabKitchenAIInput'),text=String(input?.value||'').trim();if(!text)return;
    const box=document.getElementById('tabKitchenAIMessages');box.insertAdjacentHTML('beforeend','<div style="margin:8px 0"><b>You:</b> '+escapeHtml(text)+'</div>');input.value='';
    const waiting=document.createElement('div');waiting.textContent='AI: Thinking…';box.appendChild(waiting);box.scrollTop=box.scrollHeight;
    try{
      const prompt='You are the kitchen assistant inside the Coach & Horses Kitchen Pro app. Current page: '+pageTitle()+'. Answer the user directly and practically. Do not invent app data you cannot see. User: '+text;
      const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:prompt})});
      const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI request failed');let out=data.output_text||'';if(!out&&Array.isArray(data.output))for(const item of data.output)for(const part of(item.content||[]))if(part.text)out+=part.text;
      waiting.innerHTML='<b>AI:</b> '+escapeHtml(out||'No answer returned.').replace(/\n/g,'<br>');
    }catch(err){waiting.innerHTML='<b>AI:</b> '+escapeHtml(err.message);}
    box.scrollTop=box.scrollHeight;
  }
  setInterval(install,600);new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});install();
})();