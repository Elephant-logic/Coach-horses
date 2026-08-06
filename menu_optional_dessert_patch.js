(function(){
  function boot(){
    if(window.__menuOptionalDessertPatch) return;
    window.__menuOptionalDessertPatch=true;

    function repairReview(){
      const review=document.getElementById('completeMenuReview');
      if(!review) return;
      const rows=review.querySelectorAll('.row');
      const saveBtn=document.getElementById('completeSaveMenu');
      if(saveBtn&&rows.length){
        saveBtn.disabled=false;
        saveBtn.removeAttribute('disabled');
      }
      review.querySelectorAll('.notice.bad').forEach(n=>{
        if(/no desserts detected/i.test(n.textContent||'')){
          n.classList.remove('bad');
          n.innerHTML='<b>No dessert section detected.</b><br>This is only a check. Save the menu if it has no desserts, or add another photo if a dessert page was missed.';
        }
      });
    }

    new MutationObserver(repairReview).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    setInterval(repairReview,400);
    repairReview();
  }
  boot();
})();