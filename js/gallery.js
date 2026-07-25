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
          resolve(c.toDataURL('image/jpeg', quality));
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

  function renderGallery(val){
    const items = Object.entries(val || {}).map(([k,v]) => Object.assign({ k }, v)).sort((a,b) => (b.at||0)-(a.at||0));
    const me = user();
    galleryEmpty.style.display = items.length ? 'none' : '';
    galleryGrid.innerHTML = items.map(it => {
      const safe = (it.img && /^data:image\//.test(it.img)) ? it.img : '';
      if (!safe) return '';
      const canDel = me && (me.uid === it.byUid || isNuman(me));
      return '<div class="photo-card">'
        + (canDel ? '<button class="item-del" data-kind="gallery" data-key="' + it.k + '" title="Sil">✕</button>' : '')
        + '<img loading="lazy" src="' + safe + '" alt="' + (esc(it.caption) || 'Fotoğraf') + '">'
        + (it.caption ? '<div class="photo-cap">' + esc(it.caption) + '</div>' : '')
        + '<div class="photo-meta">' + (esc(it.by) || 'Biri') + ' • ' + fmtDate(it.at) + '</div>'
        + '</div>';
    }).join('');
  }
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
      const img = await compress(file, 1280, 0.82);
      const key = Date.now() + '-' + Math.random().toString(36).slice(2,8);
      await fb.update(fb.ref(fb.db, 'gallery/' + key), {
        img: img, caption: (photoCaption.value || '').trim(),
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
    try { await fb.update(fb.ref(fb.db, kind), { [key]: null }); }
    catch(err){ toast('Silinemedi: ' + (err && err.message ? err.message : err)); }
  });
})();
