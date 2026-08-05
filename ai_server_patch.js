(function(){
  const nativeFetch=window.fetch.bind(window);
  let serverAI=true;

  async function jsonSafeResponse(response){
    const text=await response.text();
    try{
      JSON.parse(text);
      return new Response(text,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }catch(_){
      const looksHtml=/^\s*</.test(text)||/<!doctype|<html/i.test(text);
      const message=looksHtml
        ? 'The AI service returned a web page instead of data. Please try again after the server finishes restarting.'
        : 'The AI service returned an unreadable response.';
      return new Response(JSON.stringify({error:{message:message}}),{status:response.ok?502:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }
  }

  async function detect(){
    try{
      const r=await nativeFetch('/api/config',{cache:'no-store',credentials:'same-origin'});
      const c=await r.json();
      serverAI=!!c.aiEnabled;
      window.__serverAIEnabled=serverAI;
      if(serverAI){
        sessionStorage.removeItem('ch_openai_key');
        window.getOpenAIKey=function(){return '__SERVER_STORED_KEY__';};
        window.clearOpenAIKey=function(){
          if(typeof toast==='function') toast('The AI key is stored securely on Render. Nothing is stored on this phone.','ok');
        };
      }
      refreshLabels();
    }catch(e){
      console.warn('AI config check failed',e);
      serverAI=true;
    }
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const isOpenAI=url.indexOf('https://api.openai.com/v1/responses')===0;
    const isProxy=url==='/api/openai/responses'||url.indexOf('/api/openai/responses?')===0;
    if(isOpenAI){
      const opts=Object.assign({},init||{});
      const headers=new Headers(opts.headers||{});
      headers.delete('Authorization');
      headers.set('Content-Type','application/json');
      opts.headers=headers;
      opts.credentials='same-origin';
      const response=await nativeFetch('/api/openai/responses',opts);
      return jsonSafeResponse(response);
    }
    if(isProxy){
      const opts=Object.assign({},init||{});
      opts.credentials='same-origin';
      const response=await nativeFetch(input,opts);
      return jsonSafeResponse(response);
    }
    return nativeFetch(input,init);
  };

  const nativePrompt=window.prompt.bind(window);
  window.prompt=function(message,defaultValue){
    if(serverAI && /OpenAI API key/i.test(String(message||''))) return '__SERVER_STORED_KEY__';
    return nativePrompt(message,defaultValue);
  };

  function refreshLabels(){
    if(!serverAI) return;
    document.querySelectorAll('button').forEach(btn=>{
      const t=(btn.textContent||'').trim();
      if(t==='Connect AI'){
        btn.textContent='AI connected';
        btn.disabled=true;
        btn.title='OpenAI key is stored securely in Render';
      } else if(t==='Clear key'){
        btn.style.display='none';
      }
    });
    document.querySelectorAll('*').forEach(el=>{
      if(el.children.length) return;
      const t=(el.textContent||'').trim();
      if(t==='AI access: API key needed') el.textContent='AI access: connected securely';
      if(t==='AI could not connect: No API key entered. You can still use the rest of the app normally.') el.textContent='AI is connected through the secure server key.';
    });
  }

  const observer=new MutationObserver(refreshLabels);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  detect();
})();