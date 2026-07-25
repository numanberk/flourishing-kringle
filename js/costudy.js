/* costudy.js — birlikte çalışma
   ------------------------------------------------------------------
   Veri:
     coStudy = { status:'pending'|'active', byUid, by, toUid,
                 at, startAt, endedBy, endedName }

   Akış:
     A "🤝" basar          → status:'pending', B'ye bildirim
     B "Katıl" der         → status:'active', startAt = SUNUCU saati
                             ve iki tarafta da normal sayaç başlar
     Biri bırakır          → status silinir, diğerine "mola verdi" bilgisi

   Saat kayması: iki telefonun saati birbirini tutmaz. Ortak sayaç
   Date.now() yerine sunucu saatine göre hesaplanıyor (.info/serverTimeOffset).
   Kişisel süre kaydı eskisi gibi kendi sayacından yürüyor — burada
   ayrı bir muhasebe yok, sadece eşgüdüm var.                         */

export function initCoStudy(ctx){
  const { db, auth, ref, set, update, onValue, serverTimestamp,
          toast, notifyMe, sendPush, popSound, escapeHtml,
          isStudying, startStudy } = ctx;

  const $ = id => document.getElementById(id);
  const box = $('coBanner');
  if (!box) return null;

  let co = null;
  let offset = 0;          // sunucu - yerel (ms)
  let tick = null;
  let prevStatus = null;
  let attached = false;

  const myUid = () => (auth.currentUser || {}).uid;
  const now = () => Date.now() + offset;

  function hhmmss(ms){
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  /* ---------- çizim ---------- */
  function render(){
    const me = myUid();
    if (!co || !co.status || !me){ hide(); return; }

    const mine = co.byUid === me;
    const other = escapeHtml((mine ? co.toName : co.by) || 'Arkadaşın');

    if (co.status === 'pending'){
      if (mine){
        show(`<div class="co-b-txt">
                <div class="co-b-title">Davet gönderildi</div>
                <div class="co-b-sub">${other} yanıtlaması bekleniyor…</div>
              </div>
              <div class="co-b-acts"><button data-co="cancel">İptal</button></div>`);
      } else {
        show(`<div class="co-b-txt">
                <div class="co-b-title">🤝 ${other} birlikte çalışmak istiyor</div>
                <div class="co-b-sub">Katılırsan ikinizin de sayacı başlar</div>
              </div>
              <div class="co-b-acts">
                <button class="primary" data-co="accept">Katıl</button>
                <button data-co="decline">Şimdi olmaz</button>
              </div>`);
      }
      stopTick();
      return;
    }

    if (co.status === 'active'){
      show(`<div class="co-b-txt">
              <div class="co-b-title"><span class="co-dot"></span>${other} ile birlikte</div>
              <div class="co-b-sub">Ortak süre</div>
            </div>
            <div class="co-clock" id="coClock">00:00:00</div>
            <div class="co-b-acts"><button data-co="end">Bitir</button></div>`);
      startTick();
    }
  }

  function show(html){ box.innerHTML = html; box.hidden = false; box.style.display = 'flex'; }
  function hide(){ box.hidden = true; box.style.display = 'none'; box.innerHTML = ''; stopTick(); }

  function startTick(){
    stopTick();
    const paint = () => {
      const el = $('coClock');
      if (!el || !co || co.status !== 'active') return;
      el.textContent = hhmmss(now() - (co.startAt || now()));
    };
    paint();
    tick = setInterval(paint, 1000);
  }
  function stopTick(){ if (tick){ clearInterval(tick); tick = null; } }

  /* ---------- eylemler ---------- */
  async function invite(toUid, toName){
    const u = auth.currentUser; if (!u) return;
    if (co && co.status){ toast('Zaten açık bir oturum var'); return; }
    try {
      await set(ref(db, 'coStudy'), {
        status: 'pending',
        byUid: u.uid, by: u.displayName || u.email,
        toUid: toUid || null, toName: toName || null,
        at: Date.now()
      });
      sendPush('coStudy', toUid, { report: true });
      toast('Davet gönderildi 🤝');
    } catch(e){ toast(e.message); }
  }

  async function accept(){
    try {
      await update(ref(db, 'coStudy'), { status: 'active', startAt: serverTimestamp() });
      if (!isStudying()) await startStudy();     // kendi sayacım da başlasın
    } catch(e){ toast(e.message); }
  }

  async function clear(reason){
    const u = auth.currentUser;
    try {
      if (reason === 'end' && co && co.status === 'active'){
        // diğer taraf ne olduğunu görsün diye kısa bir iz bırakıp siliyoruz
        await update(ref(db, 'coStudy'), {
          status: null, endedBy: u ? u.uid : null,
          endedName: u ? (u.displayName || u.email) : null, endedAt: Date.now()
        });
      }
      await set(ref(db, 'coStudy'), null);
    } catch(e){ toast(e.message); }
  }

  box.addEventListener('click', e => {
    const b = e.target.closest('[data-co]'); if (!b) return;
    const a = b.getAttribute('data-co');
    if (a === 'accept') return accept();
    if (a === 'decline' || a === 'cancel') return clear('cancel');
    if (a === 'end') return clear('end');
  });

  /* kartlardaki 🤝 düğmesi */
  document.addEventListener('click', e => {
    const b = e.target.closest('.co-btn'); if (!b) return;
    invite(b.getAttribute('data-uid'), b.getAttribute('data-name'));
  });

  /* ---------- bağlan ---------- */
  function attach(){
    if (attached) return; attached = true;

    onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });

    onValue(ref(db, 'coStudy'), s => {
      const prev = co; co = s.val();
      const me = myUid();
      const st = co && co.status;

      // yeni davet geldi
      if (st === 'pending' && prevStatus !== 'pending' && co.toUid === me){
        popSound(); notifyMe('🤝 Birlikte çalışalım', (co.by || 'Arkadaşın') + ' seni bekliyor');
      }
      // davet kabul edildi (daveti gönderen taraf)
      if (st === 'active' && prevStatus === 'pending' && co.byUid === me){
        toast('Katıldı — birlikte çalışıyorsunuz 🤝');
        popSound();
        if (!isStudying()) startStudy();
      }
      /* Oturum bitti. Kimin bitirdiği YENİ anlık görüntüde duruyor
         (status null'a çekilirken endedBy/endedName yazılıyor). */
      if (!st && prevStatus === 'active'){
        const info = co || prev;
        if (info && info.endedBy && info.endedBy !== me){
          toast((info.endedName || 'Arkadaşın') + ' mola verdi');
        }
      }
      prevStatus = st || null;
      render();
    }, err => console.error('coStudy read failed:', err && err.message));
  }

  /* kendi sayacımı durdurursam ortak oturum da bitsin */
  function onMyStudyStopped(){
    if (co && co.status === 'active') clear('end');
  }

  return { attach, onMyStudyStopped };
}
