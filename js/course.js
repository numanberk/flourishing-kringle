/* course.js — birlikte takip edilen kurslar (Udemy vb.)
   ------------------------------------------------------------------
   Veri:
     courses/{id}                  { name, total, by, byUid, at }
     courseProgress/{uid}/{id}     { ep, at }

   Önemli: ilerleme HERKESE AYRI. Kurs tanımı ortak, ama kaçıncı
   bölümde olduğunuz kendi uid'inizin altında duruyor — bu yüzden
   birbirinizin ilerlemesini ezmeniz mümkün değil. Kural da tam o
   seviyede veriliyor.                                                */

export function initCourse(ctx){
  const { db, auth, ref, set, update, onValue, toast, escapeHtml } = ctx;
  const $ = id => document.getElementById(id);
  if (!$('csList')) return null;

  let courses = {};
  let progress = {};      // uid -> { courseId: {ep, at} }
  let users = {};
  let attached = false;

  const myUid = () => (auth.currentUser || {}).uid;
  const nameOf = u => (users[u] || {}).displayName || 'Arkadaşın';
  const epOf = (uid, id) => ((progress[uid] || {})[id] || {}).ep || 0;

  function render(){
    const me = myUid(); if (!me) return;
    const list = Object.entries(courses).sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
    $('csEmpty').style.display = list.length ? 'none' : '';

    const others = Object.keys(users).filter(u => u !== me);

    $('csList').innerHTML = list.map(([id, c]) => {
      const total = c.total || 0;
      const mine = epOf(me, id);
      const pct = total ? Math.min(100, Math.round(mine / total * 100)) : 0;

      // karşı tarafın çubuğu — kim önde, kaç bölüm fark
      const rows = others.map(u => {
        const e = epOf(u, id);
        const p = total ? Math.min(100, Math.round(e / total * 100)) : 0;
        const diff = mine - e;
        const tag = diff > 0 ? `<span class="cs-ahead">${diff} önde</span>`
                  : diff < 0 ? `<span class="cs-behind">${-diff} geride</span>`
                  : `<span class="cs-even">berabersiniz</span>`;
        return `<div class="cs-row">
            <span class="cs-who">${escapeHtml(nameOf(u))}</span>
            <span class="cs-bar"><i style="width:${p}%"></i></span>
            <span class="cs-ep">${e}${total ? '/' + total : ''}</span>
          </div>
          <div class="cs-diff">${tag}</div>`;
      }).join('');

      return `<div class="cs-item">
        <div class="cs-top">
          <span class="cs-name">${escapeHtml(c.name)}</span>
          ${c.byUid === me ? `<button class="cs-del small" data-id="${id}" title="Sil">✕</button>` : ''}
        </div>

        <div class="cs-row me">
          <span class="cs-who">Sen</span>
          <span class="cs-bar"><i style="width:${pct}%"></i></span>
          <span class="cs-ep">${mine}${total ? '/' + total : ''}</span>
        </div>

        <div class="cs-ctrl">
          <button class="cs-minus" data-id="${id}" ${mine <= 0 ? 'disabled' : ''}>−</button>
          <input class="cs-jump" data-id="${id}" type="number" min="0" ${total ? 'max="' + total + '"' : ''} value="${mine}">
          <button class="cs-plus" data-id="${id}" ${total && mine >= total ? 'disabled' : ''}>+</button>
          <span class="cs-pct">%${pct}</span>
        </div>

        ${rows}
      </div>`;
    }).join('');
  }

  /* ---- yazma: yalnızca kendi ilerlememize ---- */
  async function setEp(id, ep){
    const me = myUid(); if (!me) return;
    const c = courses[id] || {};
    const v = Math.max(0, Math.min(c.total || 9999, Math.round(ep) || 0));
    try { await update(ref(db, `courseProgress/${me}/${id}`), { ep: v, at: Date.now() }); }
    catch(e){ toast(e.message); }
  }

  async function addCourse(){
    const u = auth.currentUser; if (!u) return;
    const name = $('csName').value.trim();
    if (!name){ $('csHint').textContent = 'Kurs adı gerekli'; return; }
    const total = parseInt($('csTotal').value, 10) || 0;
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await set(ref(db, `courses/${id}`), {
        name, total: total || null,
        by: u.displayName || u.email, byUid: u.uid, at: Date.now()
      });
      $('csName').value = ''; $('csTotal').value = ''; $('csHint').textContent = '';
      toast('Kurs eklendi 🎓');
    } catch(e){ $('csHint').textContent = e.message; }
  }

  async function removeCourse(id){
    const ask = window.ask ? window.ask : async m => window.confirm(m);
    if (!await ask('Bu kurs silinsin mi?')) return;
    try { await set(ref(db, `courses/${id}`), null); }
    catch(e){ toast(e.message); }
  }

  /* ---- olaylar ---- */
  const pane = $('paneCourse');
  pane.addEventListener('click', e => {
    const p = e.target.closest('.cs-plus');
    if (p){ const id = p.getAttribute('data-id'); return setEp(id, epOf(myUid(), id) + 1); }
    const m = e.target.closest('.cs-minus');
    if (m){ const id = m.getAttribute('data-id'); return setEp(id, epOf(myUid(), id) - 1); }
    const d = e.target.closest('.cs-del');
    if (d) return removeCourse(d.getAttribute('data-id'));
  });
  pane.addEventListener('change', e => {
    const j = e.target.closest('.cs-jump');
    if (j) setEp(j.getAttribute('data-id'), parseInt(j.value, 10));
  });
  $('csAdd').onclick = addCourse;
  $('csName').addEventListener('keydown', e => { if (e.key === 'Enter') addCourse(); });

  function attach(){
    if (attached) return; attached = true;
    onValue(ref(db, 'courses'), s => { courses = s.val() || {}; render(); },
      err => console.error('courses read failed:', err && err.message));
    onValue(ref(db, 'courseProgress'), s => { progress = s.val() || {}; render(); },
      err => console.error('courseProgress read failed:', err && err.message));
  }

  return {
    attach,
    setUsers(u){ users = u || {}; render(); }
  };
}
