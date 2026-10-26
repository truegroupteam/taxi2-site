(function(){
  // Reveal on scroll
  var els=document.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')})}
  else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});els.forEach(function(e){io.observe(e)})}

  // Mobile menu
  var b=document.getElementById('burger'),dr=document.getElementById('drawer');
  if(b&&dr){
    b.addEventListener('click',function(){var o=dr.classList.toggle('open');b.setAttribute('aria-expanded',o)});
    dr.addEventListener('click',function(e){if(e.target.closest('a')){dr.classList.remove('open');b.setAttribute('aria-expanded','false')}});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'){dr.classList.remove('open');b.setAttribute('aria-expanded','false')}});
  }

  // Sticky "Кандидатствай" on phones: shown after the hero, hidden while a form is on screen.
  var s=document.getElementById('sticky'),hero=document.querySelector('.hero,.phero'),form=document.querySelector('.form');
  if(s&&hero&&'IntersectionObserver' in window){
    var past=false,atForm=false;function up(){s.classList.toggle('show',past&&!atForm)}
    new IntersectionObserver(function(e){past=!e[0].isIntersecting&&e[0].boundingClientRect.top<0;up()}).observe(hero);
    if(form)new IntersectionObserver(function(e){atForm=e[0].isIntersecting;up()},{threshold:.05}).observe(form);
  }

  // Forms: driver application (/api/apply) and contact/waitlist (/api/contact)
  document.querySelectorAll('form[data-endpoint]').forEach(function(fm){
    var msg=fm.querySelector('.form-msg'),done=document.getElementById(fm.getAttribute('data-done'));
    fm.addEventListener('submit',function(e){
      e.preventDefault();
      msg.className='form-msg';msg.textContent='';
      var d=new FormData(fm),body={};d.forEach(function(v,k){body[k]=typeof v==='string'?v.trim():v});
      var phoneDigits=(body.phone||'').replace(/\D/g,'');
      if(fm.name&&fm.name.required&&(body.name||'').length<2){msg.className='form-msg bad';msg.textContent='Въведи име.';fm.name.focus();return}
      if(fm.phone&&fm.phone.required&&phoneDigits.length<9){msg.className='form-msg bad';msg.textContent='Въведи телефон, на който да се свържем с теб.';fm.phone.focus();return}
      if(fm.getAttribute('data-need')==='phone-or-email'&&phoneDigits.length<9&&!/@/.test(body.email||'')){msg.className='form-msg bad';msg.textContent='Остави телефон или имейл.';return}
      if(fm.message&&fm.message.required&&(body.message||'').length<3){msg.className='form-msg bad';msg.textContent='Напиши съобщение.';fm.message.focus();return}
      if(fm.consent&&!fm.consent.checked){msg.className='form-msg bad';msg.textContent='Отбележи съгласието, за да можем да се свържем с теб.';return}
      body.consent=true;body.source='taxi2.bg'+location.pathname;
      var btn=fm.querySelector('button[type=submit]'),label=btn.textContent;btn.disabled=true;btn.textContent='Изпращам…';
      fetch(fm.getAttribute('data-endpoint'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||'');return j})})
        .then(function(){fm.hidden=true;if(done){done.hidden=false;done.scrollIntoView({behavior:'smooth',block:'center'})}})
        .catch(function(err){msg.className='form-msg bad';msg.textContent=err.message||'Нещо се обърка. Опитай пак след малко.';btn.disabled=false;btn.textContent=label});
    });
  });
})();
