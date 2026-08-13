(function(){
  'use strict';
  if(window.__tempStepperInstalled)return;
  window.__tempStepperInstalled=true;

  const style=document.createElement('style');
  style.textContent='.temp-stepper{display:grid;grid-template-columns:50px minmax(90px,1fr) 50px;gap:8px;align-items:stretch;width:100%}.temp-stepper button{min-height:48px;border-radius:9px;border:1px solid var(--line2);background:var(--panel2);color:var(--ink);font-size:24px;font-weight:700}.temp-stepper input{min-height:48px;text-align:center;font-family:var(--mono);font-size:18px;font-weight:600}.temp-stepper input::-webkit-inner-spin-button,.temp-stepper input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}';
  document.head.appendChild(style);

  function isTemp(input){
    if(!(input instanceof HTMLInputElement)||input.type!=='number'||input.dataset.tempStepper)return false;
    const text=((input.placeholder||'')+' '+(input.name||'')+' '+(input.closest('label')?.innerText||'')).toLowerCase();
    return text.includes('°c')||text.includes('temperature')||text.includes('fridge')||text.includes('freezer')||text.includes('cold room');
  }

  function enhance(input){
    if(!isTemp(input))return;
    input.dataset.tempStepper='1';
    input.step=input.step&&input.step!=='any'?input.step:'0.1';
    const wrap=document.createElement('div');wrap.className='temp-stepper';
    const down=document.createElement('button');down.type='button';down.textContent='−';down.setAttribute('aria-label','Decrease temperature');
    const up=document.createElement('button');up.type='button';up.textContent='+';up.setAttribute('aria-label','Increase temperature');
    input.parentNode.insertBefore(wrap,input);wrap.append(down,input,up);
    const change=dir=>{
      const step=Number(input.step)||0.1;
      let value=Number(input.value);if(!Number.isFinite(value))value=0;
      value+=dir*step;
      if(input.min!==''&&Number.isFinite(Number(input.min)))value=Math.max(Number(input.min),value);
      if(input.max!==''&&Number.isFinite(Number(input.max)))value=Math.min(Number(input.max),value);
      input.value=value.toFixed(1);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    };
    down.onclick=()=>change(-1);up.onclick=()=>change(1);
  }

  function scan(root){if(root.matches&&root.matches('input[type=number]'))enhance(root);root.querySelectorAll&&root.querySelectorAll('input[type=number]').forEach(enhance);}
  scan(document);
  new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)scan(n);}))).observe(document.body,{childList:true,subtree:true});
})();
