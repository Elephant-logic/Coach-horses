(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof modal!=='function'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__menuPhotoImportPatchV3) return;
    window.__menuPhotoImportPatchV3=true;

    const isManager=()=>typeof me!=='undefined'&&me&&String(me.role||'').toLowerCase()==='manager';
    const fileToDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});

    window.importMenuPhotos=function(){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      let selected=[];
      modal(`<h2>Import a complete menu</h2>
        <p class="muted">Photograph every page, one at a time, or select several existing photos. All pages are read together as one menu.</p>
        <form id="menuPhotoForm" class="form">
          <label>Menu name<input name="name" placeholder="Coach & Horses main menu" required></label>
          <input id="menuCameraInput" type="file" accept="image/*" capture="environment" hidden>
          <input id="menuGalleryInput" type="file" accept="image/*" multiple hidden>
          <div class="btn-row">
            <button class="btn" id="takeMenuPhoto" type="button">Take menu photo</button>
            <button class="btn ghost" id="chooseMenuPhotos" type="button">Choose photos</button>
          </div>
          <div class="card" style="padding:12px;background:#f7f2df"><b id="menuPhotoCount">0 pages added</b><div id="menuPhotoNames" class="muted" style="margin-top:6px"></div></div>
          <div class="btn-row"><button class="btn ghost" id="addAnotherMenuPhoto" type="button">Take another page</button><button class="btn" id="readAllMenuPhotos" type="submit" disabled>Read all menu pages</button></div>
        </form>`);

      const camera=document.getElementById('menuCameraInput');
      const gallery=document.getElementById('menuGalleryInput');
      const count=document.getElementById('menuPhotoCount');
      const names=document.getElementById('menuPhotoNames');
      const read=document.getElementById('readAllMenuPhotos');

      function addFiles(files){
        for(const f of files){
          const key=[f.name,f.size,f.lastModified].join('|');
          if(!selected.some(x=>[x.name,x.size,x.lastModified].join('|')===key)) selected.push(f);
        }
        count.textContent=selected.length+' page'+(selected.length===1?'':'s')+' added';
        names.textContent=selected.map((f,i)=>(i+1)+'. '+(f.name||'Camera photo')).join(' · ');
        read.disabled=!selected.length;
      }
      camera.onchange=()=>{addFiles([...camera.files]);camera.value='';};
      gallery.onchange=()=>{addFiles([...gallery.files]);gallery.value='';};
      document.getElementById('takeMenuPhoto').onclick=()=>camera.click();
      document.getElementById('addAnotherMenuPhoto').onclick=()=>camera.click();
      document.getElementById('chooseMenuPhotos').onclick=()=>gallery.click();

      document.getElementById('menuPhotoForm').onsubmit=async e=>{
        e.preventDefault();
        const name=String(new FormData(e.target).get('name')||'').trim();
        if(!selected.length) return toast('Take or choose at least one menu page','bad');
        try{
          read.disabled=true;
          toast('Reading '+selected.length+' menu page'+(selected.length===1?'':'s')+'…','ok');
          const images=await Promise.all(selected.map(fileToDataURL));
          const content=[{type:'input_text',text:'Read ALL attached images as pages of ONE commercial kitchen menu. Combine every visible dish from every page. Return ONLY valid JSON with keys menuName, description, dishes. Each dish must include name, category, description, price, allergens, ingredients and method. Ingredients and method may be sensible editable draft estimates when not printed and must be marked for chef verification. Never merge separate dishes.'}]
            .concat(images.map(image_url=>({type:'input_image',image_url})));
          const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content}]})});
          const data=await res.json();
          if(!res.ok) throw new Error(data?.error?.message||'AI menu reading failed');
          let text=data.output_text||'';
          if(!text&&Array.isArray(data.output)) for(const item of data.output) for(const part of (item.content||[])) if(part.text) text+=part.text;
          const match=text.match(/\{[\s\S]*\}/); if(!match) throw new Error('No menu data returned');
          const obj=JSON.parse(match[0]);
          const dishes=Array.isArray(obj.dishes)?obj.dishes:[];
          if(dishes.length<2) throw new Error('Fewer than two dishes were found. Add clearer photos of all menu pages.');
          state.recipes=state.recipes||[]; state.menus=state.menus||[];
          const recipeIds=[];
          for(const d of dishes){
            let r=state.recipes.find(x=>String(x.name||'').trim().toLowerCase()===String(d.name||'').trim().toLowerCase());
            if(!r){
              r={id:uid(),name:d.name||'Untitled dish',category:d.category||'Menu item',course:d.category||'Other',foodCategory:'Other',portions:10,ingredients:Array.isArray(d.ingredients)?d.ingredients.map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:x):[],method:Array.isArray(d.method)?d.method.join('\n'):String(d.method||d.description||''),allergens:Array.isArray(d.allergens)?d.allergens.join(', '):String(d.allergens||'VERIFY'),sellingPrice:Number(d.price||0)||0,cost:0,createdAt:typeof nowISO==='function'?nowISO():new Date().toISOString(),createdBy:me.name,source:'Menu photo import',needsVerification:true};
              state.recipes.push(r);
            }
            recipeIds.push(r.id);
          }
          const menu={id:uid(),name:name||obj.menuName||'Imported menu',description:obj.description||'',recipeIds:[...new Set(recipeIds)],createdAt:typeof nowISO==='function'?nowISO():new Date().toISOString(),createdBy:me.name,source:'Menu photos',pageCount:selected.length};
          state.menus.push(menu);
          if(typeof audit==='function') await audit('create','menu',{id:menu.id,name:menu.name,dishes:menu.recipeIds.length,pages:selected.length,source:'camera-multi-page import'});
          save(); closeModal(); toast('Imported '+menu.recipeIds.length+' editable recipes from '+selected.length+' pages','ok');
          if(typeof render==='function') render();
          if(typeof openPrepLists==='function') setTimeout(openPrepLists,100);
        }catch(err){read.disabled=false;toast(err.message,'bad');}
      };
    };

    const originalMenus=VIEWS.menus;
    if(typeof originalMenus==='function') VIEWS.menus=function(){
      originalMenus();
      const heading=[...document.querySelectorAll('h2,h3')].find(h=>/saved menus/i.test(h.textContent||''));
      if(!heading) return;
      const card=heading.closest('.card')||heading.parentElement;
      if(card.querySelector('[data-import-menu-photos]')) return;
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn sm';btn.dataset.importMenuPhotos='1';btn.textContent='Import menu photos';btn.onclick=window.importMenuPhotos;
      (card.querySelector('.card-head')||heading.parentElement).appendChild(btn);
    };
  }
  boot();
})();