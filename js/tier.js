/* tier.js — bitirilen film/dizileri sıralama
   ------------------------------------------------------------------
   Veri:
     tiers/{tierId}          { name, order, color }
     watchlist/{key}/tier    → tierId  (yerleşim öğenin üstünde durur,
                               böylece film silinince artık kayıt kalmaz)

   Etkileşim: sürükleme yok. Bir afişe dokun (havada kalır), sonra
   gideceği satıra dokun. Dokunmatikte sürüklemekten çok daha güvenilir.

   Satır adı: etikete UZUN BAS. Görünür bir kalem/düzenle düğmesi yok —
   göze çarpmasın ama istendiği an değiştirilebilsin.                 */

export function initTier(ctx){
  const { db, auth, ref, set, update, onValue, toast, escapeHtml } = ctx;
  const $ = id => document.getElementById(id);
  const view = $('tierView');
  if (!view) return null;

  const DEFAULTS = [
    { id:'s', name:'S', order:0, color:'#ff7a7a' },
    { id:'a', name:'A', order:1, color:'#ffb066' },
    { id:'b', name:'B', order:2, color:'#ffd76a' },
    { id:'c', name:'C', order:3, color:'#a8e08f' },
    { id:'d', name:'D', order:4, color:'#8fc9e8' }
  ];

  let tiers = {};
  let items = {};          // watchlist anlık görüntüsü
  let picked = null;       // seçili film anahtarı
  let attached = false;
  let editingTier = null;

  const done = () => Object.entries(items)
    .filter(([k, n]) => k !== '_meta' && n && n.done)
    .sort((a, b) => (b[1].doneAt || b[1].at || 0) - (a[1].doneAt || a[1].at || 0));

  const tierList = () => {
    const t = Object.entries(tiers).length ? Object.entries(tiers) : DEFAULTS.map(d => [d.id, d]);
    return t.sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  };

  const titleOf = n => (n.title || n.text || '').trim();

  /* ---------- çizim ---------- */
  function tile(k, n){
    const poster = n.card && n.card.poster;
    const t = escapeHtml(titleOf(n));
    const inner = poster
      ? `<img src="${poster}" alt="${t}" loading="lazy">`
      : `<span>${t}</span>`;
    return `<button class="tl-tile ${picked === k ? 'sel' : ''}" data-k="${k}" title="${t}">${inner}</button>`;
  }

  function render(){
    const all = done();
    $('tlEmpty').style.display = all.length ? 'none' : '';

    // ad düzenlenirken satırları yeniden kurma — açık input yok olurdu
    if (editingTier) return;

    // satırlar
    $('tlRows').innerHTML = tierList().map(([id, t]) => {
      const mine = all.filter(([, n]) => n.tier === id);
      return `<div class="tl-row" data-tier="${id}">
        <div class="tl-label" data-tier="${id}" style="background:${t.color || '#ccc'}">${escapeHtml(t.name || '')}</div>
        <div class="tl-drop">${mine.map(([k, n]) => tile(k, n)).join('')}</div>
      </div>`;
    }).join('');

    // havuz
    const placedIds = new Set(tierList().map(([id]) => id));
    const pool = all.filter(([, n]) => !n.tier || !placedIds.has(n.tier));
    $('tlPool').innerHTML = pool.map(([k, n]) => tile(k, n)).join('');
    $('tlPoolCount').textContent = pool.length ? `Sıralanmamış · ${pool.length}` : 'Hepsi sıralandı';

    // ipucu + hedef vurgusu
    const hint = $('tlHint');
    if (picked){
      const n = items[picked] || {};
      hint.textContent = `"${titleOf(n)}" seçildi — nereye?`;
      hint.classList.add('armed');
    } else {
      hint.textContent = '';
      hint.classList.remove('armed');
    }
    view.querySelectorAll('.tl-row, .tl-pool').forEach(el => el.classList.toggle('target', !!picked));
  }

  /* ---------- yerleştirme ---------- */
  async function place(key, tierId){
    try {
      await update(ref(db, `watchlist/${key}`), { tier: tierId || null });
      picked = null;
    } catch(e){ toast(e.message); }
  }

  /* ---------- satır adını değiştir (uzun basış) ---------- */
  function beginEdit(labelEl, tierId){
    if (editingTier) return;
    editingTier = tierId;
    const cur = (tiers[tierId] || DEFAULTS.find(d => d.id === tierId) || {}).name || '';
    labelEl.classList.add('editing');
    labelEl.innerHTML = `<input maxlength="14" value="${escapeHtml(cur)}">`;
    const inp = labelEl.querySelector('input');
    inp.focus(); inp.select();

    let closed = false;
    const finish = async (save) => {
      if (closed) return; closed = true;
      const val = inp.value.trim();
      editingTier = null;
      labelEl.classList.remove('editing');
      if (save && val && val !== cur){
        const base = tiers[tierId] || DEFAULTS.find(d => d.id === tierId) || {};
        try {
          await update(ref(db, `tiers/${tierId}`), {
            name: val,
            order: base.order || 0,
            color: base.color || '#ccc'
          });
        } catch(e){ toast(e.message); }
      }
      render();
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
      if (e.key === 'Escape'){ e.preventDefault(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
  }

  /* uzun basış: 500 ms. Basılı tutunca sonrasında gelen click'i yut. */
  let lpTimer = null, lpFired = false, lpX = 0, lpY = 0;
  view.addEventListener('pointerdown', e => {
    const lab = e.target.closest('.tl-label');
    if (!lab || editingTier) return;
    lpFired = false; lpX = e.clientX; lpY = e.clientY;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => { lpFired = true; beginEdit(lab, lab.getAttribute('data-tier')); }, 500);
  });
  const cancelLP = () => clearTimeout(lpTimer);
  view.addEventListener('pointerup', cancelLP);
  view.addEventListener('pointercancel', cancelLP);
  /* Parmak biraz oynayınca iptal etmek uzun basışı imkânsız kılıyordu;
     yalnızca gerçek kaydırmada (10px) vazgeç. */
  view.addEventListener('pointermove', e => {
    if (Math.abs(e.clientX - lpX) > 10 || Math.abs(e.clientY - lpY) > 10) cancelLP();
  });

  /* ---------- dokunuşlar ---------- */
  view.addEventListener('click', e => {
    if (lpFired){ lpFired = false; return; }   // uzun basıştan gelen click
    if (editingTier) return;

    const tile = e.target.closest('.tl-tile');
    if (tile){
      const k = tile.getAttribute('data-k');
      picked = (picked === k) ? null : k;
      render();
      return;
    }
    const row = e.target.closest('.tl-row');
    if (row && picked){ place(picked, row.getAttribute('data-tier')); return; }

    const pool = e.target.closest('.tl-pool');
    if (pool && picked){ place(picked, null); return; }
  });

  $('tlClose').onclick = close;

  /* ---------- bağlan ---------- */
  function attach(){
    if (attached) return; attached = true;
    onValue(ref(db, 'tiers'), s => { tiers = s.val() || {}; render(); },
      err => console.error('tiers read failed:', err && err.message));
    onValue(ref(db, 'watchlist'), s => { items = s.val() || {}; render(); },
      err => console.error('watchlist read failed:', err && err.message));
  }

  /* ilk açılışta varsayılan satırları bir kez yaz */
  async function seed(){
    if (Object.keys(tiers).length) return;
    const upd = {};
    DEFAULTS.forEach(d => { upd[`tiers/${d.id}`] = { name: d.name, order: d.order, color: d.color }; });
    try { await update(ref(db), upd); } catch(e){ /* kural reddederse görsel varsayılan yine çalışır */ }
  }

  function open(){
    view.hidden = false;
    view.style.display = 'block';
    view.classList.add('open');
    document.body.style.overflow = 'hidden';
    picked = null;
    attach();
    render();
    seed();
  }
  function close(){
    view.classList.remove('open');
    view.style.display = 'none';
    view.hidden = true;
    document.body.style.overflow = '';
    picked = null;
  }

  return { open, close };
}
