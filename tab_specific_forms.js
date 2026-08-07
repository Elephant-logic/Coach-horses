(function(){
  'use strict';
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof save!=='function')return setTimeout(boot,120);
    if(window.__tabSpecificFormsV1)return;window.__tabSpecificFormsV1=true;

    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const uid=()=>`rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
    const today=()=>new Date().toISOString().slice(0,10);
    const now=()=>new Date().toISOString();
    const who=()=>{try{return me?.name||me?.username||'';}catch(_){return '';}};
    const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
    const responseText=data=>{let out=data?.output_text||'';if(!out&&Array.isArray(data?.output))for(const item of data.output)for(const part of(item.content||[]))if(part.text)out+=part.text;return out;};
    const readFile=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Could not read image'));r.readAsDataURL(file);});

    state.labels=Array.isArray(state.labels)?state.labels:[];
    state.photoRecords=Array.isArray(state.photoRecords)?state.photoRecords:[];

    function printLabel(id){
      const x=state.labels.find(r=>String(r.id)===String(id));if(!x)return;
      const w=window.open('','_blank','width=520,height=620');if(!w)return;
      w.document.write('<!doctype html><html><head><title>Food label</title><style>body{font-family:Arial,sans-serif;padding:28px}h1{font-size:24px;margin:0 0 14px}.box{border:2px solid #111;padding:18px}.row{margin:8px 0}b{display:inline-block;min-width:120px}</style></head><body><div class="box"><h1>'+esc(x.itemName)+'</h1><div class="row"><b>Prepared</b>'+esc(x.prepDate||'')+'</div><div class="row"><b>Use by</b>'+esc(x.useBy||'')+'</div><div class="row"><b>Storage</b>'+esc(x.storage||'')+'</div><div class="row"><b>Allergens</b>'+esc(x.allergens||'None recorded')+'</div><div class="row"><b>Quantity</b>'+esc(x.quantity||'')+' '+esc(x.unit||'')+'</div><div class="row"><b>Prepared by</b>'+esc(x.preparedBy||'')+'</div><div class="row"><b>Batch / notes</b>'+esc(x.batch||'')+'</div></div><script>window.onload=()=>window.print()<\/script></body></html>');w.document.close();
    }

    function labelsView(){
      const rows=state.labels.slice().reverse().slice(0,40).map(x=>`<div class="row"><span></span><div><b>${esc(x.itemName)}</b><br><small>Use by ${esc(x.useBy||'—')} · ${esc(x.storage||'')} · ${esc(x.preparedBy||'')}</small></div><button class="btn sm ghost" data-print-label="${esc(x.id)}">Print</button></div>`).join('');
      page('Labels','Create and reprint kitchen food labels.',`<div class="grid cols-even"><div class="card"><h2>Create food label</h2><form id="specificLabelForm" class="form two"><label class="full">Food / preparation<input name="itemName" required placeholder="e.g. Beef pie filling"></label><label>Prepared date<input name="prepDate" type="date" value="${today()}" required></label><label>Use-by date<input name="useBy" type="date" required></label><label>Quantity<input name="quantity" type="number" min="0" step="0.01"></label><label>Unit<select name="unit"><option>kg</option><option>g</option><option>litres</option><option>ml</option><option>portions</option><option>units</option></select></label><label>Storage<select name="storage"><option>Chilled</option><option>Frozen</option><option>Ambient</option><option>Hot holding</option></select></label><label>Prepared by<input name="preparedBy" value="${esc(who())}" required></label><label class="full">Allergens<input name="allergens" placeholder="e.g. Milk, wheat, mustard"></label><label class="full">Batch / notes<input name="batch" placeholder="Optional batch, tray or prep note"></label><button class="btn full" type="submit">Save & print label</button></form></div><div class="card"><h2>Recent labels</h2><div class="rows">${rows||'<p class="muted">No labels saved yet.</p>'}</div></div></div>`);
      document.getElementById('specificLabelForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const rec={id:uid(),...f,createdAt:now(),createdBy:who()};state.labels.push(rec);await Promise.resolve(save());if(typeof toast==='function')toast('Label saved','ok');printLabel(rec.id);labelsView();};
      document.querySelectorAll('[data-print-label]').forEach(b=>b.onclick=()=>printLabel(b.dataset.printLabel));
    }

    async function analysePhoto(file,purpose,notes,button){
      if(!file)throw new Error('Choose a photo first');
      const image=await readFile(file);
      button.disabled=true;button.textContent='Reading photo…';
      try{
        const instruction=purpose==='menu'?'Read this menu image. List every dish exactly as shown, grouped by course. Do not invent dishes.':purpose==='invoice'?'Read this supplier invoice. Extract supplier, date, invoice/reference number, line items, quantities and totals.':purpose==='delivery'?'Read this delivery or product image. Extract supplier/product, dates, quantities, batch/use-by information and any visible temperatures or condition notes.':'Read this kitchen label or document. Extract all visible text and key fields accurately.';
        const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:instruction+'\nUser notes: '+String(notes||'')},{type:'input_image',image_url:image}]}],max_output_tokens:1200})});
        const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI photo reading failed');
        return responseText(data).trim();
      }finally{button.disabled=false;button.textContent='Read photo with AI';}
    }

    function photosView(){
      const recent=state.photoRecords.slice().reverse().slice(0,20).map(x=>`<div class="row"><span></span><div><b>${esc(x.purpose)}</b><br><small>${new Date(x.createdAt).toLocaleString('en-GB')} · ${esc(x.fileName||'photo')}</small><div style="white-space:pre-wrap;margin-top:5px">${esc(String(x.result||'').slice(0,350))}${String(x.result||'').length>350?'…':''}</div></div></div>`).join('');
      page('Photo & OCR','Use photos for menu reading, invoices, deliveries and kitchen records.',`<div class="grid cols-even"><div class="card"><h2>Read a photo</h2><form id="specificPhotoForm" class="form"><label>What is this photo?<select name="purpose"><option value="menu">Menu</option><option value="invoice">Supplier invoice</option><option value="delivery">Delivery / product</option><option value="label">Food label / kitchen document</option></select></label><label>Photo<input name="photo" type="file" accept="image/*" capture="environment" required></label><label>Notes for the AI<textarea name="notes" placeholder="Optional: what should it concentrate on?"></textarea></label><button class="btn" id="specificPhotoRead" type="submit">Read photo with AI</button></form><div id="specificPhotoResult" class="card mt" style="display:none;white-space:pre-wrap"></div><div class="btn-row mt"><button class="btn ghost" id="specificMenuImporter" type="button">Open full multi-photo menu importer</button></div></div><div class="card"><h2>Recent photo reads</h2><div class="rows">${recent||'<p class="muted">No photo reads saved yet.</p>'}</div></div></div>`);
      document.getElementById('specificPhotoForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),file=fd.get('photo'),purpose=String(fd.get('purpose')||'label'),notes=String(fd.get('notes')||'');const btn=document.getElementById('specificPhotoRead'),out=document.getElementById('specificPhotoResult');try{const result=await analysePhoto(file,purpose,notes,btn);const rec={id:uid(),purpose,fileName:file?.name||'',notes,result,createdAt:now(),createdBy:who()};state.photoRecords.push(rec);await Promise.resolve(save());out.style.display='block';out.textContent=result||'No text returned.';if(typeof toast==='function')toast('Photo read saved','ok');}catch(err){if(typeof toast==='function')toast(err.message,'bad');}};
      document.getElementById('specificMenuImporter').onclick=()=>{if(typeof window.importWorkflowMenuPhotos==='function')window.importWorkflowMenuPhotos();else if(typeof window.openCompleteMenuUpload==='function')window.openCompleteMenuUpload();else if(typeof toast==='function')toast('Menu importer is not available on this build','bad');};
    }

    function probeView(){
      const opts=(Array.isArray(state.appliances)?state.appliances:[]).map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
      page('Probe & sensors','Take a probe reading and save it against the correct kitchen unit.',`<div class="grid cols-even"><div class="card"><h2>Record probe reading</h2><form id="specificProbeForm" class="form two"><label class="full">Unit / appliance<select name="applianceId" required><option value="">Select unit</option>${opts}</select></label><label>Reading °C<input name="value" type="number" step="0.1" required></label><label>Check period<select name="period"><option>AM</option><option>PM</option><option>Spot check</option></select></label><label>Method<select name="method"><option>Bluetooth probe</option><option>Manual probe</option><option>Display reading</option></select></label><label>Time<input name="timeLocal" type="time"></label><label class="full">Corrective action / notes<textarea name="notes" placeholder="Required if the reading is outside limits"></textarea></label><button class="btn full" type="submit">Save reading</button></form><div class="btn-row mt"><button class="btn ghost" id="specificConnectProbe" type="button">Connect Bluetooth probe</button></div></div><div class="card"><h2>Probe setup</h2><p class="muted">Bluetooth UUIDs and the probe asset ID belong in Settings → Probe & sensors. This tab is for taking operational readings.</p><button class="btn ghost" id="specificProbeSettings" type="button">Open probe settings</button></div></div>`);
      document.getElementById('specificProbeForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),a=(state.appliances||[]).find(x=>String(x.id)===String(f.applianceId));if(!a)return;const v=num(f.value),status=typeof statusTemp==='function'?statusTemp(v,a):(v<=num(a.target)?'ok':v<num(a.critical)?'warn':'bad');if(status!=='ok'&&!String(f.notes||'').trim()){if(typeof toast==='function')toast('Enter corrective action for an out-of-range reading','bad');return;}state.checks=Array.isArray(state.checks)?state.checks:[];state.checks.push({id:uid(),date:today(),time:now(),applianceId:a.id,period:f.period,value:v,status,method:f.method,notes:String(f.notes||'').trim(),staff:who(),managerSigned:false});await Promise.resolve(save());if(typeof toast==='function')toast(`${a.name}: ${v}°C saved`,status==='ok'?'ok':'warn');probeView();};
      document.getElementById('specificConnectProbe').onclick=()=>{const candidates=['connectProbe','connectBluetoothProbe','startProbe','startBluetoothProbe'];for(const n of candidates){if(typeof window[n]==='function'){window[n]();return;}}if(typeof toast==='function')toast('Bluetooth connection is not configured on this device; enter the reading manually.','warn');};
      document.getElementById('specificProbeSettings').onclick=()=>{try{route='settings';renderNav();render();}catch(_){}};
    }

    function assistantView(){
      page('Assistant','Ask Kitchen AI about the work in this app.',`<div class="grid cols-even"><div class="card"><h2>Ask Kitchen AI</h2><form id="specificAssistantForm" class="form"><label>Your question<textarea name="question" rows="5" placeholder="e.g. What prep is still outstanding today?" required></textarea></label><button class="btn" id="specificAssistantSend" type="submit">Ask AI</button></form><div id="specificAssistantAnswer" class="card mt" style="display:none;white-space:pre-wrap"></div></div><div class="card"><h2>Useful examples</h2><div class="rows"><div class="row"><span></span><div>What prep is still outstanding?</div></div><div class="row"><span></span><div>Which stock is close to its use-by date?</div></div><div class="row"><span></span><div>Which temperature exceptions still need action?</div></div><div class="row"><span></span><div>Give me a handover summary for the next chef.</div></div></div><p class="muted mt">The floating Ask Kitchen AI button remains available on every signed-in tab for page-specific questions.</p></div></div>`);
      document.getElementById('specificAssistantForm').onsubmit=async e=>{e.preventDefault();const q=String(new FormData(e.target).get('question')||'').trim(),btn=document.getElementById('specificAssistantSend'),out=document.getElementById('specificAssistantAnswer');btn.disabled=true;btn.textContent='Thinking…';try{const snapshot={date:today(),prep:typeof window.getPrepV2Context==='function'?window.getPrepV2Context():null,stock:(state.stock||[]).slice(0,80),openOperations:(state.operations||[]).filter(x=>x.status!=='done').slice(0,40),recentChecks:(state.checks||[]).slice(-60),menus:(state.menus||[]).slice(0,25).map(m=>({name:m.name,recipeIds:m.recipeIds||[]}))};const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:'You are the Kitchen AI inside Coach & Horses Kitchen Pro. Use this app snapshot as the source of truth. Be concise and practical. Do not invent records.\n\nAPP SNAPSHOT:\n'+JSON.stringify(snapshot)+'\n\nUSER QUESTION:\n'+q,max_output_tokens:1000})});const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI request failed');out.style.display='block';out.textContent=responseText(data)||'No answer returned.';}catch(err){out.style.display='block';out.textContent='Could not answer: '+err.message;}finally{btn.disabled=false;btn.textContent='Ask AI';}};
    }

    VIEWS.labels=labelsView;
    VIEWS.photos=photosView;
    VIEWS.probe=probeView;
    VIEWS.assistant=assistantView;
    window.printKitchenLabel=printLabel;
  }
  boot();
})();
