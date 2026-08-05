(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof modal!=='function'||typeof save!=='function') return setTimeout(boot,150);
    if(window.__menuPhotoImportPatch) return;
    window.__menuPhotoImportPatch=true;

    const escv=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const isManager=()=>typeof me!=='undefined'&&me&&me.role==='manager';

    async function fileToDataURL(file){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}

    window.importMenuPhotos=function(){
      if(!isManager()) return typeof toast==='function'&&toast('Manager access required','bad');
      modal(`<h2>Import your menu from photos</h2>
        <p class="muted">Take or choose photos of every menu page — front, back, desserts, children’s menu and specials. The AI will extract the dishes, create draft recipes and group them into one menu.</p>
        <form id="menuPhotoForm" class="form">
          <label>Menu name<input name="name" placeholder="Coach & Horses main menu" required></label>
          <label>Menu photos<input id="menuPhotoFiles" type="file" accept="image/*" capture="environment" multiple required></label>
          <small class="muted">You can select several photos at once. Add at least two dishes before saving as a menu.</small>
          <button class="btn" type="submit">Read menu photos</button>
        </form>`);
      document.getElementById('menuPhotoForm').onsubmit=async e=>{
        e.preventDefault();
        const files=[...document.getElementById('menuPhotoFiles').files];
        const name=new FormData(e.target).get('name').trim();
        if(!files.length) return toast('Choose at least one menu photo','bad');
        try{
          toast('Reading menu pages…','ok');
          const images=await Promise.all(files.map(fileToDataURL));
          const content=[{type:'input_text',text:'Read all attached menu pages as one commercial kitchen menu. Return ONLY valid JSON with keys menuName, description, dishes. dishes must be an array of at least all visible dishes, each with name, category, description, price, allergens, ingredients, method. Ingredients and method may be sensible draft estimates when not printed, and must be marked for chef verification. Do not combine separate dishes.'}]
            .concat(images.map(image_url=>({type:'input_image',image_url})));
          const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:[{role:'user',content}]})});
          const data=await res.json();
          if(!res.ok) throw new Error(data?.error?.message||'AI menu reading failed');
          let text=data.output_text||'';
          if(!text&&Array.isArray(data.output)) for(const item of data.output) for(const part of (item.content||[])) if(part.text) text+=part.text;
          const match=text.match(/\{[\s\S]*\}/); if(!match) throw new Error('No menu data returned');
          const obj=JSON.parse(match[0]);
          const dishes=Array.isArray(obj.dishes)?obj.dishes:[];
          if(dishes.length<2) throw new Error('Only one dish was found. A menu needs at least two dishes. Add more menu pages or save that item as a recipe.');
          state.recipes=state.recipes||[]; state.menus=state.menus||[];
          const recipeIds=[];
          for(const d of dishes){
            let r=state.recipes.find(x=>String(x.name||'').toLowerCase()===String(d.name||'').toLowerCase());
            if(!r){
              r={id:uid(),name:d.name||'Untitled dish',category:d.category||'Menu item',portions:10,ingredients:Array.isArray(d.ingredients)?d.ingredients.map(x=>typeof x==='string'?{name:x,qty:'',unit:''}:x):[],method:Array.isArray(d.method)?d.method.join('\n'):String(d.method||d.description||''),allergens:Array.isArray(d.allergens)?d.allergens.join(', '):String(d.allergens||'VERIFY'),sellingPrice:Number(d.price||0)||0,cost:0,createdAt:nowISO(),createdBy:me.name,source:'Menu photo import',needsVerification:true};
              state.recipes.push(r);
            }
            recipeIds.push(r.id);
          }
          const menu={id:uid(),name:name||obj.menuName||'Imported menu',description:obj.description||'',recipeIds,createdAt:nowISO(),createdBy:me.name,source:'Menu photos',pageCount:files.length};
          state.menus.push(menu);
          if(typeof audit==='function') await audit('create','menu',{id:menu.id,name:menu.name,dishes:recipeIds.length,pages:files.length,source:'photo import'});
          save(); closeModal(); toast(`Imported ${recipeIds.length} dishes into ${menu.name}`,'ok'); render();
        }catch(err){toast(err.message,'bad');}
      };
    };

    const originalMenus=VIEWS.menus;
    VIEWS.menus=function(){
      originalMenus();
      const heading=[...document.querySelectorAll('h2,h3')].find(h=>/saved menus/i.test(h.textContent||''));
      if(!heading) return;
      const card=heading.closest('.card')||heading.parentElement;
      if(card.querySelector('[data-import-menu-photos]')) return;
      const btn=document.createElement('button');
      btn.type='button';btn.className='btn sm';btn.dataset.importMenuPhotos='1';btn.textContent='Import menu photos';btn.onclick=window.importMenuPhotos;
      const head=card.querySelector('.card-head')||heading.parentElement;
      head.appendChild(btn);
    };
  }
  boot();
})();