/* sheet.js — panellerin ORTAK davranışı
   ------------------------------------------------------------------
   Sekiz panel sekiz ayrı yerde açılıp kapanıyordu. Buradaki kod
   açma/kapama mantığına DOKUNMUYOR — sadece hepsine aynı davranışı
   ekliyor: aşağı sürükleyerek kapatma, Escape, ve panel kapanınca
   sayfa kaydırmasının geri gelmesi.

   Kapatmayı kendimiz yapmıyoruz: her panelin zaten bir kapat düğmesi
   var, onu tıklıyoruz. Böylece modüllerin kendi temizlik kodu
   (dinleyici bırakma, durum sıfırlama) aynen çalışıyor.              */
(function(){
  const SHEETS = [
    ['libView',    'libClose'],
    ['watchView',  'watchClose'],
    ['habitView',  'habitClose'],
    ['cycleView',  'cycleClose'],
    ['tierView',   'tlClose'],
    ['profView',   'profClose'],
    ['focusView',  null]          // odak modu: kendi düğmesi var, sürükleme yok
  ];

  const isOpen = el => el && (el.classList.contains('open') ||
                              (!el.hidden && el.style.display && el.style.display !== 'none'));

  function topSheet(){
    let best = null, bestZ = -1;
    SHEETS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (!isOpen(el)) return;
      const z = parseInt(getComputedStyle(el).zIndex, 10) || 0;
      if (z >= bestZ){ bestZ = z; best = el; }
    });
    return best;
  }

  function closeSheet(el){
    if (!el) return false;
    const pair = SHEETS.find(([id]) => id === el.id);
    const btn = pair && pair[1] && document.getElementById(pair[1]);
    if (btn){ btn.click(); return true; }
    return false;
  }

  /* --- Escape: en üstteki paneli kapat --- */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // bir metin kutusundaysak veya üstte bir onay/ışık kutusu varsa karışma
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const modalOpen = ['askBox','bookModal','galleryLb','lightbox']
      .some(id => { const m = document.getElementById(id); return m && isOpen(m); });
    if (modalOpen) return;
    if (closeSheet(topSheet())) e.stopPropagation();
  });

  /* --- aşağı sürükleyerek kapat ---
     Yalnızca panel EN ÜSTTE kaydırılmışken başlıyor; yoksa normal
     kaydırmayı bozardı. */
  let sy = 0, sx = 0, dragging = false, target = null;

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const el = topSheet();
    if (!el || el.scrollTop > 4) return;
    if (e.target.closest('input,textarea,select,.tl-tile,.pola,.cs-jump')) return;
    target = el; sy = e.touches[0].clientY; sx = e.touches[0].clientX; dragging = false;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!target || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - sy;
    const dx = Math.abs(e.touches[0].clientX - sx);
    if (!dragging){
      if (dy < 12 || dx > Math.abs(dy)) { if (dy < -4) target = null; return; }
      dragging = true;
    }
    if (target.scrollTop > 4){ reset(); return; }
    const pull = Math.min(dy, 260);
    target.style.transform = 'translateY(' + pull + 'px)';
    target.style.transition = 'none';
    target.style.opacity = String(Math.max(.55, 1 - pull / 520));
  }, { passive: true });

  function reset(){
    if (target){
      target.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1), opacity .22s';
      target.style.transform = '';
      target.style.opacity = '';
      const el = target;
      setTimeout(() => { el.style.transition = ''; }, 240);
    }
    target = null; dragging = false;
  }

  document.addEventListener('touchend', e => {
    if (!target || !dragging){ target = null; dragging = false; return; }
    const dy = (e.changedTouches[0] || {}).clientY - sy;
    const el = target;
    if (dy > 110){
      el.style.transition = 'transform .2s ease, opacity .2s';
      el.style.transform = 'translateY(100%)';
      el.style.opacity = '0';
      setTimeout(() => {
        el.style.transition = ''; el.style.transform = ''; el.style.opacity = '';
        closeSheet(el);
      }, 190);
      target = null; dragging = false;
      return;
    }
    reset();
  });

  document.addEventListener('touchcancel', reset);

  /* --- güvenlik ağı: hiçbir panel açık değilse sayfa kaydırması açık kalsın.
     Panellerden biri temizlemeyi unutursa sayfa kilitli kalıyordu. --- */
  setInterval(() => {
    if (document.body.style.overflow !== 'hidden') return;
    const anySheet = SHEETS.some(([id]) => isOpen(document.getElementById(id)));
    const anyModal = ['askBox','bookModal','galleryLb','lightbox','birthdayView']
      .some(id => isOpen(document.getElementById(id)));
    if (!anySheet && !anyModal) document.body.style.overflow = '';
  }, 1500);
})();
