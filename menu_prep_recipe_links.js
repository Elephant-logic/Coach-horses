// Command de Cuisine: expose the recipe links already present in menu and prep data.
(function(){
  'use strict';

  const norm=s=>String(s||'').trim().toLowerCase().replace(/^prep\s*[—–-]\s*/i,'').replace(/\s+/g,' ');
  const recipeById=id=>(STATE.recipes||[]).find(r=>r.id===id)||null;
  const recipeForPrep=p=>{
    if(!p)return null;
    const linked=p.recipeId&&recipeById(p.recipeId);
    if(linked)return linked;
    const name=norm(p.item);
    return (STATE.recipes||[]).find(r=>norm(r.name)===name)||null;
  };
  const ingredientName=ing=>{
    const s=ing&&ing.stockId&&typeof stockById==='function'?stockById(ing.stockId):null;
    return (s&&s.item)||(ing&&ing.name)||'Ingredient';
  };
  const ingredientLine=ing=>{
    const bits=[ingredientName(ing)];
    const qty=ing&&ing.qty!=null?String(ing.qty):'';
    const unit=(ing&&ing.unit)||'';
    if(qty)bits.push('— '+qty+(unit?' '+unit:''));
    if(ing&&ing.preparation)bits.push('· '+ing.preparation);
    return bits.join(' ');
  };

  function recipeDisplay(r,task){
    const box=el('div',{class:'card',style:'margin-top:10px;background:var(--bg2);border-color:var(--line)'});
    const head=el('div',{class:'card-head'});
    head.append(el('div',{},
      el('div',{class:'eyebrow'},task?'Prep recipe':'Recipe'),
      el('h3',{style:'margin:2px 0 0'},r.name)),
      el('div',{class:'spacer'}));
    if(r.needsReview)head.append(el('span',{class:'tag warn'},'Draft — review'));
    head.append(el('button',{class:'btn ghost sm',html:icon('recipes')+'Open recipe',onclick:()=>editRecipe(r)}));
    box.append(head);
    if(task)box.append(el('div',{class:'muted',style:'font-size:12px;margin:-4px 0 10px'},task.item+' · '+task.done+' / '+task.par+' done'));
    if(r.description)box.append(el('div',{style:'font-size:13px;margin-bottom:10px'},r.description));
    if(r.allergens)box.append(el('div',{style:'margin-bottom:10px'},el('span',{class:'eyebrow'},'Allergens: '),el('span',{class:'tag warn'},r.allergens)));
    const grid=el('div',{class:'grid g2'});
    const ing=el('div',{});
    ing.append(el('div',{class:'eyebrow',style:'margin-bottom:6px'},'Ingredients'));
    const ingredients=r.ingredients||[];
    if(ingredients.length){
      ingredients.forEach(i=>ing.append(el('div',{class:'docket',style:'padding:7px 9px;margin-bottom:5px'},el('div',{class:'dk-t',style:'font-size:12.5px'},ingredientLine(i)))));
    }else ing.append(el('div',{class:'muted',style:'font-size:12.5px'},'No ingredients entered yet.'));
    const method=el('div',{});
    method.append(el('div',{class:'eyebrow',style:'margin-bottom:6px'},'Method'));
    method.append(el('div',{style:'white-space:pre-wrap;font-size:12.5px;line-height:1.55'},String(r.method||'No method entered yet.')));
    grid.append(ing,method);box.append(grid);
    return box;
  }

  if(typeof VIEWS==='undefined')return;

  const baseMenus=VIEWS.menus;
  VIEWS.menus=function(v){
    baseMenus(v);
    const recipes=(STATE.recipes||[]).slice().sort((a,b)=>String(b.name||'').length-String(a.name||'').length);
    [...v.querySelectorAll('.docket')].forEach(row=>{
      if(row.dataset.recipeLinkAdded)return;
      const title=row.querySelector('.dk-t');
      if(!title)return;
      const text=String(title.textContent||'').trim();
      const r=recipes.find(x=>text===x.name||text.startsWith(x.name+' '));
      if(!r)return;
      const btn=el('button',{class:'btn ghost sm',style:'margin-left:6px',html:icon('recipes')+'Recipe',title:'Open '+r.name+' recipe',onclick:e=>{e.stopPropagation();editRecipe(r);}});
      const remove=row.querySelector('button.x');
      if(remove)row.insertBefore(btn,remove);else row.append(btn);
      row.dataset.recipeLinkAdded='1';
    });
  };

  const basePrep=VIEWS.prep;
  VIEWS.prep=function(v){
    basePrep(v);
    let tasks=(STATE.prepLists||[]);
    if(typeof prepMineOnly!=='undefined'&&prepMineOnly)tasks=tasks.filter(p=>p.assignee===ME.username);
    const linked=tasks.map(p=>({task:p,recipe:recipeForPrep(p)})).filter(x=>x.recipe);
    const unlinked=tasks.filter(p=>!recipeForPrep(p));
    if(!linked.length&&!unlinked.length)return;

    const card=el('div',{class:'card',style:'margin-top:16px'});
    card.append(el('div',{class:'card-head'},el('h3',{},"Today's prep recipes"),el('div',{class:'spacer'}),el('span',{class:'chip mono'},linked.length+' linked')),
      el('div',{class:'muted',style:'font-size:12.5px;margin-top:-5px;margin-bottom:8px'},'Recipes linked from the menu/prep task are shown here so the chef can work from the specification without leaving Prep.'));
    linked.forEach(x=>card.append(recipeDisplay(x.recipe,x.task)));

    if(unlinked.length){
      const linkBox=el('div',{style:'margin-top:14px'});
      linkBox.append(el('div',{class:'eyebrow',style:'margin-bottom:7px'},'Prep items without a recipe link'));
      unlinked.forEach(p=>{
        const row=el('div',{class:'docket',style:'margin-bottom:6px;align-items:center'});
        const pick=el('select',{class:'inp',style:'max-width:230px'});
        pick.append(el('option',{value:''},'Link a recipe…'));
        (STATE.recipes||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach(r=>pick.append(el('option',{value:r.id},r.name)));
        pick.addEventListener('change',()=>{
          if(!pick.value)return;
          p.recipeId=pick.value;
          p.consumed=false;
          save('link prep recipe');
          audit('link_prep_recipe',p.item+' → '+(recipeById(pick.value)?.name||pick.value));
          rerender();
        });
        row.append(el('div',{style:'flex:1'},el('div',{class:'dk-t'},p.item),el('div',{class:'dk-s'},'No recipe currently linked')),pick);
        linkBox.append(row);
      });
      card.append(linkBox);
    }
    v.append(card);
  };
})();
