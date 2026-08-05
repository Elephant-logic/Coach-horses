(function(){
  function boot(){
    if(typeof state==='undefined'||typeof save!=='function'||typeof uid!=='function') return setTimeout(boot,150);
    if(window.__recipeSeedV2Patch) return; window.__recipeSeedV2Patch=true;
    state.settings=state.settings||{}; if(state.settings.recipeSeedV2) return;
    state.recipes=Array.isArray(state.recipes)?state.recipes:[];
    const now=new Date().toISOString(),I=(name,qty,unit)=>({name,qty,unit});
    const R=(name,course,foodCategory,portions,ingredients,method,allergens,cost,sellingPrice)=>({id:uid(),name,course,foodCategory,category:course,portions,ingredients,method,allergens,cost,sellingPrice,createdAt:now,createdBy:'Expanded kitchen library',seededV2:true,needsGeneration:false});
    const rows=[
      R('Ham Hock Terrine','Starter','Meat',10,[I('Ham hock',1.8,'kg'),I('Carrot',250,'g'),I('Onion',250,'g'),I('Celery',150,'g'),I('Parsley',30,'g')],'Simmer hock until tender. Pick meat, reduce liquor, press with herbs, chill and portion.','Celery. VERIFY stock and packaging.',17,8.25),
      R('Crispy Pork Belly Bites','Starter','Meat',10,[I('Pork belly',1.6,'kg'),I('Soy sauce',120,'ml'),I('Honey',100,'g'),I('Ginger',30,'g')],'Slow roast belly, press and chill. Portion, crisp to order and glaze.','Soya. VERIFY all packaging.',18,8.5),
      R('Prawn Cocktail','Starter','Fish',10,[I('Cooked prawns',900,'g'),I('Mayonnaise',450,'g'),I('Ketchup',120,'g'),I('Lemon',3,'each'),I('Little gem',5,'each')],'Mix sauce, fold through prawns, portion over shredded lettuce and garnish.','Crustaceans, egg, mustard. VERIFY packaging.',21,9.25),
      R('Mackerel Pâté','Starter','Fish',10,[I('Smoked mackerel',900,'g'),I('Cream cheese',500,'g'),I('Lemon',3,'each'),I('Horseradish',60,'g')],'Flake fish, blend with cheese, lemon and horseradish, chill and portion.','Fish, milk, mustard. VERIFY packaging.',18,8.75),
      R('Goats Cheese and Beetroot Salad','Starter','Vegetarian',10,[I('Goats cheese',700,'g'),I('Cooked beetroot',1.2,'kg'),I('Leaves',400,'g'),I('Walnuts',180,'g')],'Slice beetroot, toast walnuts, plate leaves and cheese, dress before service.','Milk, nuts. VERIFY dressing.',20,8.95),
      R('Leek and Potato Soup','Starter','Vegetarian',10,[I('Leeks',1.5,'kg'),I('Potatoes',1.4,'kg'),I('Vegetable stock',2.5,'l'),I('Cream',400,'ml')],'Sweat leeks, add potato and stock, simmer, blend and finish with cream.','Milk; possible celery. VERIFY stock.',12,6.95),
      R('Spiced Cauliflower Fritters','Starter','Vegan',10,[I('Cauliflower',1.5,'kg'),I('Gram flour',450,'g'),I('Coriander',30,'g'),I('Curry spice',40,'g')],'Blanch cauliflower, coat in batter, fry until crisp and serve with chutney.','VERIFY spice mix and frying oil.',11,7.5),
      R('Vegan Mushroom Pâté','Starter','Vegan',10,[I('Mushrooms',1.4,'kg'),I('Lentils',500,'g'),I('Onion',300,'g'),I('Thyme',20,'g')],'Cook mushrooms and onions dry, blend with lentils and thyme, chill and portion.','No declared allergens; VERIFY packaging.',12,7.25),
      R('Braised Lamb Shoulder','Main','Meat',10,[I('Lamb shoulder',2.5,'kg'),I('Red wine',500,'ml'),I('Lamb stock',1.5,'l'),I('Carrot',500,'g'),I('Onion',500,'g')],'Brown lamb, braise with wine, stock and vegetables until tender, portion and reduce sauce.','Sulphites; possible celery. VERIFY stock.',39,18.95),
      R('Pork Loin with Cider Sauce','Main','Meat',10,[I('Pork loin portions',10,'each'),I('Cider',500,'ml'),I('Chicken stock',1,'l'),I('Cream',400,'ml'),I('Apples',5,'each')],'Sear and roast pork safely. Reduce cider and stock, add cream and sautéed apple.','Milk, sulphites; possible celery.',31,16.95),
      R('Beef and Ale Suet Pudding','Main','Meat',10,[I('Diced beef',2.2,'kg'),I('Ale',700,'ml'),I('Beef stock',1.2,'l'),I('Suet pastry',1.5,'kg')],'Braise beef filling, cool, line basins with pastry, fill, seal and steam.','Gluten; possible celery. VERIFY ale and pastry.',35,17.5),
      R('Sea Bass with Herb Butter','Main','Fish',10,[I('Sea bass fillets',10,'each'),I('Butter',250,'g'),I('Parsley',30,'g'),I('Lemon',4,'each')],'Pan-sear fish skin-side down, finish safely and serve with lemon herb butter.','Fish, milk.',42,19.95),
      R('Fishermans Pie','Main','Fish',10,[I('Mixed fish',2,'kg'),I('Milk',1.5,'l'),I('Potatoes',3,'kg'),I('Butter',250,'g'),I('Leeks',500,'g')],'Poach fish, make leek sauce, top with mash and bake until piping hot.','Fish, milk; possible crustaceans.',30,15.95),
      R('Vegetable Lasagne','Main','Vegetarian',10,[I('Lasagne sheets',800,'g'),I('Mixed vegetables',2.2,'kg'),I('Tomato sauce',2,'l'),I('Béchamel',1.5,'l'),I('Cheddar',500,'g')],'Layer vegetable sauce, pasta and béchamel, top with cheese and bake.','Gluten, milk. VERIFY sauces.',24,13.95),
      R('Halloumi and Pepper Skewers','Main','Vegetarian',10,[I('Halloumi',1.5,'kg'),I('Peppers',1.5,'kg'),I('Courgettes',1,'kg'),I('Herb oil',200,'ml')],'Thread skewers, marinate, grill until coloured and serve hot.','Milk. VERIFY herb oil.',27,14.5),
      R('Butternut Squash Risotto','Main','Vegetarian',10,[I('Risotto rice',1.1,'kg'),I('Squash',2,'kg'),I('Vegetable stock',3,'l'),I('Parmesan',350,'g'),I('Butter',250,'g')],'Roast squash, cook risotto gradually with stock, fold through squash, butter and parmesan.','Milk; possible celery.',22,13.95),
      R('Lentil Shepherds Pie','Main','Vegan',10,[I('Green lentils',1.2,'kg'),I('Potatoes',3,'kg'),I('Carrots',700,'g'),I('Onions',600,'g'),I('Vegetable stock',2,'l')],'Cook lentil filling, top with olive-oil mash and bake until browned.','Possible celery. VERIFY stock.',16,12.95),
      R('Aubergine and Chickpea Tagine','Main','Vegan',10,[I('Aubergines',2.2,'kg'),I('Chickpeas',1.8,'kg'),I('Tomatoes',2,'kg'),I('Apricots',350,'g'),I('Spices',60,'g')],'Roast aubergine, simmer with chickpeas, tomatoes, fruit and spices until rich.','VERIFY spice mix.',18,13.25),
      R('Lemon Posset','Dessert','Dessert',10,[I('Double cream',1.2,'l'),I('Sugar',300,'g'),I('Lemons',6,'each')],'Boil cream and sugar, add lemon juice, portion and chill until set.','Milk.',11,6.95),
      R('Bread and Butter Pudding','Dessert','Dessert',10,[I('Brioche',1.2,'kg'),I('Milk',1,'l'),I('Cream',500,'ml'),I('Eggs',8,'each'),I('Raisins',300,'g')],'Layer bread and raisins, cover with custard, rest and bake until set.','Gluten, milk, egg.',13,7.25),
      R('Chocolate Orange Mousse','Dessert','Dessert',10,[I('Dark chocolate',600,'g'),I('Cream',800,'ml'),I('Eggs',6,'each'),I('Oranges',4,'each')],'Melt chocolate, fold through whipped cream and egg mixture, portion and chill.','Milk, egg, soya may be present.',18,7.95),
      R('Maple Roasted Root Vegetables','Side','Vegan',10,[I('Carrots',1,'kg'),I('Parsnips',1,'kg'),I('Sweet potato',1,'kg'),I('Maple syrup',120,'ml')],'Cut evenly, toss with oil and maple, roast until caramelised.','No declared allergens; VERIFY oil.',8,4.5),
      R('Buttered Greens','Side','Vegetarian',10,[I('Seasonal greens',2,'kg'),I('Butter',180,'g'),I('Lemon',2,'each')],'Blanch greens, drain well and finish with butter and lemon.','Milk.',9,4.75),
      R('Peppercorn Sauce','Sauce','Other',20,[I('Beef stock',1.5,'l'),I('Cream',600,'ml'),I('Brandy',120,'ml'),I('Peppercorns',50,'g')],'Reduce stock and brandy, add cream and peppercorns, simmer to consistency.','Milk; possible celery.',10,1.25),
      R('Vegan Onion Gravy','Sauce','Vegan',20,[I('Onions',1.2,'kg'),I('Vegetable stock',2,'l'),I('Flour',120,'g'),I('Thyme',20,'g')],'Caramelise onions, add flour and stock, simmer and season.','Gluten; possible celery.',6,0.65)
    ];
    const existing=new Set(state.recipes.map(r=>String(r.name||'').trim().toLowerCase())); let added=0;
    for(const r of rows) if(!existing.has(r.name.toLowerCase())){state.recipes.push(r);added++;}
    state.settings.recipeSeedV2=true; state.settings.recipeSeedV2Count=added;
    if(typeof audit==='function') audit('seed','recipe',{added,library:'expanded recipe library v2'});
    save(); if(typeof render==='function') render(); if(typeof toast==='function'&&added) toast(added+' more recipes added','ok');
  }
  boot();
})();
