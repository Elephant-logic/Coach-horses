(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function'||typeof modal!=='function') return setTimeout(boot,150);
    if(window.__completeMenuPhotoImportV3) return;
    window.__completeMenuPhotoImportV3=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;};
    const now=()=>typeof nowISO==='function'?nowISO():new Date().toISOString();
    const toastSafe=(m,t)=>typeof toast==='function'&&toast(m,t);
    const manager=()=>{try{return typeof me!=='undefined'&&me&&norm(me.role)==='manager';}catch(_){return false;}};
    const fileData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read '+file.name));r.readAsDataURL(file);});
    let busy=false;

    function setStatus(title,detail,kind='working'){
      const box=document.getElementById('completeImportStatus');if(!box)return;
      const icon=kind==='done'?'✓':kind==='error'?'!':'…';
      box.innerHTML='<div class="card" style="padding:14px;background:#f7f2df"><b>'+icon+' '+title+'</b><div class="muted" style="margin-top:6px">'+detail+'</div></div>';
    }
    function extractText(data){let text=data&&data.output_text||'';if(!text&&Array.isArray(data&&data.output))for(const item of data.output)for(const part of(item.content||[]))if(part.text)text+=part.text;return text;}
    function parseJSON(data){const text=extractText(data),match=text.match(/\{[\s\S]*\}/);if(!match)throw new Error('The menu reader returned no usable data');return JSON.parse(match[0]);}
    async function askAI(prompt,content){
      const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content:[{type:'input_text',text:prompt},...(content||[])]}]})});
      const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI request failed');return parseJSON(data);
    }
    function courseOf(d){const c=String(d.course||d.category||'Other').trim(),n=norm(c+' '+(d.name||''));if(/dessert|pudding|sweet|ice cream|sorbet|cheesecake|brownie|tart|crumble/.test(n))return'Dessert';if(/starter|small plate|appetiser|appetizer/.test(n))return'Starter';if(/side|extras?/.test(n))return'Side';if(/main|grill|burger|fish|pie|salad|sandwich/.test(n))return'Main';return c||'Other';}
    function validIngredient(i){return i&&String(i.name||'').trim()&&num(i.qty||i.quantity)>0&&String(i.unit||'').trim();}
    function completeRecipe(r){return Array.isArray(r.ingredients)&&r.ingredients.length>=2&&r.ingredients.every(validIngredient)&&String(r.method||'').trim().length>=20;}

    async function completeRecipes(dishes){
      const completed=[];
      for(let start=0;start<dishes.length;start+=5){
        const batch=dishes.slice(start,start+5);
        setStatus('Creating full recipes','Working out ingredients, quantities and methods for dishes '+(start+1)+'–'+Math.min(start+5,dishes.length)+' of '+dishes.length+'.');
        const prompt='Turn these pub menu dishes into complete editable commercial-kitchen recipes. Return ONLY JSON {"recipes":[...]}. Preserve each dish name exactly. Every recipe must include: name, course, portions (use 10), ingredients as at least 3 objects with name, positive numeric qty and practical unit, method as clear numbered kitchen steps, allergens, and needsVerification true. Use g, kg, ml, l, each, tin, pack or bunch. Use each only for genuinely countable items. Never use vague amounts, never use 1 each for liquids, sauces, dairy, seasoning, rice, pasta, vegetables or meat. Quantities must be internally consistent for 10 portions and suitable for scaling into prep and order lists.';
        const obj=await askAI(prompt+'\n\nDISHES:\n'+JSON.stringify(batch.map(d=>({name:d.name,course:courseOf(d),description:d.description||'',price:d.price||'',allergens:d.allergens||''}))));
        if(!Array.isArray(obj.recipes))throw new Error('No complete recipes returned');
        completed.push(...obj.recipes);
      }
      return dishes.map(d=>{
        const r=completed.find(x=>norm(x.name)===norm(d.name))||d;
        return {...d,...r,name:d.name,course:courseOf(r),category:courseOf(r),portions:Math.max(1,num(r.portions)||10),needsVerification:true};
      });
    }

    function saveImported(obj,menuName,pageCount){
      const dishes=Array.isArray(obj.dishes)?obj.dishes:[];if(!dishes.length)throw new Error('No dishes were found');
      const incomplete=dishes.filter(d=>!completeRecipe(d));if(incomplete.length)throw new Error(incomplete.length+' recipes are still incomplete and were not saved');
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];state.menus=Array.isArray(state.menus)?state.menus:[];
      const recipeIds=[];
      for(const d of dishes){
        let recipe=state.recipes.find(r=>norm(r.name)===norm(d.name));
        const ingredients=d.ingredients.map(i=>({name:String(i.name).trim(),qty:Math.max(0.01,num(i.qty||i.quantity)),unit:String(i.unit).trim()}));
        const method=Array.isArray(d.method)?d.method.join('\n'):String(d.method||'');
        const data={name:String(d.name).trim(),category:courseOf(d),course:courseOf(d),portions:Math.max(1,num(d.portions)||10),ingredients,method,allergens:Array.isArray(d.allergens)?d.allergens.join(', '):String(d.allergens||'VERIFY'),sellingPrice:num(d.price),needsVerification:true,quantitiesReady:true,quantitySource:'AI working recipe from menu photo',source:'Complete menu photo import',updatedAt:now()};
        if(recipe)Object.assign(recipe,data);else{recipe={id:uid(),...data,createdAt:now(),createdBy:(typeof me!=='undefined'&&me&&me.name)||'Manager'};state.recipes.push(recipe);}recipeIds.push(recipe.id);
      }
      const menu={id:uid(),name:menuName||obj.menuName||'Imported menu',description:obj.description||'',recipeIds:[...new Set(recipeIds)],createdAt:now(),createdBy:(typeof me!=='undefined'&&me&&me.name)||'Manager',source:'Complete menu photos',pageCount};state.menus.push(menu);save();return menu;
    }

    window.addEventListener('beforeunload',e=>{if(!busy)return;e.preventDefault();e.returnValue='Menu import is still in progress.';});
    window.importWorkflowMenuPhotos=function(){
      if(!manager())return toastSafe('Manager access required','bad');
      let files=[],parsed=null,menuName='';
      modal(`<h2>Upload the complete menu</h2><p class="muted">Keep this page open until it says the menu and full recipes have been saved.</p><form id="completeMenuPhotoForm" class="form"><label>Menu name<input name="name" required placeholder="Coach menu"></label><input id="completeMenuCamera" type="file" accept="image/*" capture="environment" hidden><input id="completeMenuGallery" type="file" accept="image/*" multiple hidden><div class="btn-row"><button class="btn" id="completeTakePhoto" type="button">Take menu photo</button><button class="btn ghost" id="completeChoosePhotos" type="button">Choose several photos</button></div><div class="card" style="padding:12px;background:#f7f2df"><b id="completePhotoCount">0 pages accepted</b><div id="completePhotoNames" class="muted"></div></div><div id="completeImportStatus"></div><div class="btn-row"><button class="btn ghost" id="completeAnotherPhoto" type="button">Take another page</button><button class="btn" id="completeReadPhotos" type="submit" disabled>Read menu and create recipes</button></div></form><div id="completeMenuReview"></div>`);
      const cam=document.getElementById('completeMenuCamera'),gallery=document.getElementById('completeMenuGallery'),read=document.getElementById('completeReadPhotos');
      const refresh=()=>{document.getElementById('completePhotoCount').textContent=files.length+' page'+(files.length===1?'':'s')+' accepted';document.getElementById('completePhotoNames').textContent=files.map((f,i)=>(i+1)+'. '+f.name).join(' · ');read.disabled=!files.length||busy;if(files.length)setStatus('Photos accepted',files.length+' menu page'+(files.length===1?' is':'s are')+' ready.');};
      const add=list=>{for(const f of list){const k=[f.name,f.size,f.lastModified].join('|');if(!files.some(x=>[x.name,x.size,x.lastModified].join('|')===k))files.push(f);}refresh();};
      cam.onchange=()=>{add([...cam.files]);cam.value='';};gallery.onchange=()=>{add([...gallery.files]);gallery.value='';};document.getElementById('completeTakePhoto').onclick=()=>cam.click();document.getElementById('completeAnotherPhoto').onclick=()=>cam.click();document.getElementById('completeChoosePhotos').onclick=()=>gallery.click();
      document.getElementById('completeMenuPhotoForm').onsubmit=async e=>{
        e.preventDefault();if(!files.length)return toastSafe('Add at least one menu photo','bad');menuName=String(new FormData(e.target).get('name')||'').trim();busy=true;read.disabled=true;
        try{
          setStatus('Preparing photos','Preparing '+files.length+' page'+(files.length===1?'':'s')+'.');const images=await Promise.all(files.map(fileData));
          setStatus('Reading menu','Finding every dish on every uploaded page.');
          const prompt='Read ALL attached images as pages of ONE pub menu. Include every distinct named food item from every page. Desserts may or may not be present. Return ONLY JSON with keys menuName, description, dishes. Each dish must include name, course, description, price and allergens. Never merge separate dishes and never treat headings as dishes.';
          parsed=await askAI(prompt,images.map(image_url=>({type:'input_image',image_url})));
          const detected=Array.isArray(parsed.dishes)?parsed.dishes:[];if(!detected.length)throw new Error('No dishes were detected');
          parsed.dishes=await completeRecipes(detected);
          const incomplete=parsed.dishes.filter(d=>!completeRecipe(d));if(incomplete.length)throw new Error('Could not create complete recipes for '+incomplete.map(x=>x.name).join(', '));
          setStatus('Menu and recipes ready',parsed.dishes.length+' complete recipes now have methods and scalable quantities.','done');
          const rows=parsed.dishes.map(d=>`<div class="row"><span></span><div><b>${String(d.name||'')}</b><br><small>${courseOf(d)} · ${d.ingredients.length} ingredients · full method ready</small></div></div>`).join('');
          document.getElementById('completeMenuReview').innerHTML=`<div class="card mt"><h2>Review complete recipes</h2><p><b>${parsed.dishes.length} dishes</b> are ready to save.</p><div class="rows">${rows}</div><div class="btn-row mt"><button class="btn" id="completeSaveMenu" type="button">Save menu and complete recipes</button></div></div>`;
          document.getElementById('completeSaveMenu').onclick=()=>{try{setStatus('Saving','Saving the menu and every recipe separately.');const menu=saveImported(parsed,menuName,files.length);busy=false;setStatus('Saved successfully',menu.recipeIds.length+' separate complete recipes and the menu were saved.','done');toastSafe('Menu and complete recipes saved','ok');setTimeout(()=>{closeModal();if(typeof VIEWS!=='undefined'&&typeof VIEWS.menus==='function')VIEWS.menus();else if(typeof render==='function')render();},900);}catch(err){busy=false;setStatus('Save failed',err.message,'error');toastSafe(err.message,'bad');}};
        }catch(err){busy=false;read.disabled=false;setStatus('Import failed',err.message+'. Nothing incomplete was saved.','error');toastSafe(err.message,'bad');}
      };
    };

    function addVisibleButtons(){for(const heading of [...document.querySelectorAll('h1,h2,h3')].filter(h=>/menus\s*&\s*recipes|saved menus|menu tools|prep lists|build prep and order/i.test(h.textContent||''))){const card=heading.closest('.card')||heading.parentElement;if(!card||card.querySelector('[data-complete-menu-upload]'))continue;const btn=document.createElement('button');btn.type='button';btn.className='btn';btn.dataset.completeMenuUpload='1';btn.textContent='Upload complete menu photos';btn.onclick=e=>{e.preventDefault();e.stopPropagation();window.importWorkflowMenuPhotos();};(card.querySelector('.card-head')||heading.parentElement).appendChild(btn);}}
    new MutationObserver(addVisibleButtons).observe(document.documentElement,{childList:true,subtree:true});setInterval(addVisibleButtons,700);addVisibleButtons();
  }
  boot();
})();