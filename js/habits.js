/* habits.js — ortak & kişisel alışkanlık takibi
   ------------------------------------------------------------------
   Veri düzeni:
     habits/{id}            { name, emoji, type, byUid, by, at,
                              invitedUid, invitedBy, status }
     habitLog/{uid}/{id}/{YYYY-MM-DD}   → zaman damgası

   Kişisel alışkanlık anında 'active' olur.
   Ortak alışkanlık 'pending' başlar; karşı taraf onaylayınca 'active',
   reddedince kayıt tamamen silinir.

   Kayıt (log) her zaman kişiye özel: habitLog/{uid} altına yalnızca
   o kullanıcı yazabiliyor — kural bu seviyede veriliyor, o yüzden
   watchlist'teki "üstten inen izin" sorunu burada oluşmuyor.        */

export function initHabits(ctx){
  const { db, auth, ref, set, update, onValue, toast, confetti, sendPush, escapeHtml, openCycle } = ctx;

  const $ = id => document.getElementById(id);
  const view = $('habitView');
  if (!view) return;

  let habits = {};      // tüm alışkanlık tanımları
  let logs = {};        // habitLog/{uid} → { habitId: { date: ts } }
  let users = {};       // uid → displayName (ana modülden besleniyor)
  let attached = false;
  let hbType = 'personal';        // yeni seçici için
  let expanded = null;            // açılmış alışkanlık id'si
  let filter = 'all';             // all | personal | shared
  let doneCollapsed = true;       // bugün bitenler katlı gelsin

  const todayKey = (d = new Date()) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  const uid = () => (auth.currentUser || {}).uid;

  /* --- ardışık gün sayısı: bugünden geriye doğru --- */
  function streak(entry){
    if (!entry) return 0;
    let n = 0;
    const d = new Date();
    // bugün işaretli değilse dünden başla (gün henüz bitmedi, seri kırılmasın)
    if (!entry[todayKey(d)]) d.setDate(d.getDate() - 1);
    while (entry[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function lastSevenDays(entry){
    const out = [];
    for (let i = 6; i >= 0; i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      out.push(!!(entry && entry[todayKey(d)]));
    }
    return out;
  }

  /* Uzun görünüm: son 12 hafta. Her gün için ikimizin durumunu ayrı
     ayrı biliyoruz — renk kimin yaptığını gösteriyor. */
  function longGrid(id, me, otherUid){
    const mine = (logs[me] || {})[id] || {};
    const theirs = otherUid ? ((logs[otherUid] || {})[id] || {}) : {};
    const DAYS = 84;
    const cells = [];
    const start = new Date(); start.setDate(start.getDate() - (DAYS - 1));
    for (let i = 0; i < DAYS; i++){
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = todayKey(d);
      const a = !!mine[k], b = !!theirs[k];
      let cls = '';
      if (a && b) cls = 'both';
      else if (a) cls = 'me';
      else if (b) cls = 'them';
      cells.push(`<i class="${cls}" title="${k}"></i>`);
    }
    return cells.join('');
  }

  const nameOf = u => (users[u] || {}).displayName || 'Arkadaşın';

  /* Kayıtlardaki en uzun kesintisiz gün dizisi. */
  function bestStreak(entry){
    const days = Object.keys(entry || {}).sort();
    let best = 0, run = 0, prev = null;
    days.forEach(d => {
      if (prev){
        const gap = Math.round((new Date(d + 'T12:00:00') - new Date(prev + 'T12:00:00')) / 86400000);
        run = gap === 1 ? run + 1 : 1;
      } else run = 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }

  /* ---------------- render ---------------- */
  function render(){
    const me = uid(); if (!me) return;
    const mine = logs[me] || {};

    // 1) bekleyen ortak alışkanlık davetleri
    const invites = Object.entries(habits).filter(([, h]) =>
      h && h.status === 'pending' && h.invitedUid === me);
    $('habitInvites').innerHTML = invites.map(([id, h]) => `
      <div class="hb-invite">
        <div><b>${escapeHtml(h.emoji || '🎯')} ${escapeHtml(h.name)}</b></div>
        <div class="muted small" style="margin-top:4px">${escapeHtml(h.by || 'Arkadaşın')} ortak alışkanlık öneriyor</div>
        <div class="row">
          <button class="primary hb-ok" data-id="${id}">Onayla</button>
          <button class="hb-no" data-id="${id}">Reddet</button>
        </div>
      </div>`).join('');

    // rozet: onay bekleyen varsa dock'ta nokta
    const dot = $('habitDot');
    if (dot) dot.style.display = invites.length ? '' : 'none';

    // 2) benim görebileceğim aktif alışkanlıklar
    const list = Object.entries(habits).filter(([, h]) => {
      if (!h || h.status !== 'active') return false;
      if (h.type === 'shared') return true;
      return h.byUid === me;                       // kişisel → sadece sahibi
    }).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));

    $('habitEmpty').style.display = list.length ? 'none' : '';

    /* Kalabalık hissini kıran asıl şey: bugün biteni listeden çıkarmak.
       Üstte yalnızca hâlâ yapılacaklar kalıyor. */
    const shown = list.filter(([, h]) => filter === 'all' || h.type === filter);
    const isDone = ([id]) => !!((mine[id] || {})[todayKey()]);
    const todo = shown.filter(x => !isDone(x));
    const finished = shown.filter(isDone);

    // tür süzgeci — yalnızca liste büyüyünce görünsün
    const F = [['all','Hepsi'],['personal','Alışkanlık'],['shared','Balışkanlık']];
    $('habitFilter').innerHTML = list.length > 3
      ? F.map(([v,t]) => `<button class="hb-fchip ${filter===v?'on':''}" data-flt="${v}">${t}</button>`).join('')
      : '';

    const card = ([id, h]) => {
      const entry = mine[id] || {};
      const done = !!entry[todayKey()];
      const week = lastSevenDays(entry).map(d => `<i class="${d ? 'done' : ''}"></i>`).join('');

      // ortak alışkanlıkta karşı tarafın serisi de görünsün
      let other = '';
      if (h.type === 'shared'){
        const otherUid = Object.keys(logs).find(u => u !== me) ||
                         Object.keys(users).find(u => u !== me);
        if (otherUid){
          const os = streak((logs[otherUid] || {})[id]);
          const oDone = !!(((logs[otherUid] || {})[id] || {})[todayKey()]);
          other = `<span>${escapeHtml(nameOf(otherUid))}: <b>${os}</b> gün ${oDone ? '✅' : ''}</span>`;
        }
      }

      const isOpen = expanded === id;
      const otherUid2 = Object.keys(logs).find(u => u !== me) ||
                        Object.keys(users).find(u => u !== me) || null;
      const longPart = isOpen ? `
        <div class="hb-long">
          <div class="hb-long-grid">${longGrid(id, me, h.type === 'shared' ? otherUid2 : null)}</div>
          <div class="hb-long-legend">
            <span><i class="me"></i>Sen</span>
            ${h.type === 'shared' && otherUid2 ? `<span><i class="them"></i>${escapeHtml(nameOf(otherUid2))}</span>` : ''}
            <span class="muted">son 12 hafta</span>
          </div>
          <div class="hb-long-stats">
            <span>Toplam <b>${Object.keys(entry).length}</b> gün</span>
            <span>En uzun seri <b>${bestStreak(entry)}</b></span>
          </div>
        </div>` : '';

      return `<div class="hb-item ${isOpen ? 'open' : ''}">
        <div class="hb-top">
          <span style="font-size:20px">${escapeHtml(h.emoji || '🎯')}</span>
          <span class="hb-name">${escapeHtml(h.name)}</span>
          <span class="hb-kind">${h.type === 'shared' ? 'Balışkanlık' : 'Alışkanlık'}</span>
          ${h.byUid === me ? `<button class="hb-del small" data-id="${id}" title="Sil">✕</button>` : ''}
          <button class="hb-tick ${done ? 'on' : ''}" data-id="${id}">${done ? '✔' : ''}</button>
        </div>
        <div class="hb-week">${week}</div>
        <div class="hb-streak"><span>Sen: <b>${streak(entry)}</b> gün</span>${other}</div>
        ${longPart}
        <button class="hb-expand" data-exp="${id}">${isOpen ? 'Kapat ▲' : 'Geçmişi aç ▼'}</button>
      </div>`;
    };

    const slim = ([id, h]) => `<div class="hb-slim" data-slim="${id}">
        <span class="hb-slim-ico">${escapeHtml(h.emoji || '🎯')}</span>
        <span class="hb-slim-name">${escapeHtml(h.name)}</span>
        <span class="hb-slim-streak">${streak(mine[id] || {})}🔥</span>
        <button class="hb-tick on small" data-id="${id}">✔</button>
      </div>`;

    let html = todo.map(card).join('');
    if (finished.length){
      html += `<button class="hb-donehead" data-donetoggle="1">
          ${doneCollapsed ? '▸' : '▾'} Bugün tamamlanan · ${finished.length}
        </button>
        <div class="hb-donewrap" ${doneCollapsed ? 'hidden' : ''}>${finished.map(slim).join('')}</div>`;
    }
    if (!todo.length && !finished.length && list.length){
      html += '<div class="muted small" style="margin-top:12px">Bu süzgeçte alışkanlık yok</div>';
    }
    $('habitList').innerHTML = html;
  }

  /* ---------------- actions ---------------- */
  async function toggleToday(id){
    const me = uid(); if (!me) return;
    const k = todayKey();
    const on = !!((logs[me] || {})[id] || {})[k];
    try {
      await update(ref(db, `habitLog/${me}/${id}`), { [k]: on ? null : Date.now() });
      if (!on){
        const h = habits[id] || {};
        const s = streak(Object.assign({}, (logs[me] || {})[id], { [k]: Date.now() }));
        if (s > 0 && s % 7 === 0) confetti();
        if (h.type === 'shared') sendPush('habit', null);
      }
    } catch(e){ toast(e.message); }
  }

  async function addHabit(){
    const me = auth.currentUser; if (!me) return;
    const name = $('habitName').value.trim();
    if (!name){ $('habitHint').textContent = 'Bir isim yaz'; return; }
    const type = hbType;
    const emoji = $('habitEmoji').value.trim() || '🎯';

    // ortak ise karşı tarafı bul
    let invitedUid = null;
    if (type === 'shared'){
      invitedUid = Object.keys(users).find(u => u !== me.uid) || null;
      if (!invitedUid){ $('habitHint').textContent = 'Ortak alışkanlık için karşı taraf bulunamadı'; return; }
    }

    const id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await set(ref(db, `habits/${id}`), {
        name, emoji, type,
        byUid: me.uid, by: me.displayName || me.email, at: Date.now(),
        invitedUid, status: type === 'shared' ? 'pending' : 'active'
      });
      $('habitName').value = '';
      $('habitHint').textContent = '';
      if (type === 'shared'){
        sendPush('habit', invitedUid, { report: true });
        toast('Onay için gönderildi 🎯');
      } else {
        toast('Eklendi 🎯');
      }
    } catch(e){ $('habitHint').textContent = e.message; }
  }

  async function respond(id, ok){
    try {
      if (ok){
        await update(ref(db, `habits/${id}`), { status: 'active' });
        toast('Onaylandı — artık ortak 🎯');
        sendPush('habitOk', (habits[id] || {}).byUid);
      } else {
        await set(ref(db, `habits/${id}`), null);
        toast('Reddedildi');
      }
    } catch(e){ toast(e.message); }
  }

  async function removeHabit(id){
    if (!await (window.ask ? window.ask : async m => window.confirm(m))('Bu alışkanlık silinsin mi?')) return;
    try { await set(ref(db, `habits/${id}`), null); }
    catch(e){ toast(e.message); }
  }

  /* ---------------- wiring ---------------- */
  function attach(){
    if (attached) return; attached = true;
    onValue(ref(db, 'habits'), s => { habits = s.val() || {}; render(); },
      err => console.error('habits read failed:', err && err.message));
    onValue(ref(db, 'habitLog'), s => { logs = s.val() || {}; render(); },
      err => console.error('habitLog read failed:', err && err.message));
  }

  /* Başlıktaki 🎯 üç kez arka arkaya dokunulursa döngü takibi açılır.
     Sessiz bir kısayol: tek/çift dokunuşta hiçbir şey olmuyor. */
  (function(){
    const sig = $('habitSigil'); if (!sig || typeof openCycle !== 'function') return;
    let n = 0, t = null;
    sig.addEventListener('click', () => {
      n++;
      clearTimeout(t);
      t = setTimeout(() => { n = 0; }, 700);
      if (n >= 3){ n = 0; clearTimeout(t); openCycle(); }
    });
  })();

  /* tür seçici — ana sayfadaki ders seçicinin aynısı */
  const TYPES = { personal:['🙋','Alışkanlık'], shared:['🤝','Balışkanlık'] };
  function renderTypeMenu(){
    const m = $('hbTypeMenu'); if (!m) return;
    m.innerHTML = Object.entries(TYPES).map(([v,[ico,label]]) =>
      `<button data-hbt="${v}" class="${hbType===v?'on':''}">${ico} <span>${label}</span></button>`).join('');
  }
  function setType(v){
    hbType = v;
    const [ico,label] = TYPES[v];
    $('hbTypeIco').textContent = ico;
    $('hbTypeLabel').textContent = label;
    renderTypeMenu();
  }
  function toggleTypeMenu(force){
    const m = $('hbTypeMenu'); if (!m) return;
    const open = m.style.display !== 'none';
    const next = (force === undefined) ? !open : force;
    if (next) renderTypeMenu();
    m.style.display = next ? '' : 'none';
  }
  $('hbTypeTrigger').onclick = e => { e.stopPropagation(); toggleTypeMenu(); };
  $('hbTypeMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-hbt]'); if (!b) return;
    setType(b.getAttribute('data-hbt'));
    toggleTypeMenu(false);
  });
  document.addEventListener('click', e => {
    const m = $('hbTypeMenu'); if (!m || m.style.display === 'none') return;
    if (e.target.closest('#hbTypeMenu') || e.target.closest('#hbTypeTrigger')) return;
    toggleTypeMenu(false);
  });
  setType('personal');

  $('habitAdd').onclick = addHabit;
  $('habitName').addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });
  $('habitClose').onclick = () => { view.classList.remove('open'); document.body.style.overflow = ''; };
  $('habitBtn').onclick = () => {
    view.classList.add('open'); document.body.style.overflow = 'hidden';
    attach(); render();
  };

  view.addEventListener('click', e => {
    const t = e.target.closest('.hb-tick');   if (t)  return toggleToday(t.getAttribute('data-id'));
    const ok = e.target.closest('.hb-ok');    if (ok) return respond(ok.getAttribute('data-id'), true);
    const no = e.target.closest('.hb-no');    if (no) return respond(no.getAttribute('data-id'), false);
    const d  = e.target.closest('.hb-del');   if (d)  return removeHabit(d.getAttribute('data-id'));
    const fl = e.target.closest('[data-flt]');
    if (fl){ filter = fl.getAttribute('data-flt'); render(); return; }
    const dh = e.target.closest('[data-donetoggle]');
    if (dh){ doneCollapsed = !doneCollapsed; render(); return; }
    const ex = e.target.closest('.hb-expand');
    if (ex){ const id = ex.getAttribute('data-exp'); expanded = (expanded === id) ? null : id; render(); return; }
  });

  /* ana modül kullanıcı listesini besliyor; davet rozeti için
     alışkanlıkları panel açılmadan da dinlemeye başlıyoruz */
  return {
    setUsers(u){ users = u || {}; render(); },
    start(){ attach(); }
  };
}
