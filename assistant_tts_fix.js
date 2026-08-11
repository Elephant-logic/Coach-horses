// Command de Cuisine: reliable text-to-speech for Chef AI chat responses.
(function(){
  'use strict';

  const synth=window.speechSynthesis;
  let lastSpoken='';
  let lastSpokenAt=0;
  let unlocked=false;

  function speechEnabled(){
    return !!(synth&&typeof SpeechSynthesisUtterance!=='undefined'&&STATE&&STATE.settings&&STATE.settings.speak!==false);
  }

  function cleanSpeech(text){
    return String(text||'')
      .replace(/[*_`#>|]/g,' ')
      .replace(/\bhttps?:\/\/\S+/gi,'link')
      .replace(/\s+/g,' ')
      .trim();
  }

  function bestVoice(){
    if(!synth)return null;
    const voices=synth.getVoices?synth.getVoices():[];
    return voices.find(v=>/^en[-_]GB$/i.test(v.lang))||voices.find(v=>/^en[-_]GB/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||null;
  }

  function stopSpeech(){
    try{if(synth)synth.cancel();}catch{}
  }

  function speakChef(text){
    if(!speechEnabled())return;
    const spoken=cleanSpeech(text);
    if(!spoken)return;
    const now=Date.now();
    if(spoken===lastSpoken&&now-lastSpokenAt<1500)return;
    lastSpoken=spoken;lastSpokenAt=now;
    try{
      synth.cancel();
      const u=new SpeechSynthesisUtterance(spoken);
      u.lang='en-GB';u.rate=1;u.pitch=1;u.volume=1;
      const v=bestVoice();if(v)u.voice=v;
      // A short defer avoids Chromium occasionally dropping speech immediately after cancel().
      setTimeout(()=>{if(speechEnabled())synth.speak(u);},40);
    }catch(e){console.warn('Chef speech failed',e);}
  }

  // Some mobile browsers initialise their speech engine only after a user gesture.
  function unlockSpeech(){
    if(unlocked||!speechEnabled())return;
    unlocked=true;
    try{
      const u=new SpeechSynthesisUtterance('\u00a0');
      u.lang='en-GB';u.volume=0.01;u.rate=10;
      synth.speak(u);
      setTimeout(()=>{try{synth.cancel();}catch{}},20);
    }catch{}
  }
  document.addEventListener('pointerdown',unlockSpeech,{once:true,capture:true});
  document.addEventListener('keydown',unlockSpeech,{once:true,capture:true});

  if(typeof chefSay==='function'){
    const baseChefSay=chefSay;
    chefSay=function(text,allowSpeech){
      // Suppress the older speech path so there is only one reliable TTS owner.
      const settings=STATE&&STATE.settings;
      const wanted=!!(settings&&settings.speak!==false);
      if(settings)settings.speak=false;
      let result;
      try{result=baseChefSay.apply(this,arguments);}finally{if(settings)settings.speak=wanted;}
      if(wanted&&allowSpeech!==false)speakChef(text);
      return result;
    };
  }

  // The Assistant view already has a Read answers aloud switch. Make its state immediate:
  // switching OFF cancels any sentence currently being read; switching ON is used by the next reply.
  if(typeof VIEWS!=='undefined'&&typeof VIEWS.assistant==='function'){
    const baseAssistant=VIEWS.assistant;
    VIEWS.assistant=function(v){
      baseAssistant(v);
      setTimeout(()=>{
        const labels=[...v.querySelectorAll('label')];
        const row=labels.find(x=>/Read answers aloud/i.test(x.textContent||''));
        const cb=row&&row.querySelector('input[type="checkbox"]');
        if(!cb||cb.dataset.ttsBound)return;
        cb.dataset.ttsBound='1';
        cb.addEventListener('change',()=>{
          if(!cb.checked){stopSpeech();return;}
          unlockSpeech();
        });
      },0);
    };
  }

  window.ChefTTS={speak:speakChef,stop:stopSpeech,enabled:speechEnabled};
})();
