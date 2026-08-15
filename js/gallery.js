/* =========================================================
   BIRTHDAY DATA  —  live photo album
   Any logged-in study buddy can add a photo. Stored in the
   existing Realtime Database under  gallery/ ; photos are shrunk
   in the browser first so the DB stays light.
   ========================================================= */
(function(){
  /* e-posta kaynakta yok; ana modül girişte hesabı doğrulayıp window.__special ayarlıyor */
  const $ = id => document.getElementById(id);

  const photoFile = $('photoFile'), photoCaption = $('photoCaption'), photoAddBtn = $('photoAddBtn'),
        photoHint = $('photoHint'), galleryGrid = $('galleryGrid'), galleryEmpty = $('galleryEmpty');

  let fb = null, inited = false, busy = false;

  function whenFb(cb){
    if (window.fb){ cb(window.fb); return; }
    window.addEventListener('fb-ready', () => cb(window.fb), { once:true });
  }
  const user = () => (fb && fb.auth) ? fb.auth.currentUser : null;
  const isNuman = u => !!u && window.__special === true;
  const esc = s => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = ms => { try { return new Date(ms).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' }); } catch(e){ return ''; } };

  /* shrink a chosen photo in the browser before saving */
  function compress(file, maxDim, quality){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
          else if (h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          /* Blob → Storage'a yükleniyor. Eskiden base64 olarak veritabanına
             yazılıyordu; o zaman dinleyici her değişiklikte TÜM albümü
             yeniden indiriyordu. Artık veritabanında sadece adres var. */
          c.toBlob(b => b ? resolve(b) : reject(new Error('Görsel işlenemedi')), 'image/jpeg', quality);
        };
        img.onerror = reject; img.src = e.target.result;
      };
      r.onerror = reject; r.readAsDataURL(file);
    });
  }

  function refreshAuthUI(){
    const u = user();
    photoHint.textContent = u ? '' : 'Fotoğraf eklemek için yukarıdan Çalışma Odası\'na giriş yap 💗';
  }
  window.addEventListener('sb-auth', refreshAuthUI);

  /* Önizleme: her fotoğraf AYNI alanı kaplıyor, not/tarih görünmüyor —
     sade bir polaroid duvarı. Ayrıntılar büyütünce çıkıyor.            */
  let photos = [];          // en yeni önce
  const TILT = [-1.6, 1.1, -0.7, 1.8, -1.2, 0.6];   // hafif, düzensiz eğim

  function renderGallery(val){
    photos = Object.entries(val || {}).map(([k,v]) => Object.assign({ k }, v))
              .map(it => Object.assign(it, { src: it.url || (/^data:image\//.test(it.img || '') ? it.img : '') }))
              .filter(it => it.src)
              .sort((a,b) => (b.at||0)-(a.at||0));
    galleryEmpty.style.display = photos.length ? 'none' : '';
    galleryGrid.innerHTML = photos.map((it, i) =>
      '<button class="pola" data-k="' + it.k + '" style="--tilt:' + TILT[i % TILT.length] + 'deg">'
      + '<span class="pola-frame"><img loading="lazy" src="' + it.src + '" alt="Fotoğraf"></span>'
      + '<span class="pola-strip"></span>'
      + '</button>').join('');
    if (lbKey) openLb(lbKey, true);      // açık kutu varsa tazele
    // veritabanında hâlâ base64 duran kayıt var mı?
    const legacy = photos.filter(p => !p.url && p.img).length;
    if (legacy) console.info('[galeri] hâlâ base64 duran kayıt:', legacy);
  }

  /* ---------- büyütme kutusu ---------- */
  let lbKey = null, lbEditing = false;
  const lb = $('galleryLb');

  function findPhoto(k){ return photos.find(p => p.k === k); }

  function openLb(k, keepState){
    const it = findPhoto(k);
    if (!it || !lb){ closeLb(); return; }
    lbKey = k;
    if (!keepState) lbEditing = false;
    const me = user();
    const canEdit = me && (me.uid === it.byUid || isNuman(me));
    const i = photos.indexOf(it);

    $('glImg').src = it.src;
    $('glMeta').textContent = (esc(it.by) || 'Biri') + ' • ' + fmtDate(it.at);
    $('glCount').textContent = (i + 1) + ' / ' + photos.length;

    const capBox = $('glCapBox');
    if (lbEditing && canEdit){
      capBox.innerHTML = '<textarea id="glCapInput" maxlength="200" rows="2" '
        + 'placeholder="bir not ekle…">' + esc(it.caption || '') + '</textarea>'
        + '<div class="gl-caprow"><button id="glCapSave" class="primary">Kaydet</button>'
        + '<button id="glCapCancel">Vazgeç</button></div>';
      setTimeout(() => { const t = $('glCapInput'); if (t){ t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 20);
    } else {
      capBox.innerHTML = '<div class="gl-cap' + (it.caption ? '' : ' empty') + '">'
        + (it.caption ? esc(it.caption) : (canEdit ? 'not ekle…' : ''))
        + (canEdit ? ' <button id="glCapEdit" title="Notu düzenle">✎</button>' : '')
        + '</div>';
    }
    $('glDel').style.display = canEdit ? '' : 'none';
    $('glDel').setAttribute('data-key', k);
    lb.hidden = false; lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function closeLb(){
    lbKey = null; lbEditing = false;
    if (lb){ lb.hidden = true; lb.style.display = 'none'; }
    document.body.style.overflow = '';
  }
  function step(d){
    if (!lbKey) return;
    const i = photos.findIndex(p => p.k === lbKey);
    if (i < 0) return;
    const n = photos[(i + d + photos.length) % photos.length];
    if (n) openLb(n.k);
  }

  async function saveCaption(){
    const t = $('glCapInput'); if (!t || !lbKey || !fb) return;
    const v = t.value.trim().slice(0, 200);
    try {
      await fb.update(fb.ref(fb.db, 'gallery/' + lbKey), { caption: v });
      lbEditing = false;
      openLb(lbKey, true);
    } catch(err){ toast('Kaydedilemedi: ' + (err && err.message ? err.message : err)); }
  }

  if (galleryGrid) galleryGrid.addEventListener('click', e => {
    const b = e.target.closest('.pola'); if (b) openLb(b.getAttribute('data-k'));
  });

  if (lb) lb.addEventListener('click', e => {
    if (e.target === lb || e.target.closest('#glClose')) return closeLb();
    if (e.target.closest('#glPrev')) return step(1);      // sağa: daha eski
    if (e.target.closest('#glNext')) return step(-1);
    if (e.target.closest('#glCapEdit')){ lbEditing = true; return openLb(lbKey, true); }
    if (e.target.closest('#glCapSave')) return saveCaption();
    if (e.target.closest('#glCapCancel')){ lbEditing = false; return openLb(lbKey, true); }
  });

  document.addEventListener('keydown', e => {
    if (!lbKey) return;
    if (e.key === 'Escape'){ if (lbEditing){ lbEditing = false; openLb(lbKey, true); } else closeLb(); }
    if (lbEditing) return;
    if (e.key === 'ArrowLeft') step(1);
    if (e.key === 'ArrowRight') step(-1);
  });
  function init(){
    if (inited) return; inited = true;
    whenFb(_fb => {
      fb = _fb;
      refreshAuthUI();
      fb.onValue(fb.ref(fb.db, 'gallery'), s => renderGallery(s.val()));
    });
  }
  window.onBirthdayOpen  = function(){
    init();
    refreshAuthUI();
    // start every visit with the conversation folders collapsed
    document.querySelectorAll('#mektup .letter-fold[open]').forEach(d => d.removeAttribute('open'));
  };
  window.onBirthdayClose = function(){ /* listeners stay attached; nothing to do */ };

  /* add a photo (any logged-in user) */
  photoAddBtn.addEventListener('click', () => {
    if (!user()){ photoHint.textContent = 'Önce yukarıdan Study Buddies\'e giriş yapmalısın 💗'; return; }
    photoFile.click();
  });
  photoFile.addEventListener('change', async () => {
    const file = photoFile.files && photoFile.files[0];
    if (!file || busy) return;
    const u = user();
    if (!u){ photoHint.textContent = 'Giriş gerekli.'; photoFile.value = ''; return; }
    busy = true;
    const label = photoAddBtn.textContent; photoAddBtn.textContent = 'Yükleniyor…'; photoAddBtn.disabled = true;
    try {
      const blob = await compress(file, 1600, 0.84);
      const key = Date.now() + '-' + Math.random().toString(36).slice(2,8);
      const sr = fb.sRef(fb.storage, 'gallery/' + key + '.jpg');
      await fb.uploadBytesResumable(sr, blob, { contentType:'image/jpeg', cacheControl:'public,max-age=604800' });
      const url = await fb.getDownloadURL(sr);
      await fb.update(fb.ref(fb.db, 'gallery/' + key), {
        url: url, path: 'gallery/' + key + '.jpg',
        caption: (photoCaption.value || '').trim(),
        by: u.displayName || u.email, byUid: u.uid, at: Date.now()
      });
      photoCaption.value = ''; photoHint.textContent = '';
    } catch(err){ photoHint.textContent = 'Yükleme başarısız: ' + (err && err.message ? err.message : err); }
    finally { busy = false; photoFile.value = ''; photoAddBtn.textContent = label; photoAddBtn.disabled = false; }
  });

  /* delete (a photo's uploader, or Numan for anything) */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest ? e.target.closest('.item-del') : null;
    if (!btn || !fb) return;
    const kind = btn.getAttribute('data-kind'), key = btn.getAttribute('data-key');
    if (!kind || !key) return;
    if (!await (window.ask ? window.ask : async m => window.confirm(m))('Bunu silmek istediğine emin misin?')) return;
    try {
      const it = photos.find(p => p.k === key);
      await fb.update(fb.ref(fb.db, kind), { [key]: null });
      if (it && it.path && fb.deleteObject){
        try { await fb.deleteObject(fb.sRef(fb.storage, it.path)); } catch(e){}
      }
      if (typeof closeLb === 'function') closeLb();
    }
    catch(err){ toast('Silinemedi: ' + (err && err.message ? err.message : err)); }
  });
})();
