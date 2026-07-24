/* =========================================================
   SECRET GATEWAY  →  PIN  →  BIRTHDAY SURPRISE
   Separate from the study-timer module above. Touches nothing
   in the timer; only listens to the logo dot and runs the gate.
   ========================================================= */
(function(){
  /* ====== CHANGE THE PIN HERE ====== */
  /* Şifre artık kaynak kodda YOK. Yerine PBKDF2-SHA256 (250.000 tur) özeti var:
     girilen şifre aynı şekilde özetlenip kıyaslanır, özetten şifre geri çıkarılamaz. */
  const PIN_LEN  = 11;
  const PIN_SALT = '76b517a160cf70b4d913951b6ebbd4f2';
  const PIN_HASH = '1d75b6f63306f4c2132b5945bc754755629334606a683ff94e2df79af90bb432';
  const hex2bytes = h => new Uint8Array(h.match(/../g).map(b => parseInt(b, 16)));
  const bytes2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  async function pinDigest(pin){
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name:'PBKDF2', salt: hex2bytes(PIN_SALT), iterations: 250000, hash:'SHA-256' }, k, 256);
    return bytes2hex(bits);
  }
  /* ================================= */
  const TAPS_NEEDED = 5;         // taps on the glowing logo dot to reveal the gate
  const TAP_WINDOW  = 2000;      // taps must land within this many ms

  const $ = id => document.getElementById(id);
  const pinModal = $('pinModal'), pinInputs = $('pinInputs');
  const pinCard = $('pinCard'), pinLock = $('pinLock');
  const bday = $('birthdayView'), bdayAudio = $('bdayAudio');
  const dot = document.querySelector('.title .dot');

  /* single field for the secret code */
  const pinSingle = $('pinSingle');
  pinSingle.addEventListener('input', () => {
    pinSingle.value = pinSingle.value.replace(/\D/g, '').slice(0, PIN_LEN);
    if (pinSingle.value.length === PIN_LEN) trySubmit();
  });
  pinSingle.addEventListener('keydown', e => { if (e.key === 'Enter') trySubmit(); });

  function clearPin(){ pinSingle.value = ''; pinLock.textContent = '🔒'; pinLock.classList.remove('open'); }
  function openModal(){ clearPin(); pinModal.classList.add('open'); setTimeout(() => pinSingle.focus(), 60); }
  function closeModal(){ pinModal.classList.remove('open'); clearPin(); }

  /* oturum kapanırsa sürprizi de kapat (paylaşılan cihaz güvenliği) */
  window.addEventListener('sb-auth', e => {
    if (e.detail && !e.detail.uid){
      closeModal();
      if (bday.classList.contains('open')) closeBirthday();
    }
  });

  let pinChecking = false;
  async function trySubmit(){
    const val = pinSingle.value.replace(/\D/g, '');
    if (val.length < PIN_LEN || pinChecking) return;
    pinChecking = true;
    let ok = false;
    try { ok = (await pinDigest(val)) === PIN_HASH; } catch(e){ ok = false; }
    pinChecking = false;
    if (ok){
      pinLock.textContent = '🔓';               // kilit açılma animasyonu
      pinLock.classList.remove('open'); void pinLock.offsetWidth; pinLock.classList.add('open');
      pinSingle.blur();
      startMusic();                             // fire within the gesture → best autoplay chance
      setTimeout(() => { closeModal(); openBirthday(); }, 620);
    } else {
      pinCard.classList.remove('pin-shake'); void pinCard.offsetWidth; pinCard.classList.add('pin-shake');
      pinSingle.value = ''; pinSingle.focus();
    }
  }
  pinModal.addEventListener('click', e => { if (e.target === pinModal) closeModal(); });

  /* ---- open / close the birthday world ---- */
  const MUSIC_IFRAME = '<iframe width="0" height="0" src="https://www.youtube.com/embed/sPWfmXBvgz4?autoplay=1&loop=1&playlist=sPWfmXBvgz4" frameborder="0" allow="autoplay" allowfullscreen></iframe>';
  const muteBtn = $('musicMute');
  let musicOn = false;

  /* Türkiye saatine göre gün/saat (cihaz saat dilimi ne olursa olsun) */
  function nowTR(){
    try { return new Date(new Date().toLocaleString('en-US', { timeZone:'Europe/Istanbul' })); }
    catch(e){ return new Date(); }
  }
  function isBdayToday(){
    const d = nowTR();
    return d.getMonth() === 6 && d.getDate() === 1;   // 1 Temmuz
  }

  function renderMusic(){
    if (!isBdayToday()) musicOn = false;              // müzik sadece 1 Temmuz'da
    if (musicOn){ if (!bdayAudio.innerHTML) bdayAudio.innerHTML = MUSIC_IFRAME; }
    else { bdayAudio.innerHTML = ''; }
    if (muteBtn){
      muteBtn.style.display = isBdayToday() ? '' : 'none';
      muteBtn.textContent = musicOn ? '🔊' : '🔇';
    }
  }
  function startMusic(){          // called within the unlock tap so browsers allow autoplay
    if (!isBdayToday()) { renderMusic(); return; }
    musicOn = true; renderMusic();
  }
  if (muteBtn) muteBtn.addEventListener('click', () => { musicOn = !musicOn; renderMusic(); });

  /* giriş sayfası: 1 Temmuz'da doğum günü, diğer günler karşılama */
  function applyGirisMode(){
    const bd = $('girisBday'), gr = $('girisGreet');
    if (isBdayToday()){
      if (bd) bd.style.display = '';
      if (gr) gr.style.display = 'none';
    } else {
      if (bd) bd.style.display = 'none';
      if (gr) gr.style.display = '';
      const h = nowTR().getHours();
      const greets = ['Merhaba balım'];
      if (h >= 5 && h < 12){ greets.push('Günaydın balım', 'Günaydın balım'); }
      else if (h >= 18 || h < 5){ greets.push('İyi akşamlar balım', 'İyi akşamlar balım'); }
      const qs = ['neye bakmıştık?', 'ne arıyoruz?', 'napmak isteriz şuan?', 'nasıl yardımcı olabilirim acaba?', 'emirleriniz?'];
      const gl = $('greetLine'), gq = $('greetQ');
      if (gl) gl.textContent = greets[Math.floor(Math.random() * greets.length)] + ' 💖';
      if (gq) gq.textContent = qs[Math.floor(Math.random() * qs.length)];
    }
  }
  function openBirthday(){
    startMusic();
    applyGirisMode();
    bday.classList.add('open');
    bday.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    showBirthdaySection('giris');
    bday.scrollTop = 0;
    if (typeof window.onBirthdayOpen === 'function') window.onBirthdayOpen();
  }
  function closeBirthday(){
    bday.classList.remove('open');
    bday.setAttribute('aria-hidden', 'true');
    musicOn = false; renderMusic();      // stops the music
    document.body.style.overflow = '';
    if (typeof window.onBirthdayClose === 'function') window.onBirthdayClose();
  }
  $('birthdayBack').addEventListener('click', closeBirthday);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ if (bday.classList.contains('open')) closeBirthday(); else if (pinModal.classList.contains('open')) closeModal(); }
  });

  /* ---- birthday internal navigation (scoped to the surprise) ---- */
  window.showBirthdaySection = function(id){
    bday.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    const t = bday.querySelector('#' + id);
    if (t) t.classList.add('active');
    const nav = bday.querySelector('nav');
    if (nav) nav.style.display = (id === 'giris') ? 'none' : 'flex';
    if (id === 'giris') applyGirisMode();
    bday.scrollTop = 0;
  };

  /* ---- soft fallback if a photo file isn't in /images yet ---- */
  function placeholder(label){
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>"
      + "<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='#ffe1ea'/><stop offset='1' stop-color='#fff0f5'/></linearGradient></defs>"
      + "<rect width='300' height='300' rx='15' fill='url(#g)'/>"
      + "<text x='150' y='138' font-size='54' text-anchor='middle'>💗</text>"
      + "<text x='150' y='184' font-family='Open Sans, sans-serif' font-size='16' fill='#c25e7a' text-anchor='middle'>" + label + "</text>"
      + "<text x='150' y='208' font-family='Open Sans, sans-serif' font-size='12' fill='#d68fa3' text-anchor='middle'>fotoğraf yakında 💌</text>"
      + "</svg>";
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function guard(img, label){
    const setPh = () => { img.src = placeholder(label); };
    img.addEventListener('error', function onErr(){ img.removeEventListener('error', onErr); setPh(); });
    if (img.complete && img.naturalWidth === 0) setPh();
  }
  bday.querySelectorAll('.gallery img').forEach((img, i) => guard(img, img.alt || ('Foto ' + (i + 1))));
  const intro = $('bdayIntroImg'); if (intro) guard(intro, 'Aşkım 💖');

  /* ---- the secret trigger: tap the glowing logo dot ----
     Giriş yapılmamışsa kapı hiç açılmaz: dışarıdan bakan biri için
     nokta sadece bir süs. Firebase oturumu tarayıcıda kalıcı olduğu
     için ikiniz bir kere giriş yapınca bir daha uğraşmıyorsunuz. */
  const loggedIn = () => !!(window.fb && window.fb.auth && window.fb.auth.currentUser);
  let taps = 0, t = null;
  if (dot){
    dot.addEventListener('click', () => {
      if (!loggedIn()) { taps = 0; return; }
      taps++;
      clearTimeout(t);
      t = setTimeout(() => { taps = 0; }, TAP_WINDOW);
      if (taps >= TAPS_NEEDED){ taps = 0; clearTimeout(t); openModal(); }
    });
  }
})();
