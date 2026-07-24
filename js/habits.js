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
  const { db, auth, ref, set, update, onValue, toast, confetti, sendPush, escapeHtml } = ctx;

  const $ = id => document.getElementById(id);
  const view = $('habitView');
  if (!view) return;

  let habits = {};      // tüm alışkanlık tanımları
  let logs = {};        // habitLog/{uid} → { habitId: { date: ts } }
  let users = {};       // uid → displayName (ana modülden besleniyor)
  let attached = false;

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

  const nameOf = u => (users[u] || {}).displayName || 'Arkadaşın';

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

    $('habitList').innerHTML = list.map(([id, h]) => {
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

      return `<div class="hb-item">
        <div class="hb-top">
          <span style="font-size:20px">${escapeHtml(h.emoji || '🎯')}</span>
          <span class="hb-name">${escapeHtml(h.name)}</span>
          <span class="hb-kind">${h.type === 'shared' ? 'ortak' : 'kişisel'}</span>
          ${h.byUid === me ? `<button class="hb-del small" data-id="${id}" title="Sil">✕</button>` : ''}
          <button class="hb-tick ${done ? 'on' : ''}" data-id="${id}">${done ? '✔' : ''}</button>
        </div>
        <div class="hb-week">${week}</div>
        <div class="hb-streak"><span>Sen: <b>${streak(entry)}</b> gün</span>${other}</div>
      </div>`;
    }).join('');
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
    const type = $('habitType').value;
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
    if (!confirm('Bu alışkanlık silinsin mi?')) return;
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
  });

  /* ana modül kullanıcı listesini besliyor; davet rozeti için
     alışkanlıkları panel açılmadan da dinlemeye başlıyoruz */
  return {
    setUsers(u){ users = u || {}; render(); },
    start(){ attach(); }
  };
}
