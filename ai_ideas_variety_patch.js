(function(){
  function boot(){
    if(window.__aiIdeasVarietyV1) return;
    if(typeof window.fetch!=='function') return setTimeout(boot,150);
    window.__aiIdeasVarietyV1=true;

    const previousFetch=window.fetch.bind(window);

    function textFromContent(content){
      if(typeof content==='string') return content;
      if(!Array.isArray(content)) return '';
      return content.map(part=>{
        if(typeof part==='string') return part;
        return part&&typeof part.text==='string'?part.text:'';
      }).join(' ');
    }

    function latestUserText(input){
      if(typeof input==='string') return input;
      if(!Array.isArray(input)) return '';
      for(let i=input.length-1;i>=0;i--){
        const item=input[i];
        if(!item) continue;
        if(!item.role||String(item.role).toLowerCase()==='user'){
          const text=textFromContent(item.content);
          if(text.trim()) return text.trim();
        }
      }
      return '';
    }

    function isIdeaRequest(text){
      const t=String(text||'').toLowerCase();
      return /\b(idea|ideas|suggest|suggestions|inspiration|dishes|dish ideas|menu ideas)\b/.test(t) &&
             /\b(give|show|list|create|make|suggest|need|want|generate)\b/.test(t);
    }

    function explicitlyScoped(text){
      const t=String(text||'').toLowerCase();
      return /\b(chicken|beef|pork|fish|lamb|vegetarian|vegan)\b/.test(t) &&
             !/\b(no|not|without|exclude|avoid)\s+(any\s+)?(chicken|beef|pork|fish|lamb)\b/.test(t);
    }

    window.fetch=async function(input,init){
      const url=typeof input==='string'?input:(input&&input.url)||'';
      let nextInit=init;
      if(url.includes('/api/openai/responses')&&init&&typeof init.body==='string'){
        try{
          const payload=JSON.parse(init.body);
          const latest=latestUserText(payload.input);
          if(isIdeaRequest(latest)&&!explicitlyScoped(latest)){
            const excludes=[];
            const low=latest.toLowerCase();
            if(/\b(no|not|without|exclude|avoid)\s+(any\s+)?chicken\b/.test(low)) excludes.push('poultry');
            if(/\b(no|not|without|exclude|avoid)\s+(any\s+)?fish\b/.test(low)) excludes.push('seafood');
            const exclusion=excludes.length?' Exclude '+excludes.join(' and ')+'.':'';
            payload.input='Act as a creative British pub chef. Return exactly 8 genuinely different, practical pub dish ideas. Use a different main ingredient or cooking style for every dish. Include a balanced mix of meat, seafood and plant-based choices. Do not repeat one primary ingredient across the list. Do not default to one type of dish. Dish names only, numbered 1 to 8, one per line. No headings, explanations, recipes or questions.'+exclusion;
            payload.instructions='Treat this as a new, stateless request. Ignore previous dish suggestions and maximise variety.';
            nextInit=Object.assign({},init,{body:JSON.stringify(payload)});
          }
        }catch(_){ }
      }
      return previousFetch(input,nextInit);
    };
  }
  boot();
})();
