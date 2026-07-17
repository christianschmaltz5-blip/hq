// Sidebar drawer toggle for the <=640px breakpoint.
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var btn = document.getElementById('hamburger');
    var backdrop = document.getElementById('sidebarBackdrop');
    if(!btn) return;
    function close(){ document.body.classList.remove('sidebar-open'); }
    btn.addEventListener('click', function(){ document.body.classList.toggle('sidebar-open'); });
    if(backdrop) backdrop.addEventListener('click', close);
    document.querySelectorAll('.sidebar .nav-item').forEach(function(el){
      el.addEventListener('click', close);
    });
  });
})();
