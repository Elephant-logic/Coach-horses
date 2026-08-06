(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function'||typeof modal!=='function') return setTimeout(boot,150);
    if(window.__completeMenuPhotoImportV2) return;
    window.__completeMenuPhotoImportV2=true;

    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;};
    const now=()=>typeof nowISO==='function'?nowISO():new Date().toISOString();
    const toastSafe=(m,t)=>typeof toast==='function'&&toast(m,t);
    const manager=()=>{try{return typeof me!=='undefined'&&me&&norm(me.role)==='manager';}catch(_){return false;}};
    const fileData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read '+file.name));r.readAsDataURL(file);});
    let busy=false;

    function setStatus(title,detail,kind='working'){
      const box=document.getElementById('completeImportStatus');
      if(!box) return;
      const icon=kind==='done'?'✓':kind==='error'?'!':'…';
      box.innerHTML='<div class="card" style="padding:14px;background:#f7f2df"><b>'+icon+' '+title+'</b><div class="muted" style="margin-top:6px">'+detail+'</div></div>';
    }

    function parseOutput(data){
      let text=data&&data.output_text||'';
      if(!text&&Array.isArray(data&&data.output)) for(const item of data.output) for(const part of(item.content||[])) if(part.text) text+=part.text;
      const match=text.match(/\{[\s\S]*\}/);
      if(!match) throw new Error('The menu reader returned no usable menu data');
      return JSON.parse(match[0]);
    }

    function courseOf(d){
      const c=String(d.course||d.category||'Other').trim();
      const n=norm(c+' '+(d.name||''));
      if(/dessert|pudding|sweet|ice cream|sorbet|cheesecake|brownie|tart|crumble/.test(n)) return 'Dessert';
      if(/starter|small plate|appetiser|appetizer/.test(n)) return 'Starter';
      if(/side|extras?/.test(n)) return 'Side';
      if(/main|grill|burger|fish|pie|salad|sandwich/.test(n)) return 'Main';
      return c||'Other';
    }

    function saveImported(obj,menuName,pageCount){
      const dishes=Array.isArray(obj.dishes)?obj.dishes:[];
      if(!dishes.length) throw new Error('No dishes were found in the photos');
      state.recipes=Array.isArray(state.recipes)?state.recipes:[];
      state.menus=Array.isArray(state.menus)?state.menus:[];
      const recipeIds=[];
      for(const d of dishes){
        if(!String(d.name||'').trim()) continue;
        let recipe=state.recipes.find(r=>norm(r.name)===norm(d.name));
        const ingredients=(Array.isArray(d.ingredients)?d.ingredients:[]).map(i=>typeof i==='string'?{name:i,qty:1,unit:'each'}:{name:i.name||'Ingredient',qty:Math.max(0.01,num(i.qty||i.quantity)||1),unit:i.unit||'each'});
        const course=courseOf(d);
        const data={name:String(d.name).trim(),category:course,course,portions:Math.max(1,num(d.portions)||10),ingredients,method:Array.isArray(d.method)?d.method.join('\n'):String(d.method||d.description||''),allergens:Array.isArray(d.allergens)?d.allergens.join(', '):String(d.allergens||'VERIFY'),sellingPrice:num(d.price),needsVerification:true,source:'Complete menu photo import',updatedAt:now()};
        if(recipe) Object.assign(recipe,data); else {recipe={id:uid(),...data,createdAt:now(),createdBy:(typeof me!=='undefined'&&me&&me.name)||'Manager'};state.recipes.push(recipe);}
        recipeIds.push(recipe.id);
      }
      const menu={id:uid(),name:menuName||obj.menuName||'Imported menu',description:obj.description||'',recipeIds:[...new Set(recipeIds)],createdAt:now(),createdBy:(typeof me!=='undefined'&&me&&me.name)||'Manager',source:'Complete menu photos',pageCount};
      state.menus.push(menu);
      save();
      return menu;
    }

    window.addEventListener('beforeunload',e=>{if(!busy)return;e.preventDefault();e.returnValue='Menu reading is still in progress.';});

    window.importWorkflowMenuPhotos=function(){
      if(!manager()) return toastSafe('Manager access required','bad');
      let files=[];
      let parsed=null;
      let menuName='';
      modal(`<h2>Upload the complete menu</h2><p class="muted">Keep this page open until it says the menu has been saved.</p><form id="completeMenuPhotoForm" class="form"><label>Menu name<input name="name" required placeholder="Coach menu"></label><input id="completeMenuCamera" type="file" accept="image/*" capture="environment" hidden><input id="completeMenuGallery" type="file" accept="image/*" multiple hidden><div class="btn-row"><button class="btn" id="completeTakePhoto" type="button">Take menu photo</button><button class="btn ghost" id="completeChoosePhotos" type="button">Choose several photos</button></div><div class="card" style="padding:12px;background:#f7f2df"><b id="completePhotoCount">0 pages accepted</b><div id="completePhotoNames" class="muted" style="margin-top:6px"></div></div><div id="completeImportStatus"></div><div class="btn-row"><button class="btn ghost" id="completeAnotherPhoto" type="button">Take another page</button><button class="btn" id="completeReadPhotos" type="submit" disabled>Read and review all pages</button></div></form><div id="completeMenuReview"></div>`);
      const cam=document.getElementById('completeMenuCamera'),gallery=document.getElementById('completeMenuGallery'),read=document.getElementById('completeReadPhotos');
      const refresh=()=>{document.getElementById('completePhotoCount').textContent=files.length+' page'+(files.length===1?'':'s')+' accepted';document.getElementById('completePhotoNames').textContent=files.map((f,i)=>(i+1)+'. '+f.name).join(' · ');read.disabled=!files.length||busy;if(files.length)setStatus('Photos accepted',files.length+' menu page'+(files.length===1?' is':'s are')+' ready to read.');};
      const add=list=>{for(const f of list){const k=[f.name,f.size,f.lastModified].join('|');if(!files.some(x=>[x.name,x.size,x.lastModified].join('|')===k))files.push(f);}refresh();};
      cam.onchange=()=>{add([...cam.files]);cam.value='';};gallery.onchange=()=>{add([...gallery.files]);gallery.value='';};
      document.getElementById('completeTakePhoto').onclick=()=>cam.click();document.getElementById('completeAnotherPhoto').onclick=()=>cam.click();document.getElementById('completeChoosePhotos').onclick=()=>gallery.click();

      document.getElementById('completeMenuPhotoForm').onsubmit=async e=>{
        e.preventDefault();if(!files.length)return toastSafe('Add at least one menu photo','bad');
        menuName=String(new FormData(e.target).get('name')||'').trim();busy=true;read.disabled=true;
        try{
          setStatus('Preparing photos','Converting '+files.length+' page'+(files.length===1?'':'s')+' for upload. Please keep this page open.');
          const images=await Promise.all(files.map(fileData));
          setStatus('Reading menu','The menu has been accepted and is being analysed. This can take a minute.');
          const prompt='Read ALL attached images as pages of ONE pub menu. Inspect every image independently before combining. Include every distinct named food item from every page. Desserts may or may not be present. Return ONLY valid JSON with keys menuName, description, pageSummaries, sectionsFound, dishes. pageSummaries must contain one entry per uploaded image with pageNumber and visibleSections. dishes must include name, course, category, description, price, allergens, portions, ingredients, method, sourcePage. Use portions 10 unless printed. Estimate editable commercial-kitchen ingredients with positive numeric qty and unit when not printed. Set needsVerification true. Never merge separate dishes and never treat headings as dishes.';
          const content=[{type:'input_text',text:prompt},...images.map(image_url=>({type:'input_image',image_url}))];
          const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content}]})});
          const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'Menu reading failed');
          parsed=parseOutput(data);const dishes=Array.isArray(parsed.dishes)?parsed.dishes:[];if(!dishes.length)throw new Error('No dishes were detected');
          const desserts=dishes.filter(d=>courseOf(d)==='Dessert');const sections=[...new Set(dishes.map(courseOf))];
          setStatus('Menu accepted for review',dishes.length+' dishes found from '+files.length+' page'+(files.length===1?'':'s')+'.','done');
          const warning=desserts.length?'':'<div class="notice"><b>No desserts detected.</b><br>This is only a warning. You can still save the menu.</div>';
          const rows=dishes.map(d=>`<div class="row"><span></span><div><b>${String(d.name||'')}</b><br><small>${courseOf(d)}${d.sourcePage?' · page '+d.sourcePage:''} · editable draft recipe</small></div></div>`).join('');
          document.getElementById('completeMenuReview').innerHTML=`<div class="card mt"><h2>Review detected menu</h2><p><b>${dishes.length} dishes</b> found.</p><p class="muted">Sections: ${sections.join(', ')||'Other'}.</p>${warning}<div class="rows">${rows}</div><div class="btn-row mt"><button class="btn ghost" id="completeAddMissing" type="button">Add another page</button><button class="btn" id="completeSaveMenu" type="button">Save menu and draft recipes</button></div></div>`;
          document.getElementById('completeAddMissing').onclick=()=>cam.click();
          document.getElementById('completeSaveMenu').onclick=()=>{try{setStatus('Saving menu','Creating the saved menu and editable draft recipes.');const menu=saveImported(parsed,menuName,files.length);busy=false;setStatus('Menu saved',menu.recipeIds.length+' dishes and draft recipes were saved successfully.','done');toastSafe('Menu saved successfully','ok');setTimeout(()=>{closeModal();if(typeof VIEWS!=='undefined'&&typeof VIEWS.menus==='function')VIEWS.menus();else if(typeof render==='function')render();},900);}catch(err){busy=false;setStatus('Save failed',err.message,'error');toastSafe(err.message,'bad');}};
        }catch(err){busy=false;read.disabled=false;setStatus('Menu import failed',err.message+'. Your existing menus were not changed.','error');toastSafe(err.message,'bad');}
      };
    };

    function addVisibleButtons(){
      const headings=[...document.querySelectorAll('h1,h2,h3')];
      for(const heading of headings.filter(h=>/menus\s*&\s*recipes|saved menus|menu tools|prep lists|build prep and order/i.test(h.textContent||''))){
        const card=heading.closest('.card')||heading.parentElement;if(!card||card.querySelector('[data-complete-menu-upload]'))continue;
        const btn=document.createElement('button');btn.type='button';btn.className='btn';btn.dataset.completeMenuUpload='1';btn.textContent='Upload complete menu photos';btn.onclick=e=>{e.preventDefault();e.stopPropagation();window.importWorkflowMenuPhotos();};(card.querySelector('.card-head')||heading.parentElement).appendChild(btn);
      }
    }
    new MutationObserver(addVisibleButtons).observe(document.documentElement,{childList:true,subtree:true});setInterval(addVisibleButtons,700);addVisibleButtons();
  }
  boot();
})();