// Stabilise menu-photo import: stronger cross-page de-duplication and bounded recipe-batch retries.
(function(){
  'use strict';

  const clean=s=>String(s||'').toLowerCase()
    .replace(/&/g,' and ')
    .replace(/\bwith\b/g,' ')
    .replace(/[£$€]\s*\d+(?:[.,]\d+)?/g,' ')
    .replace(/\b(v|vg|ve|gf|df)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim().replace(/\s+/g,' ');

  function tokens(s){return clean(s).split(' ').filter(x=>x.length>1);}
  function sameDish(a,b){
    const ca=clean(a),cb=clean(b);
    if(!ca||!cb)return false;
    if(ca===cb)return true;
    const A=new Set(tokens(a)),B=new Set(tokens(b));
    if(!A.size||!B.size)return false;
    let shared=0;A.forEach(x=>{if(B.has(x))shared++;});
    const overlap=shared/Math.max(A.size,B.size);
    const containment=(ca.includes(cb)||cb.includes(ca))&&Math.min(ca.length,cb.length)>=8;
    return overlap>=0.9||containment;
  }

  function mergeRows(rows){
    const out=[];
    (rows||[]).forEach(d=>{
      if(!d||!String(d.name||'').trim())return;
      const found=out.find(x=>sameDish(x.name,d.name));
      if(!found){out.push(d);return;}
      if(!found.description&&d.description)found.description=d.description;
      if(!found.price&&d.price)found.price=d.price;
      if(!found.allergens&&d.allergens)found.allergens=d.allergens;
      if((found.course==='Other'||found.category==='Other')&&(d.course&&d.course!=='Other')){
        found.course=d.course;found.category=d.category||d.course;
      }
    });
    return out;
  }

  const baseExtract=typeof aiExtractMenu==='function'?aiExtractMenu:null;
  if(baseExtract){
    aiExtractMenu=async function(opts){
      let timeout;
      const bounded=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Menu import timed out')),90000);});
      try{
        const rows=await Promise.race([baseExtract(opts),bounded]);
        clearTimeout(timeout);
        return mergeRows(rows);
      }catch(err){
        clearTimeout(timeout);
        console.warn('Menu import first attempt failed, retrying once',err);
        try{
          if(opts&&typeof opts.onProgress==='function')opts.onProgress({stage:'retry'});
          const rows=await Promise.race([
            baseExtract(opts),
            new Promise((_,reject)=>setTimeout(()=>reject(new Error('Menu import retry timed out')),90000))
          ]);
          return mergeRows(rows);
        }catch(second){
          console.error('Menu import retry failed',second);
          return null;
        }
      }
    };
  }

  const baseCommit=typeof commitImportedMenu==='function'?commitImportedMenu:null;
  if(baseCommit){
    commitImportedMenu=function(name,dishes){
      return baseCommit(name,mergeRows(dishes));
    };
  }
})();
