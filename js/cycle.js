/* cycle.js — döngü takibi
   ------------------------------------------------------------------
   Veri düzeni (kişiye özel):
     cycle/{uid}/periods/{id}      { start:'YYYY-MM-DD', end:'YYYY-MM-DD'|null }
     cycle/{uid}/logs/{YYYY-MM-DD} { flow, mood, sym:[…] }

   Tahminler tamamen istemcide, geçmiş döngülerden hesaplanıyor —
   sunucuda saklanan bir tahmin yok. Veri yalnızca sahibinin uid'i
   altında duruyor; kural da o seviyede veriliyor.                    */

export function initCycle(ctx){
  const { db, auth, ref, set, update, onValue, toast } = ctx;
  const $ = id => document.getElementById(id);
  const view = $('cycleView');
  if (!view) return null;

  const DEF_CYCLE = 28, DEF_PERIOD = 5;
  let periods = {};        // id -> {start, end}
  let logs = {};           // 'YYYY-MM-DD' -> {...}
  let attached = false;
  let viewMonth = new Date(); viewMonth.setDate(1);
  let selDate = null;      // günlük için seçili gün

  /* ---------- tarih yardımcıları (yerel saat, UTC kaymasız) ---------- */
  const k = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
  const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const dayDiff = (a,b) => Math.round((parse(k(a)) - parse(k(b))) / 86400000);
  const TR_MONTH = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  const sortedPeriods = () => Object.entries(periods)
    .filter(([,p]) => p && p.start)
    .sort((a,b) => a[1].start < b[1].start ? 1 : -1);   // en yeni önce

  /* ---------- istatistik ---------- */
  function stats(){
    const list = sortedPeriods();
    const starts = list.map(([,p]) => p.start);
    const gaps = [];
    for (let i = 0; i < starts.length - 1; i++){
      const g = dayDiff(parse(starts[i]), parse(starts[i+1]));
      if (g > 10 && g < 90) gaps.push(g);          // aşırı uçları ele
    }
    const lens = list.map(([,p]) => p.end ? dayDiff(parse(p.end), parse(p.start)) + 1 : null)
                     .filter(n => n && n > 0 && n < 15);
    const avg = a => a.length ? Math.round(a.reduce((x,y)=>x+y,0) / a.length) : null;
    return {
      list,
      avgCycle:  avg(gaps.slice(0,6))  || DEF_CYCLE,
      avgPeriod: avg(lens.slice(0,6))  || DEF_PERIOD,
      count: list.length,
      hasData: gaps.length > 0
    };
  }

  const openPeriod = () => sortedPeriods().find(([,p]) => !p.end);

  /* ---------- tahmin ---------- */
  function predict(){
    const st = stats();
    const last = st.list[0];
    if (!last) return null;
    const lastStart = parse(last[1].start);
    const next = addDays(lastStart, st.avgCycle);
    const ovu  = addDays(next, -14);
    return {
      ...st,
      lastStart,
      nextStart: next,
      ovulation: ovu,
      fertileFrom: addDays(ovu, -5),
      fertileTo:   addDays(ovu, 1),
      cycleDay: dayDiff(new Date(), lastStart) + 1
    };
  }

  function phaseOf(p){
    if (!p) return '';
    const today = new Date();
    const inPeriod = !!dayOf(today).period;
    if (inPeriod) return 'Adet';
    const d = dayDiff(today, p.ovulation);
    if (d === 0) return 'Yumurtlama';
    if (today >= p.fertileFrom && today <= p.fertileTo) return 'Doğurgan';
    if (d < 0) return 'Foliküler';
    return 'Luteal';
  }

  /* ---------- bir günün durumu ---------- */
  function dayOf(date){
    const key = k(date);
    const out = { period:false, pred:false, fertile:false, ovu:false };
    for (const [,p] of sortedPeriods()){
      const s = parse(p.start);
      const e = p.end ? parse(p.end) : addDays(s, DEF_PERIOD - 1);
      if (date >= s && date <= e){ out.period = true; break; }
    }
    const pr = predict();
    if (pr && !out.period){
      // gelecekteki 6 döngü için tahmin
      for (let i = 0; i < 6; i++){
        const ns = addDays(pr.nextStart, i * pr.avgCycle);
        if (date >= ns && date < addDays(ns, pr.avgPeriod)) out.pred = true;
        const ov = addDays(ns, -14);
        if (k(date) === k(ov)) out.ovu = true;
        if (date >= addDays(ov,-5) && date <= addDays(ov,1)) out.fertile = true;
      }
    }
    return out;
  }

  /* ---------- çizim ---------- */
  function render(){
    const p = predict();

    // halka + gün
    const C = 2 * Math.PI * 88;
    const prog = $('cyProg');
    if (p && p.cycleDay > 0){
      const frac = Math.min(1, p.cycleDay / p.avgCycle);
      prog.style.strokeDashoffset = String(C * (1 - frac));
      $('cyDay').textContent = p.cycleDay;
      $('cyPhase').textContent = phaseOf(p);
      const left = dayDiff(p.nextStart, new Date());
      $('cyNext').innerHTML = left > 0
        ? `Tahmini adet <b>${left} gün</b> sonra · ${p.nextStart.getDate()} ${TR_MONTH[p.nextStart.getMonth()]}`
        : (left === 0 ? '<b>Bugün</b> bekleniyor' : `<b>${-left} gün</b> gecikti`);
    } else {
      prog.style.strokeDashoffset = String(C);
      $('cyDay').textContent = '—';
      $('cyPhase').textContent = '';
      $('cyNext').textContent = 'Başlamak için ilk günü kaydet';
    }

    // ana buton
    const open = openPeriod();
    $('cyToggle').textContent = open ? 'Adet bitti' : 'Adet başladı';

    renderCalendar();

    // istatistik
    const st = stats();
    $('cyStats').innerHTML = `
      <div class="cy-stat"><b>${st.hasData ? st.avgCycle : '—'}</b><span>ort. döngü</span></div>
      <div class="cy-stat"><b>${st.avgPeriod || '—'}</b><span>ort. süre</span></div>
      <div class="cy-stat"><b>${st.count}</b><span>kayıt</span></div>`;

    renderLog();
    renderHistory();
  }

  function renderCalendar(){
    $('cyMonth').textContent = TR_MONTH[viewMonth.getMonth()] + ' ' + viewMonth.getFullYear();
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const days = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;          // pazartesi başlangıç
    const todayK = k(new Date());
    let html = '';
    for (let i = 0; i < lead; i++) html += '<button class="cy-cell blank"></button>';
    for (let d = 1; d <= days; d++){
      const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
      const st = dayOf(date);
      const cls = ['cy-cell'];
      if (st.period) cls.push('period');
      else if (st.ovu) cls.push('ovu');
      else if (st.pred) cls.push('pred');
      else if (st.fertile) cls.push('fertile');
      if (k(date) === todayK) cls.push('today');
      if (selDate === k(date)) cls.push('sel');
      if (date > new Date()) cls.push('future');
      html += `<button class="${cls.join(' ')}" data-d="${k(date)}">${d}</button>`;
    }
    $('cyGrid').innerHTML = html;
  }

  const FLOW = [['light','Hafif'],['medium','Orta'],['heavy','Yoğun']];
  const MOOD = [['happy','😊'],['calm','🙂'],['tired','😴'],['sad','😔'],['irritable','😤']];
  const SYM  = [['kramp','Kramp'],['bas','Baş ağrısı'],['sisme','Şişkinlik'],['sirt','Sırt ağrısı'],['istah','İştah'],['sivilce','Sivilce']];

  function renderLog(){
    const key = selDate || k(new Date());
    const l = logs[key] || {};
    $('cyLogTitle').textContent = key === k(new Date())
      ? 'Bugün' : parse(key).getDate() + ' ' + TR_MONTH[parse(key).getMonth()];
    $('cyFlow').innerHTML = FLOW.map(([v,t]) =>
      `<button class="cy-chip ${l.flow===v?'on':''}" data-f="${v}">${t}</button>`).join('');
    $('cyMood').innerHTML = MOOD.map(([v,t]) =>
      `<button class="cy-chip ${l.mood===v?'on':''}" data-m="${v}" title="${v}">${t}</button>`).join('');
    const sym = l.sym || [];
    $('cySym').innerHTML = SYM.map(([v,t]) =>
      `<button class="cy-chip ${sym.includes(v)?'on':''}" data-s="${v}">${t}</button>`).join('');
  }

  function renderHistory(){
    const list = sortedPeriods().slice(0, 6);
    if (!list.length){ $('cyHistory').innerHTML = ''; return; }
    $('cyHistory').innerHTML = list.map(([id,p]) => {
      const s = parse(p.start);
      const len = p.end ? dayDiff(parse(p.end), s) + 1 : null;
      return `<div class="cy-hrow">
        <span>${s.getDate()} ${TR_MONTH[s.getMonth()]} ${s.getFullYear()}</span>
        <span class="muted">${len ? len + ' gün' : 'sürüyor'}</span>
        <button class="cy-del small" data-id="${id}" title="Sil">✕</button>
      </div>`;
    }).join('');
  }

  /* ---------- yazma ---------- */
  const uid = () => (auth.currentUser || {}).uid;

  async function togglePeriod(dateKey){
    const u = uid(); if (!u) return;
    const day = dateKey || k(new Date());
    const open = openPeriod();
    try {
      if (open){
        if (parse(day) < parse(open[1].start)){ toast('Bitiş, başlangıçtan önce olamaz'); return; }
        await update(ref(db, `cycle/${u}/periods/${open[0]}`), { end: day });
      } else {
        const id = 'p' + Date.now().toString(36);
        await set(ref(db, `cycle/${u}/periods/${id}`), { start: day, end: null });
      }
    } catch(e){ toast(e.message); }
  }

  async function setLog(patch){
    const u = uid(); if (!u) return;
    const key = selDate || k(new Date());
    try { await update(ref(db, `cycle/${u}/logs/${key}`), patch); }
    catch(e){ toast(e.message); }
  }

  /* ---------- olaylar ---------- */
  $('cyToggle').onclick = () => togglePeriod(selDate);
  $('cyPickDate').onclick = () => {
    toast(selDate ? 'Takvimden gün seç, sonra kaydet' : 'Takvimden bir gün seç');
  };
  $('cyPrev').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()-1, 1); renderCalendar(); };
  $('cyNext2').onclick = () => { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth()+1, 1); renderCalendar(); };
  $('cycleClose').onclick = close;

  view.addEventListener('click', async e => {
    const cell = e.target.closest('.cy-cell');
    if (cell && !cell.classList.contains('blank')){
      const d = cell.getAttribute('data-d');
      selDate = (selDate === d) ? null : d;
      renderCalendar(); renderLog();
      return;
    }
    const f = e.target.closest('[data-f]');
    if (f){ const v = f.getAttribute('data-f');
      const cur = (logs[selDate || k(new Date())] || {}).flow;
      return setLog({ flow: cur === v ? null : v }); }
    const m = e.target.closest('[data-m]');
    if (m){ const v = m.getAttribute('data-m');
      const cur = (logs[selDate || k(new Date())] || {}).mood;
      return setLog({ mood: cur === v ? null : v }); }
    const sy = e.target.closest('[data-s]');
    if (sy){
      const v = sy.getAttribute('data-s');
      const cur = ((logs[selDate || k(new Date())] || {}).sym) || [];
      const next = cur.includes(v) ? cur.filter(x => x !== v) : cur.concat(v);
      return setLog({ sym: next.length ? next : null });
    }
    const del = e.target.closest('.cy-del');
    if (del){
      if (!confirm('Bu kayıt silinsin mi?')) return;
      const u = uid(); if (!u) return;
      try { await set(ref(db, `cycle/${u}/periods/${del.getAttribute('data-id')}`), null); }
      catch(err){ toast(err.message); }
    }
  });

  function attach(){
    const u = uid(); if (!u || attached) return;
    attached = true;
    onValue(ref(db, `cycle/${u}/periods`), s => { periods = s.val() || {}; render(); },
      err => console.error('cycle read failed:', err && err.message));
    onValue(ref(db, `cycle/${u}/logs`), s => { logs = s.val() || {}; renderLog(); },
      err => console.error('cycle logs read failed:', err && err.message));
  }

  function open(){
    view.classList.add('open');
    document.body.style.overflow = 'hidden';
    viewMonth = new Date(); viewMonth.setDate(1);
    selDate = null;
    attach(); render();
  }
  function close(){ view.classList.remove('open'); document.body.style.overflow = ''; }

  return { open, close };
}
