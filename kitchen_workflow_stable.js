(function(){
  function boot(){
    if(typeof state==='undefined'||typeof VIEWS==='undefined'||typeof page!=='function'||typeof save!=='function'||typeof modal!=='function') return setTimeout(boot,200);
    if(window.__kitchenWorkflowStableV2) return;
    window.__kitchenWorkflowStableV2=true;

    const escv=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
    const norm=v=>String(v||'').trim().toLowerCase();
    const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
    const round=n=>Math.round((Number(n)||0)*100)/100;
    const staff=['Keith Davies','Ian Park','Harry Duckworth'];
    const manager=()=>{try{return !!(me&&norm(me.role)==='manager');}catch(_){return false;}};
    const recipes=()=>Array.isArray(state.recipes)?state.recipes:[];
    const menus=()=>Array.isArray(state.menus)?state.menus:[];
    const recipeFor=id=>recipes().find(r=>String(r.id)===String(id));
    const menuFor=id=>menus().find(m=>String(m.id)===String(id));
    const recipesFor=m=>{const ids=(Array.isArray(m&&m.recipeIds)?m.recipeIds:[]).map(String);return recipes().filter(r=>ids.includes(String(r.id)));};
    const responseText=data=>{let out=data&&data.output_text||'';if(!out&&Array.isArray(data&&data.output))for(const item of data.output)for(const part of(item.content||[]))if(part.text)out+=part.text;return out;};

    async function rebuildFullRecipe(id){
      const r=recipeFor(id);if(!r)return;
      const prompt='Create a complete from-scratch professional British pub kitchen recipe for '+r.name+'. Return ONLY valid JSON with keys name, category, portions, ingredients, method, allergens. Use 10 portions. ingredients must contain at least 5 objects with name, positive numeric qty and practical unit. method must be detailed numbered production steps starting with raw ingredients and covering preparation, cooking, cooling or holding where relevant, finishing and service. Do not give only plating or serving instructions. Do not assume bought-in sauces, fillings or components unless the dish name clearly requires a branded ready-made product. Include how every major component is made.';
      try{
        if(typeof toast==='function')toast('Rebuilding full recipe…','ok');
        const res=await fetch('/api/openai/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',input:prompt})});
        const data=await res.json();if(!res.ok)throw new Error(data?.error?.message||'AI request failed');
        const match=responseText(data).match(/\{[\s\S]*\}/);if(!match)throw new Error('No full recipe returned');
        const obj=JSON.parse(match[0]);
        const ingredients=(Array.isArray(obj.ingredients)?obj.ingredients:[]).map(i=>({name:String(i.name||i.ingredient||'').trim(),qty:Math.max(0.01,num(i.qty??i.quantity)),unit:String(i.unit||'').trim()})).filter(i=>i.name&&i.qty>0&&i.unit);
        const method=Array.isArray(obj.method)?obj.method.join('\n'):String(obj.method||'').trim();
        if(ingredients.length<5||method.length<120)throw new Error('The returned recipe was still incomplete');
        Object.assign(r,{category:obj.category||r.category,course:obj.category||r.course,portions:Math.max(1,num(obj.portions)||10),ingredients,method,allergens:Array.isArray(obj.allergens)?obj.allergens.join(', '):String(obj.allergens||'VERIFY'),needsVerification:true,quantitiesReady:true,recipeDepth:'from-scratch',updatedAt:new Date().toISOString()});
        await Promise.resolve(save());
        if(typeof toast==='function')toast('Full recipe rebuilt','ok');
        renderRecipeView(id);
      }catch(err){if(typeof toast==='function')toast('Recipe rebuild failed: '+err.message,'bad');}
    }

    function renderRecipeView(id){
      const r=recipeFor(id);if(!r)return toast&&toast('Recipe not found','bad');
      const ingredients=(Array.isArray(r.ingredients)?r.ingredients:[]).map(i=>typeof i==='string'?'<li>'+escv(i)+'</li>':'<li>'+escv(i.qty??i.quantity??'')+' '+escv(i.unit||'')+' '+escv(i.name||'Ingredient')+'</li>').join('');
      const method=Array.isArray(r.method)?r.method.join('\n'):String(r.method||'');
      modal('<h2>'+escv(r.name||'Recipe')+'</h2><p class="muted">'+escv(r.course||r.category||'Other')+' · '+Number(r.portions||r.yield||10)+' portions</p><h3>Ingredients</h3><ul>'+(ingredients||'<li>No ingredients entered.</li>')+'</ul><h3>Full method</h3><div style="white-space:pre-wrap">'+escv(method||'No method entered.')+'</div><h3>Allergens</h3><p>'+escv(r.allergens||'Not entered')+'</p><div class="btn-row mt"><button class="btn" id="stableEditRecipe" type="button">Edit recipe</button><button class="btn ghost" id="stableRebuildRecipe" type="button">Rebuild full recipe</button><button class="btn ghost" type="button" onclick="window.print()">Print recipe</button><button class="btn ghost" type="button" onclick="closeModal()">Close</button></div>');
      const edit=document.getElementById('stableEditRecipe');if(edit)edit.onclick=()=>{closeModal();if(typeof window.recipeForm==='function')window.recipeForm(r.id);else if(typeof window.openRecipe==='function')window.openRecipe(r.id);};
      const rebuild=document.getElementById('stableRebuildRecipe');if(rebuild)rebuild.onclick=()=>rebuildFullRecipe(r.id);
    }
    window.viewStoredRecipe=renderRecipeView;
    window.editStoredRecipe=id=>{if(typeof window.recipeForm==='function')window.recipeForm(id);else if(typeof window.openRecipe==='function')window.openRecipe(id);};

    window.openWorkflowMenu=function(id){const m=menuFor(id);if(!m)return;const rows=recipesFor(m).map(r=>'<div class="row"><span></span><div><b>'+escv(r.name||'Recipe')+'</b><br><small>'+escv(r.course||r.category||'Other')+' · '+Number(r.portions||r.yield||10)+' portions</small></div><button class="btn sm" type="button" data-view-recipe="'+escv(r.id)+'">View recipe</button></div>').join('');modal('<h2>'+escv(m.name||'Menu')+'</h2><p class="muted">'+escv(m.description||'')+'</p><div class="rows">'+(rows||'<p>No recipes attached.</p>')+'</div><div class="btn-row mt"><button class="btn ghost" type="button" onclick="window.print()">Print menu recipes</button></div>');document.querySelectorAll('[data-view-recipe]').forEach(b=>b.onclick=()=>renderRecipeView(b.dataset.viewRecipe));};

    window.deleteWorkflowMenu=function(id){if(!manager())return toast&&toast('Manager access required','bad');const m=menuFor(id);if(!m)return;if(!confirm('Delete menu “'+(m.name||'Menu')+'” and its linked recipes?'))return;const removing=(Array.isArray(m.recipeIds)?m.recipeIds:[]).map(String),usedElsewhere=new Set();menus().forEach(x=>{if(String(x.id)!==String(id))(x.recipeIds||[]).forEach(rid=>usedElsewhere.add(String(rid)));});state.menus=menus().filter(x=>String(x.id)!==String(id));state.recipes=recipes().filter(r=>!removing.includes(String(r.id))||usedElsewhere.has(String(r.id)));save();VIEWS.menus();};

    function menusView(){
      const menuRows=menus().map(m=>'<div class="row"><span></span><div><b>'+escv(m.name||'Menu')+'</b><br><small>'+recipesFor(m).length+' recipes</small></div><div class="btn-row"><button class="btn sm" type="button" onclick="openWorkflowMenu(\''+escv(m.id)+'\')">Open</button><button class="btn sm bad" type="button" onclick="deleteWorkflowMenu(\''+escv(m.id)+'\')">Delete</button></div></div>').join('');
      const linked=new Set();menus().forEach(m=>(m.recipeIds||[]).forEach(id=>linked.add(String(id))));
      const recipeRows=recipes().filter(r=>linked.has(String(r.id))).map(r=>'<div class="row"><span></span><div><b>'+escv(r.name||'Recipe')+'</b><br><small>'+escv(r.course||r.category||'Other')+' · '+Number(r.portions||r.yield||10)+' portions</small></div><div class="btn-row"><button class="btn sm" type="button" onclick="viewStoredRecipe(\''+escv(r.id)+'\')">View</button><button class="btn sm ghost" type="button" onclick="editStoredRecipe(\''+escv(r.id)+'\')">Edit</button></div></div>').join('');
      page('Menus & Recipes','Upload menus here. Each linked dish has a separate editable from-scratch recipe.','<div class="card"><div class="card-head"><h2>Menu tools</h2><button class="btn" type="button" onclick="importWorkflowMenuPhotos()">Upload complete menu photos</button></div></div><div class="card mt"><h2>Saved menus</h2><div class="rows">'+(menuRows||'<p class="muted">No menus saved.</p>')+'</div></div><div class="card mt"><h2>Recipe library</h2><div class="rows">'+(recipeRows||'<p class="muted">No recipes saved.</p>')+'</div></div>');
    }

    function calculate(m,covers,stock,assignments){
      const order=new Map(),jobs=[];
      recipesFor(m).forEach(r=>{
        const base=Math.max(1,num(r.portions||r.yield)||10),factor=covers/base,ingredients=Array.isArray(r.ingredients)?r.ingredients:[];
        jobs.push({recipeId:r.id,recipeName:r.name||'Recipe',method:r.method||'',portions:covers,assignedTo:(assignments&&assignments[String(r.id)])||''});
        ingredients.forEach(i=>{if(!i||typeof i==='string'||!i.name)return;const qty=num(i.qty??i.quantity);if(qty<=0)return;const unit=String(i.unit||'').trim();if(!unit)return;const key=norm(i.name)+'|'+norm(unit),row=order.get(key)||{key,name:String(i.name).trim(),unit,required:0};row.required=round(row.required+qty*factor);order.set(key,row);});
      });
      const rows=[...order.values()].map(r=>({...r,inStock:Math.max(0,num(stock&&stock[r.key])),toBuy:round(Math.max(0,r.required-Math.max(0,num(stock&&stock[r.key]))))}));return {jobs,order:rows};
    }

    function prepView(){const opts=menus().map(m=>'<option value="'+escv(m.id)+'">'+escv(m.name||'Menu')+' ('+recipesFor(m).length+' recipes)</option>').join('');page('Prep Lists','Select a saved menu, enter covers, assign each job, then compare required ingredients with stock.','<div class="card"><h2>Build prep and order</h2><div class="form"><label>Saved menu<select id="stablePrepMenu"><option value="">Select menu</option>'+opts+'</select></label><label>Projected covers<input id="stablePrepCovers" type="number" min="1" value="40"></label><button class="btn" id="stableBuildPrep" type="button">Build prep list</button></div></div><div id="stablePrepOutput"></div>');const b=document.getElementById('stableBuildPrep');if(b)b.onclick=buildPrep;}

    function buildPrep(){
      try{
        const m=menuFor(document.getElementById('stablePrepMenu').value);if(!m)return toast&&toast('Select a saved menu','bad');
        const covers=Math.max(1,Math.round(num(document.getElementById('stablePrepCovers').value)||1)),result=calculate(m,covers,{},{});if(!result.jobs.length)return toast&&toast('This menu has no recipes','bad');
        const staffOptions='<option value="">Unassigned</option>'+staff.map(s=>'<option value="'+escv(s)+'">'+escv(s)+'</option>').join('');
        const jobs=result.jobs.map(j=>'<div class="row"><span></span><div><b>'+escv(j.recipeName)+'</b><br><small>'+covers+' portions</small></div><label>Assigned to<select data-assignment="'+escv(j.recipeId)+'">'+staffOptions+'</select></label></div>').join('');
        const order=result.order.map(r=>'<div class="row"><span></span><div><b>'+escv(r.name)+'</b><br><small>Required: '+r.required+' '+escv(r.unit)+'</small></div><label style="min-width:120px">In stock<input type="number" min="0" step="0.01" data-stock-key="'+escv(r.key)+'" value="0"></label><b data-buy-key="'+escv(r.key)+'">Order '+r.toBuy+' '+escv(r.unit)+'</b></div>').join('');
        document.getElementById('stablePrepOutput').innerHTML='<div class="card mt"><div class="card-head"><h2>Prep jobs</h2><button class="btn ghost" type="button" id="stablePrintPrep">Print prep & order</button></div><div class="rows">'+jobs+'</div></div><div class="card mt"><h2>Order list</h2><div class="rows">'+order+'</div></div>';
        const recalc=()=>{const stock={},assignments={};document.querySelectorAll('[data-stock-key]').forEach(x=>stock[x.dataset.stockKey]=x.value);document.querySelectorAll('[data-assignment]').forEach(x=>assignments[x.dataset.assignment]=x.value);calculate(m,covers,stock,assignments).order.forEach(r=>{const el=document.querySelector('[data-buy-key="'+CSS.escape(r.key)+'"]');if(el)el.textContent='Order '+r.toBuy+' '+r.unit;});};
        document.querySelectorAll('[data-stock-key],[data-assignment]').forEach(inp=>inp.oninput=recalc);
        const print=document.getElementById('stablePrintPrep');if(print)print.onclick=()=>window.print();
      }catch(err){console.error(err);toast&&toast('Prep could not be opened: '+(err.message||err),'bad');}
    }

    VIEWS.menus=menusView;VIEWS.prep=prepView;VIEWS.prepLists=prepView;
  }
  boot();
})();