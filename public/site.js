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

  // „Кандидатствай“: two ways — „Стани шофьор сега“ (documents at driver.taxi2.bg/kandidat) or „Свържете се с мен“ (short form)
  var call=document.getElementById('applyCall'),af=document.getElementById('applyForm');
  if(call&&af){call.addEventListener('click',function(){af.hidden=!af.hidden;call.setAttribute('aria-expanded',!af.hidden);if(!af.hidden&&af.name)af.name.focus()})}

  // Общи условия: the texts come from the platform (/api/legal), the same the apps show
  document.querySelectorAll('[data-legal]').forEach(function(el){
    var who=el.getAttribute('data-for'),kind=el.getAttribute('data-legal');
    function esc(t){return t.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
    function link(t){return t.replace(/(https?:\/\/[^\s<)]+[^\s<).,;])/g,'<a class="tlink" href="$1" rel="noopener">$1</a>').replace(/([\w.+-]+@[\w-]+\.[\w.]+\w)/g,'<a class="tlink" href="mailto:$1">$1</a>')}
    fetch('/api/legal'+(who==='driver'?'?for=driver':'')).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'');return j})}).then(function(j){
      var lines=String(j[kind]||'').replace(/\r/g,'').split('\n'),html='',i=0;
      lines.forEach(function(l){
        l=l.trim();if(!l)return;
        if(i===0){i++;return} // the title is the page heading
        if(i===1&&/^Версия/.test(l)){i++;html+='<p class="muted">'+esc(l)+'</p>';return}
        i++;
        if(/^\d+\s+\S/.test(l)&&!/^\d+\.\d/.test(l)&&l.length<90)html+='<h2>'+esc(l)+'</h2>';
        else if(/^(Приложение|Раздел)\b/.test(l)&&l.length<120)html+='<h2>'+esc(l)+'</h2>';
        else html+='<p>'+link(esc(l))+'</p>';
      });
      el.innerHTML=html||'<p class="muted">Текстът се подготвя.</p>';
    }).catch(function(e){el.innerHTML='<p class="muted">'+esc(e.message||'Текстът не може да се зареди в момента. Опитай пак след малко или пиши на office@taxi2.bg.')+'</p>'});
  });

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
        .then(function(){fm.hidden=true;var pk=document.getElementById('applyPick');if(pk&&fm.id==='applyForm')pk.hidden=true;if(done){done.hidden=false;done.scrollIntoView({behavior:'smooth',block:'center'})}})
        .catch(function(err){msg.className='form-msg bad';msg.textContent=err.message||'Нещо се обърка. Опитай пак след малко.';btn.disabled=false;btn.textContent=label});
    });
  });
})();
