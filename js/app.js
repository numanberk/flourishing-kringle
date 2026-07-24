import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, onDisconnect, push, query, limitToLast } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import { initHabits } from "./habits.js";

/* ======= Firebase ======= */
const firebaseConfig = {
  apiKey: "AIzaSyAhddopD10UBhXtjXkvzhRn1EmYxKNIsYw",
  authDomain: "studywithme-6e234.firebaseapp.com",
  databaseURL: "https://studywithme-6e234-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "studywithme-6e234",
  storageBucket: "studywithme-6e234.firebasestorage.app",
  messagingSenderId: "145454196147",
  appId: "1:145454196147:web:866e5e4a4cb959c17157c6"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

/* ---- bridge: let the birthday album/notes (classic script below) reuse Firebase ---- */
window.fb = { db, auth, ref, update, get, onValue };
window.dispatchEvent(new Event('fb-ready'));
onAuthStateChanged(auth, function (u) {
  window.dispatchEvent(new CustomEvent('sb-auth', { detail: { uid: u ? u.uid : null, email: u ? u.email : null } }));
});

/* ---------- Utils ---------- */
/* E-posta da kaynakta düz yazı durmuyor (spam taramalarına yem olmasın):
   sadece SHA-256 özeti var; giriş yapan hesabınki özetlenip kıyaslanır. */
const SPECIAL_EMAIL_HASH = 'a69fb19f07cbf2989aa9ba3e465ee0920cfd7e10c8459d544aa8155054aab893';
let isSpecialUser = false;
async function sha256Hex(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function checkSpecial(email){
  try { isSpecialUser = (await sha256Hex((email || '').toLowerCase())) === SPECIAL_EMAIL_HASH; }
  catch(e){ isSpecialUser = false; }
  window.__special = isSpecialUser;   // doğum günü betiği de bunu okur
}
const msToHHMMSS = ms => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(t / 3600)).padStart(2, '0');
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};
/* Tüm gün hesapları Türkiye saatine göre (cihazın saat dilimi ne olursa olsun) —
   doğum günü tarafı zaten Europe/Istanbul kullanıyordu, ikisi artık aynı. */
const APP_TZ = 'Europe/Istanbul';
const todayKey = (d = new Date()) => {
  try { return d.toLocaleDateString('en-CA', { timeZone: APP_TZ }); }   // YYYY-MM-DD
  catch(e){
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
};
const initials = (name='') => {
  const parts = name.trim().split(/\s+/);
  if(!parts[0]) return '?';
  return ((parts[0][0]||'') + (parts[1]?.[0]||'')).toUpperCase();
};
const hashHue = (s='')=>{
  let h=0; for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))>>>0;
  return h % 360;
};
/* http(s) = Storage'daki foto, data: = eski kayıtlar (geriye dönük uyumluluk) */
const isAvatarSrc = s => typeof s === 'string' && (/^https?:\/\//.test(s) || /^data:image\//.test(s));
const avatarHTML = (name, key, size=32, varName='--h', img=null) => {
  const H = hashHue((key||'') + (name||'')); // deterministic per user
  const inner = isAvatarSrc(img) ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : initials(name);
  return `<span class="avatar" style="${varName}: ${H}; width:${size}px;height:${size}px;">${inner}</span>`;
};

/* ---------- App State ---------- */
let presenceInstalled = false;
let latestUsers = {};
let latestPresence = {};
let uiTick = null;

const els = {
  authView: document.getElementById("authView"),
  appView: document.getElementById("appView"),
  authArea: document.getElementById("authArea"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginBtn: document.getElementById("loginBtn"),
  toggleStudyBtn: document.getElementById("toggleStudyBtn"),
  usersList: document.getElementById("usersList"),
  leaderboard: document.getElementById("leaderboard"),
  themeToggle: document.getElementById("themeToggle"),
  collabWrap: document.getElementById("collabWrap"),
  collabVideoCard: document.getElementById("collabVideoCard"),
  collabVideo: document.getElementById("collabVideo"),
  videoPlayPause: document.getElementById("videoPlayPause"),
  videoMuteUnmute: document.getElementById("videoMuteUnmute"),
  videoOverlay: document.getElementById("videoOverlay"),
  overlayPlay: document.getElementById("overlayPlay")
};
Object.assign(els, {
  studyGroup: document.getElementById("studyGroup"),
  focusView: document.getElementById("focusView"),
  focusTime: document.getElementById("focusTime"),
  focusToggleBtn: document.getElementById("focusToggleBtn"),
  focusExitBtn: document.getElementById("focusExitBtn"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  chatSend: document.getElementById("chatSend")
});
Object.assign(els, {
  subjectSelect: document.getElementById("subjectSelect"),
  subjectAdd: document.getElementById("subjectAdd"),
  subjTrigger: document.getElementById("subjTrigger"),
  subjLabel: document.getElementById("subjLabel"),
  subjMenu: document.getElementById("subjMenu"),
  pomoPill: document.getElementById("pomoPill"),
  pomoPanel: document.getElementById("pomoPanel"),
  pomoWork: document.getElementById("pomoWork"),
  pomoBreak: document.getElementById("pomoBreak"),
  pomoStartBtn: document.getElementById("pomoStartBtn"),
  notifBtn: document.getElementById("notifBtn"),
  chatBadge: document.getElementById("chatBadge"),
  chatCard: document.getElementById("chatCard"),
  appDock: document.getElementById("appDock"),
  startMenuBtn: document.getElementById("startMenuBtn"),
  startMenu: document.getElementById("startMenu"),
  libBtn: document.getElementById("libBtn"),
  libView: document.getElementById("libView"),
  libClose: document.getElementById("libClose"),
  libTitle: document.getElementById("libTitle"),
  libFile: document.getElementById("libFile"),
  libAddBtn: document.getElementById("libAddBtn"),
  libHint: document.getElementById("libHint"),
  libList: document.getElementById("libList"),
  libEmpty: document.getElementById("libEmpty"),
  chatTyping: document.getElementById("chatTyping"),
  chatTypingText: document.getElementById("chatTypingText"),
  watchBtn: document.getElementById("watchBtn"),
  watchView: document.getElementById("watchView"),
  watchClose: document.getElementById("watchClose"),
  meetBox: document.getElementById("meetBox"),
  watchNudgeBtn: document.getElementById("watchNudgeBtn"),
  wnBoard: document.getElementById("wnBoard"),
  wnListOpen: document.getElementById("wnListOpen"),
  wnListDone: document.getElementById("wnListDone"),
  wnDoneWrap: document.getElementById("wnDoneWrap"),
  wnDoneToggle: document.getElementById("wnDoneToggle"),
  wnDoneCount: document.getElementById("wnDoneCount"),
  wnDoneChev: document.getElementById("wnDoneChev"),
  wnNewInput: document.getElementById("wnNewInput"),
  wnBgBtn: document.getElementById("wnBgBtn"),
  wnBgPal: document.getElementById("wnBgPal"),
  profView: document.getElementById("profView"),
  profClose: document.getElementById("profClose"),
  profAvatar: document.getElementById("profAvatar"),
  profAvatarBtn: document.getElementById("profAvatarBtn"),
  profAvatarFile: document.getElementById("profAvatarFile"),
  profName: document.getElementById("profName"),
  profNameSave: document.getElementById("profNameSave"),
  profStats: document.getElementById("profStats"),
  profLogout: document.getElementById("profLogout")
});

/* ---------------- THEME: init + toggle (persist) ---------------- */
const THEME_KEY = "sb_theme";
function applyTheme(theme){
  const root = document.documentElement;
  const dark = theme === "dark";
  root.classList.toggle("theme-dark", dark);
  if (els.themeToggle){
    els.themeToggle.textContent = dark ? "☀️ Açık" : "🌙 Koyu";
    els.themeToggle.title = dark ? "Açık temaya geç" : "Koyu temaya geç";
  }
}
(function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  if(saved){ applyTheme(saved); }
  else {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
})();
if (els.themeToggle) els.themeToggle.onclick = () => {
  const root = document.documentElement;
  const next = root.classList.contains("theme-dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
};

/* ---------------- Presence helpers ---------------- */
function setStatus(study) {
  els.toggleStudyBtn.textContent = study ? "Çalışmayı Bitir" : "Çalışmaya Başla";
  const myAnim = document.getElementById("myAnim");
  if (myAnim) myAnim.style.display = study ? "inline-flex" : "none";
  if (els.focusToggleBtn) els.focusToggleBtn.textContent = study ? "Çalışmayı Bitir" : "Çalışmaya Başla";
  if (els.subjectSelect) els.subjectSelect.disabled = study;
  if (els.subjTrigger) els.subjTrigger.disabled = study;
  if (els.subjectAdd) els.subjectAdd.disabled = study;
  if (study && els.subjMenu && els.subjMenu.style.display !== 'none') toggleSubjMenu(false);
  if (els.startMenu && els.startMenu.style.display !== 'none') renderStartMenu();
}
function setPresence(on) { /* başlıktaki çevrimiçi etiketi kaldırıldı; kartlarda gösteriliyor */ }
function installPresence(uid) {
  if (presenceInstalled) return;
  presenceInstalled = true;
  onValue(ref(db, ".info/connected"), snap => {
    if (snap.val()) {
      const meRef = ref(db, `presence/${uid}`);
      update(meRef, { online: true, lastOnline: Date.now() });
      onDisconnect(meRef).update({ online: false, lastOnline: Date.now() });
      // bağlantı koparsa "Çalışıyor" rozeti sonsuza kadar asılı kalmasın
      onDisconnect(ref(db, `users/${uid}`)).update({ studying: false });
      setPresence(true);
    } else setPresence(false);
  });
}

/* ---------------- Auth actions ---------------- */
els.loginBtn.onclick = async () => {
  try { await signInWithEmailAndPassword(auth, els.loginEmail.value, els.loginPassword.value); }
  catch (e) { toast(e.message); }
};

function renderAuthChip(user) {
  const name = user.displayName || user.email;
  const av = ((latestUsers || {})[user.uid] || {}).avatar || null;
  els.authArea.innerHTML = `
    <button class="tag auth-chip" id="authChipBtn" title="Profil">
      ${avatarHTML(name, user.uid, 20, '--h', av)} <span class="name">${escapeHtml(name)}</span>
    </button>`;
  const b = document.getElementById('authChipBtn');
  if (b) b.onclick = () => { if (typeof openProf === 'function') openProf(); };
}

/* ---------------- App lifecycle ---------------- */
onAuthStateChanged(auth, async user => {
  if (user) {
    await checkSpecial(user.email);
    els.authView.style.display = "none";
    els.appView.style.display = "block";
    if (els.appDock) els.appDock.style.display = "";
    if (els.studyGroup) els.studyGroup.style.display = "";
    renderAuthChip(user);
    installPresence(user.uid);

    const uref = ref(db, `users/${user.uid}`);
    const snap = await get(uref);
    if (!snap.exists()) {
      await update(uref, {
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        studying: false,
        totals: { allTimeMs: 0, perDay: {} },
        streak: 0,
        dailyTargetMin: 120
      });
    }

    await migrateSessions(user.uid);
    await reconcileStudy(user.uid);
    attachGlobalListeners();
    attachSessions(user.uid);
    attachNudges(user.uid);
    attachWatch();
    renderNotifBtn();
    if (pushOn() && 'Notification' in window && Notification.permission === 'granted') subscribePush();
    initVideoDefaults();
    startUITicker();   // live timers independent of DB changes
  } else {
    stopUITicker();
    stopBeat();
    latestUsers = {};
    latestPresence = {};
    els.usersList.innerHTML = els.leaderboard.innerHTML = "";
    els.authView.style.display = "grid";
    els.appView.style.display = "none";
    els.authArea.innerHTML = "";
    if (els.appDock) els.appDock.style.display = "none";
    if (els.profView) els.profView.classList.remove("open");
    if (els.startMenu) els.startMenu.style.display = "none";
    if (els.libView) els.libView.classList.remove("open");
    if (els.watchView) els.watchView.classList.remove("open");
    if (els.pomoPanel) els.pomoPanel.style.display = "none";
    if (els.studyGroup) els.studyGroup.style.display = "none";
    if (els.focusView) { els.focusView.classList.remove("open"); document.body.style.overflow = ""; }
    try { pomoAbort(); closeStats(); } catch(e){}
  }
});

/* ---------------- Global listeners (populate snapshots) ---------------- */
let habitsApi = null;
try {
  habitsApi = initHabits({
    db, auth, ref, set, update, onValue,
    toast, confetti, sendPush, escapeHtml
  });
} catch(e){ console.error('habits init failed:', e && e.message); }

function attachGlobalListeners() {
  onValue(ref(db, "users"), usersSnap => {
    latestUsers = usersSnap.val() || {};
    draw();
    attachTheirSessions();
    if (habitsApi) habitsApi.setUsers(latestUsers);
  }, err => console.error("users read failed — check Realtime Database rules:", err && err.message));
  if (habitsApi) habitsApi.start();     // davet rozeti panel açılmadan da görünsün
  onValue(ref(db, "presence"), presenceSnap => {
    latestPresence = presenceSnap.val() || {};
    draw();
  }, err => console.error("presence read failed — check Realtime Database rules:", err && err.message));
  attachChat();
}

/* ---------------- Local 1s UI ticker ---------------- */
/* Çalışırken 60 sn'de bir "hâlâ buradayım" damgası. Sekme kapanınca
   bu damga durur; hem karşı taraf donmuş sayaç görmez hem de bir dahaki
   girişte süreyi damgaya kadar sayabiliriz. */
const BEAT_MS = 60000;
const STALE_MS = 3 * BEAT_MS;   // 3 dk sessizlik = bağlantı kopmuş say
let beatTimer = null;
function startBeat(){
  if (beatTimer) return;
  const tick = () => {
    const uid = (auth.currentUser || {}).uid;
    if (!uid || !amStudying()) return;
    update(ref(db, `users/${uid}`), { lastBeat: Date.now() }).catch(() => {});
  };
  tick();
  beatTimer = setInterval(tick, BEAT_MS);
}
function stopBeat(){ if (beatTimer){ clearInterval(beatTimer); beatTimer = null; } }

/* Bir oturum canlı mı, yoksa sekme kapanıp öylece mi kalmış? */
function liveStudy(u){
  if (!u || !u.studying || !u.currentStartAt) return false;
  const beat = u.lastBeat || u.currentStartAt;
  return (Date.now() - beat) < STALE_MS;
}

/* Girişte: yarım kalmış oturumu kapat ve süreyi son kalp atışına kadar yaz. */
async function reconcileStudy(uid){
  try {
    const snap = await get(ref(db, `users/${uid}`));
    const u = snap.val() || {};
    /* studying bayrağına bakmıyoruz: bağlantı koptuğunda onDisconnect onu
       zaten false yapıyor, ama süre hâlâ yazılmayı bekliyor. */
    if (!u.currentStartAt) return;
    const beat = u.lastBeat || u.currentStartAt;
    if (Date.now() - beat < STALE_MS){
      // kalp atışı taze → oturum aslında sürüyor, sadece sayfa yenilenmiş
      await update(ref(db, `users/${uid}`), { studying: true, lastBeat: Date.now() });
      startBeat();
      return;
    }
    const endAt = Math.max(u.currentStartAt, u.lastBeat || 0);
    const elapsed = Math.max(0, endAt - u.currentStartAt);
    const totals = u.totals || { allTimeMs: 0, perDay: {} };
    const perDay = totals.perDay || {};
    const day = todayKey(new Date(u.currentStartAt));
    perDay[day] = (perDay[day] || 0) + elapsed;
    await update(ref(db, `users/${uid}`), {
      studying: false, currentStartAt: null, currentSubject: null, lastBeat: null,
      totals: { allTimeMs: (totals.allTimeMs || 0) + elapsed, perDay: prunePerDay(perDay) }
    });
    if (elapsed > 15000){
      await push(ref(db, `sessions/${uid}`), {
        subject: u.currentSubject || '', startAt: u.currentStartAt,
        endAt, ms: elapsed, day, recovered: true
      });
      toast('Yarım kalan oturum kaydedildi: ' + msToHHMMSS(elapsed));
    }
  } catch(e){ console.error('reconcileStudy failed:', e && e.message); }
}

/* perDay sonsuza kadar büyüyordu; son 120 günü tut. */
function prunePerDay(perDay){
  const keys = Object.keys(perDay || {}).sort();
  if (keys.length <= 120) return perDay;
  const keep = keys.slice(-120);
  const out = {};
  keep.forEach(k => out[k] = perDay[k]);
  return out;
}

function startUITicker(){
  if (uiTick) return;
  uiTick = setInterval(draw, 1000);
}
function stopUITicker(){
  if (uiTick){ clearInterval(uiTick); uiTick = null; }
}

/* ---------------- Render from latest snapshots ---------------- */
let prevStudyingMap = null;
let prevOnlineMap = null;
let prevGoalMap = null;
let lastChipSig = '';
const onlineToastAt = {};
function userCardHTML(d){
  const safeName = escapeHtml(d.name);
  return `
    <div class="user-card ${d.studying ? 'is-studying' : ''}" data-uid="${d.uid}" data-sig="${escapeHtml(d.sig)}">
      <div class="spaced">
        <div style="display:flex;align-items:center;gap:8px">
          ${avatarHTML(d.name, d.uid, 32, '--h', d.avatar)}
          <h4 style="margin:0">${safeName}
            ${d.studying ? '<span class="anim-eq" aria-label="studying"><i></i><i></i><i></i></span>' : ''}
          </h4>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${!d.isMe ? `<button class="nudge-btn" data-uid="${d.uid}" title="Dürt">👉 Dürt</button>` : ''}
          <span class="tag"><span class="status-dot ${d.isOnline ? 'dot-on' : 'dot-off'}"></span> ${d.isOnline ? 'çevrimiçi' : 'çevrimdışı'}</span>
        </div>
      </div>
      <div class="row" style="margin-top:8px; gap:8px; align-items:center;">
        <span class="pill ${d.studying ? 'study' : 'idle'}">${d.studying ? 'Çalışıyor' : 'Boşta'}</span>
        ${d.studying && d.subject ? `<span class="tag">📚 ${escapeHtml(d.subject)}</span>` : ''}
        <span class="muted">Şu an: <span data-f="cur">${msToHHMMSS(d.currentMs)}</span></span>
      </div>
      <div class="row" style="margin-top:10px; gap:14px; align-items:center; flex-wrap:nowrap;">
        ${ringHTML(d.pct)}
        <div style="min-width:0">
          <div class="muted">Bugün: <b data-f="today">${msToHHMMSS(d.todayMs)}</b> / ${d.targetMin} dk hedef</div>
          <div class="muted">Toplam: <b data-f="all">${msToHHMMSS(d.allTimeMs)}</b> · Seri: <b>${d.streak} 🔥</b></div>
        </div>
      </div>
      ${badgesHTML(d.streak)}
    </div>`;
}
function draw(){
  const users = latestUsers || {};
  const presence = latestPresence || {};
  const today = todayKey();
  const myUid = auth.currentUser?.uid;
  const myEmail = (auth.currentUser?.email || '').toLowerCase();

  const lb = [];
  const studyingList = [];
  const uids = Object.keys(users);
  const cardData = {};
  const listEl = els.usersList;
  let structureChanged = listEl.querySelectorAll('.user-card[data-uid]').length !== uids.length;

  uids.forEach(uid => {
    const u = users[uid];
    const isOnline = !!(presence[uid] && presence[uid].online);
    const name = u.displayName || "Kullanıcı";
    const studying = liveStudy(u);          // bayat (kopmuş) oturum canlı sayılmaz
    const startAt = u.currentStartAt;
    const perDay = u.totals?.perDay || {};
    const todayMsBase = perDay[today] || 0;
    const allTimeMsBase = u.totals?.allTimeMs || 0;
    let currentMs = 0;
    if (studying && startAt) currentMs = Math.max(0, Date.now() - startAt);
    const todayMs = todayMsBase + (studying ? currentMs : 0);
    const allTimeMs = allTimeMsBase + (studying ? currentMs : 0);
    if (studying) studyingList.push({ uid, name });
    const targetMin = u.dailyTargetMin || 120;
    const pct = todayMs / (targetMin * 60000);
    const avatar = isAvatarSrc(u.avatar) ? u.avatar : null;
    lb.push({ uid, name: escapeHtml(name), ms: todayMs, done: pct >= 1 });
    // yapısal imza: bunlar değişmedikçe kart YENİDEN ÇİZİLMEZ (hover titremesi çözümü)
    const shownStreak = liveStreak(u);
    const sig = [name, studying, isOnline, u.currentSubject || '', shownStreak, targetMin, pct >= 1, avatar || '', uid !== myUid].join('¦');
    cardData[uid] = { uid, name, studying, isOnline, currentMs, todayMs, allTimeMs, targetMin, pct, avatar, subject: u.currentSubject, streak: shownStreak, sig, isMe: uid === myUid };
    const cardEl = listEl.querySelector(`.user-card[data-uid="${uid}"]`);
    if (!cardEl || cardEl.dataset.sig !== sig) structureChanged = true;
  });

  if (structureChanged){
    listEl.innerHTML = uids.map(uid => userCardHTML(cardData[uid])).join('');
  } else {
    // sadece sayıları güncelle — hover animasyonu bozulmadan sürer
    uids.forEach(uid => {
      const d = cardData[uid];
      const cardEl = listEl.querySelector(`.user-card[data-uid="${uid}"]`);
      if (!cardEl) return;
      const setF = (f, v) => { const el = cardEl.querySelector(`[data-f="${f}"]`); if (el) el.textContent = v; };
      setF('cur', msToHHMMSS(d.currentMs));
      setF('today', msToHHMMSS(d.todayMs));
      setF('all', msToHHMMSS(d.allTimeMs));
      const ringTxt = cardEl.querySelector('.ring text');
      if (ringTxt) ringTxt.textContent = Math.min(999, Math.round(d.pct * 100)) + '%';
      const arcs = cardEl.querySelectorAll('.ring circle');
      if (arcs.length > 1){
        const r = 16, c = 2 * Math.PI * r;
        arcs[1].setAttribute('stroke-dashoffset', (c * (1 - Math.min(1, d.pct))).toFixed(1));
      }
    });
  }

  lb.sort((a, b) => b.ms - a.ms);
  const lbSig = lb.map(i => i.uid + '¦' + i.name + '¦' + (i.done ? 1 : 0)).join('||');
  if (els.leaderboard.dataset.sig !== lbSig || !els.leaderboard.children.length){
    els.leaderboard.dataset.sig = lbSig;
    els.leaderboard.innerHTML = lb.map(i => `<li data-uid="${i.uid}"><span>${i.name}${i.done ? ' 🎯' : ''}</span><span data-f="t">${msToHHMMSS(i.ms)}</span></li>`).join('');
  } else {
    lb.forEach(i => {
      const el = els.leaderboard.querySelector(`li[data-uid="${i.uid}"] [data-f="t"]`);
      if (el) el.textContent = msToHHMMSS(i.ms);
    });
  }

  // başlık çipini (avatar/ad) değişince tazele
  if (auth.currentUser && users[myUid]){
    const meU = users[myUid];
    const chipSig = (meU.displayName || '') + '¦' + (meU.avatar || '');
    if (chipSig !== lastChipSig){ lastChipSig = chipSig; renderAuthChip(auth.currentUser); }
  }
  renderProfLive();

  // partner started studying → notification + toast
  const nowMap = {};
  Object.keys(users).forEach(uid => nowMap[uid] = !!users[uid].studying);
  if (prevStudyingMap){
    Object.keys(nowMap).forEach(uid => {
      if (uid !== myUid && nowMap[uid] && !prevStudyingMap[uid]){
        const nm = users[uid].displayName || 'Arkadaşın';
        toast(nm + ' çalışmaya başladı 📚');
        notifyMe(nm + ' çalışmaya başladı 📚', 'Sen de katıl!');
      }
    });
  }
  prevStudyingMap = nowMap;

  // partner hit their daily goal → confetti for them too 🎉
  const goalMap = {};
  Object.keys(users).forEach(uid => {
    const u = users[uid];
    const t = (u.dailyTargetMin || 120) * 60000;
    const pd = (u.totals && u.totals.perDay) || {};
    const live = (u.studying && u.currentStartAt) ? Math.max(0, Date.now() - u.currentStartAt) : 0;
    goalMap[uid] = ((pd[today] || 0) + live) >= t;
  });
  if (prevGoalMap){
    Object.keys(goalMap).forEach(uid => {
      if (uid === myUid || !goalMap[uid] || prevGoalMap[uid]) return;
      const nm = users[uid].displayName || 'Arkadaşın';
      toast(nm + ' günlük hedefini tamamladı! 🎉');
      notifyMe(nm + ' hedefini tamamladı 🎉', 'Tebrik etmeyi unutma!');
      confetti(); chime();
    });
  }
  prevGoalMap = goalMap;

  // partner came online → little pop (60 sn'de en fazla bir kez)
  const onMap = {};
  Object.keys(users).forEach(uid => onMap[uid] = !!(presence[uid] && presence[uid].online));
  if (prevOnlineMap){
    Object.keys(onMap).forEach(uid => {
      if (uid !== myUid && onMap[uid] && !prevOnlineMap[uid]){
        const nowT = Date.now();
        if (!onlineToastAt[uid] || nowT - onlineToastAt[uid] > 60000){
          onlineToastAt[uid] = nowT;
          toast((users[uid].displayName || 'Arkadaşın') + ' çevrimiçi 👋');
          popSound();
        }
      }
    });
  }
  prevOnlineMap = onMap;

  // daily goal reached (celebrate once per day)
  if (myUid && users[myUid]){
    const t = (users[myUid].dailyTargetMin || 120) * 60000;
    if (myTodayMs() >= t && localStorage.getItem('sb_goal_day') !== today){
      localStorage.setItem('sb_goal_day', today);
      toast('Günlük hedefini tamamladın! 🎉');
      notifyMe('Hedef tamam! 🎉', 'Bugünkü çalışma hedefine ulaştın.');
      chime();
      confetti();
      sendPush('goal');
      try { navigator.vibrate && navigator.vibrate([80, 40, 80, 40, 160]); } catch(e){}
    }
  }

  refreshSubjects();
  renderTyping();

  // header: collab avatars + status pill + video routing
  updateCollab(studyingList, myUid);
  setStatus(studyingList.some(u => u.uid === myUid));
  setVideoByState(studyingList, myUid, myEmail);
  updateFocus();
  renderStatsLive();
}

function collabAv(uid, name){
  const a = ((latestUsers || {})[uid] || {}).avatar;
  return isAvatarSrc(a) ? `<img src="${escapeHtml(a)}" alt="" loading="lazy">` : initials(name);
}
function updateCollab(studyingList, myUid){
  const meIdx = studyingList.findIndex(u => u.uid === myUid);
  const others = studyingList.filter(u => u.uid !== myUid);
  if (meIdx !== -1 && others.length > 0){
    const partner = others[0];
    const me = studyingList[meIdx];
    const meH = hashHue((me.uid||'')+(me.name||''));
    const pH = hashHue((partner.uid||'')+(partner.name||''));
    els.collabWrap.innerHTML = `
      <div class="collab" title="Birlikte çalışıyor">
        <div class="wire">
          <svg viewBox="0 0 120 16" preserveAspectRatio="none" aria-hidden="true">
            <path d="M2 8 C 30 2, 90 14, 118 8"></path>
          </svg>
        </div>
        <div class="av" style="--h1:${meH}">${collabAv(me.uid, me.name)}</div>
        <div class="av partner" style="--h2:${pH}">${collabAv(partner.uid, partner.name)}</div>
      </div>`;
  } else {
    els.collabWrap.innerHTML = '';
  }
}

/* ---------------- Video routing logic ---------------- */
let videoMin = localStorage.getItem('sb_vidmin') === '1';
let collabList = null;        // keşfedilen collab listesi (null = henüz bakılmadı)
let collabDiscovering = false;
let collabIdx = 0;
let collabPlaying = false;

async function discoverCollabs(){
  if (collabList !== null || collabDiscovering) return;
  collabDiscovering = true;
  const found = [];
  for (let i = 1; i <= 50; i++){
    try {
      const r = await fetch('/videos/collab' + i + '.mp4', { method: 'HEAD' });
      if (!r.ok) break;
      found.push('/videos/collab' + i + '.mp4');
    } catch(e){ break; }
  }
  // numaralı dosya yoksa eski tek collab.mp4'e geri düş
  if (!found.length && els.collabVideo) found.push(els.collabVideo.dataset.srcCollab);
  collabList = found;
  collabDiscovering = false;
}

function swapVideoTo(src){
  const v = els.collabVideo;
  v.pause();
  v.src = src;
  v.load();
  v.play().then(() => {
    els.videoOverlay.classList.remove('show');
    if (videoMin) v.pause();
  }).catch(() => {
    if (!videoMin) els.videoOverlay.classList.add('show'); // needs user gesture
  });
  els.videoPlayPause.textContent = 'Durdur';
  els.videoMuteUnmute.textContent = v.muted ? 'Sesi Aç' : 'Sesi Kapat';
}

function applyVideoMin(){
  const v = els.collabVideo;
  els.collabVideoCard.classList.toggle('min', videoMin);
  const b = document.getElementById('videoMinBtn');
  if (b) b.textContent = videoMin ? '▢ Göster' : '— Küçült';
  if (videoMin) v.pause();
  else if (els.collabVideoCard.classList.contains('active')) v.play().catch(() => {});
}
function initVideoDefaults(){
  const v = els.collabVideo;
  v.loop = true;
  v.muted = true;
  discoverCollabs();
  const minBtn = document.getElementById('videoMinBtn');
  if (minBtn) minBtn.onclick = () => {
    videoMin = !videoMin;
    localStorage.setItem('sb_vidmin', videoMin ? '1' : '0');
    applyVideoMin();
  };
  applyVideoMin();
  v.addEventListener('ended', () => {
    // playlist modu: sıradaki collab videosuna geç (sonuncudan sonra başa döner)
    if (!collabPlaying || !collabList || collabList.length < 2) return;
    collabIdx = (collabIdx + 1) % collabList.length;
    swapVideoTo(collabList[collabIdx]);
  });
  els.overlayPlay.onclick = () => {
    v.play().then(()=> els.videoOverlay.classList.remove('show')).catch(()=>{});
  };
  els.videoPlayPause.onclick = () => {
    if (v.paused) { v.play(); els.videoPlayPause.textContent='Durdur'; }
    else { v.pause(); els.videoPlayPause.textContent='Oynat'; }
  };
  els.videoMuteUnmute.onclick = () => {
    v.muted = !v.muted;
    els.videoMuteUnmute.textContent = v.muted ? 'Sesi Aç' : 'Sesi Kapat';
  };
}

function setVideoByState(studyingList, myUid, myEmail){
  const card = els.collabVideoCard;
  const v = els.collabVideo;

  const meStudying = studyingList.some(u => u.uid === myUid);
  const othersStudying = studyingList.filter(u => u.uid !== myUid);
  const collab = meStudying && othersStudying.length > 0;

  if (!meStudying){
    // Not studying -> hide big video
    card.classList.remove('active');
    v.pause();
    els.videoOverlay.classList.remove('show');
    collabPlaying = false;
    return;
  }

  if (collab){
    const list = (collabList && collabList.length) ? collabList : [v.dataset.srcCollab];
    const absList = list.map(s => new URL(s, location.origin).href);
    v.loop = list.length === 1;   // tek video ise eskisi gibi döngü; birden çoksa 'ended' sıradakine geçer
    if (!collabPlaying || !absList.includes(v.currentSrc)){
      collabPlaying = true;
      collabIdx = 0;
      swapVideoTo(list[0]);
    }
  } else {
    collabPlaying = false;
    v.loop = true;
    const nextSrc = isSpecialUser ? v.dataset.srcNumanSolo : v.dataset.srcOthersSolo;
    const absoluteNext = new URL(nextSrc, location.origin).href;
    if (v.currentSrc !== absoluteNext) swapVideoTo(nextSrc);
  }

  card.classList.add('active');
  if (videoMin) v.pause();
}

/* ---------------- Study toggle handler ---------------- */
async function toggleStudy(){
  const uid = (auth.currentUser||{}).uid; if(!uid) return;
  const uref = ref(db, `users/${uid}`);
  const snap = await get(uref); const u = snap.val() || {};
  const now = Date.now();
  if (!u.studying){
    const subj = (els.subjectSelect && els.subjectSelect.value) || '';
    await update(uref, { studying:true, currentStartAt: now, currentSubject: subj || null, lastBeat: now });
    startBeat();
    sendPush('study');
  } else {
    const startAt = u.currentStartAt || now;
    const elapsed = Math.max(0, now - startAt);
    const totals = u.totals || { allTimeMs:0, perDay:{} };
    const perDay = totals.perDay || {};
    const day = todayKey(new Date(startAt));
    perDay[day] = (perDay[day] || 0) + elapsed;
    const allTimeMs = (totals.allTimeMs || 0) + elapsed;

    const stoppedDay = todayKey(new Date());
    let newStreak = u.streak || 0;
    const lastDay = u.lastStudyDay;
    if (!lastDay) newStreak = 1;
    else {
      const last = new Date(lastDay+'T12:00:00');
      const cur = new Date(stoppedDay+'T12:00:00');
      const diff = Math.round((cur - last)/86400000);
      if (diff === 1) newStreak = (newStreak||0) + 1;
      else if (diff > 1) newStreak = 1;
    }

    stopBeat();
    await update(uref, {
      studying:false,
      currentStartAt:null,
      currentSubject:null,
      lastBeat:null,
      totals:{ allTimeMs, perDay: prunePerDay(perDay) },
      lastStudyDay: stoppedDay,
      streak: newStreak
    });

    // session log (skip accidental <15s taps)
    if (elapsed > 15000){
      try {
        await push(ref(db, `sessions/${uid}`), {
          subject: u.currentSubject || '',
          startAt, endAt: now, ms: elapsed, day
        });
      } catch(e){ console.error('session log failed:', e && e.message); }
    }
  }
}
els.toggleStudyBtn.onclick = () => { (typeof pomo !== 'undefined' && pomo.active) ? pomoStop() : toggleStudy(); };

/* ---- başlat menüsü: pomodoro (sadece oturum başında) + odak (her zaman) ---- */
function renderStartMenu(){
  if (!els.startMenu) return;
  const studying = amStudying();
  let html = '';
  if (pomo.active){
    html += '<button data-sact="pomostop">⏹ <span>Pomodoro\u2019yu bitir</span></button>';
  } else if (!studying){
    html += '<button data-sact="pomo">🍅 <span>Pomodoro ile başla</span></button>';
  } else {
    html += '<div class="sm-note">🍅 Pomodoro yalnızca oturum başında seçilebilir</div>';
  }
  html += '<hr>';
  html += '<button data-sact="focus">🎯 <span>Odak modu</span></button>';
  els.startMenu.innerHTML = html;
}
function toggleStartMenu(force){
  if (!els.startMenu) return;
  const open = els.startMenu.style.display !== 'none';
  const next = (force === undefined) ? !open : force;
  if (next) renderStartMenu();
  els.startMenu.style.display = next ? '' : 'none';
}
if (els.startMenuBtn) els.startMenuBtn.onclick = e => { e.stopPropagation(); toggleStartMenu(); };
if (els.startMenu) els.startMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-sact]'); if (!b) return;
  const a = b.getAttribute('data-sact');
  toggleStartMenu(false);
  if (a === 'pomo') togglePomoPanel();
  else if (a === 'pomostop') pomoStop();
  else if (a === 'focus') openFocus();
});
document.addEventListener('click', e => {
  if (!els.startMenu || els.startMenu.style.display === 'none') return;
  if (e.target.closest('#startMenu') || e.target.closest('#startMenuBtn')) return;
  toggleStartMenu(false);
});

/* ---------------- Focus mode (distraction-free timer) ---------------- */
function myTodayMs(){
  const u = (latestUsers || {})[(auth.currentUser||{}).uid] || {};
  const today = todayKey();
  const base = (u.totals && u.totals.perDay && u.totals.perDay[today]) || 0;
  const live = (u.studying && u.currentStartAt) ? Math.max(0, Date.now() - u.currentStartAt) : 0;
  return base + live;
}
function updateFocus(){
  if (!els.focusView || !els.focusView.classList.contains('open')) return;
  if (typeof pomo !== 'undefined' && pomo.active){
    const left = Math.max(0, pomo.endsAt - Date.now());
    els.focusTime.textContent = (pomo.phase === 'work' ? '🍅 ' : '☕ ') + msToHHMMSS(left);
  } else {
    els.focusTime.textContent = msToHHMMSS(myTodayMs());
  }
}
function openFocus(){
  els.focusView.classList.add('open');
  document.body.style.overflow = 'hidden';
  updateFocus();
}
function closeFocus(){
  els.focusView.classList.remove('open');
  document.body.style.overflow = '';
}
if (els.focusExitBtn) els.focusExitBtn.onclick = closeFocus;
if (els.focusToggleBtn) els.focusToggleBtn.onclick = () => { (typeof pomo !== 'undefined' && pomo.active) ? pomoStop() : toggleStudy(); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && els.focusView && els.focusView.classList.contains('open')) closeFocus();
});

/* ---------------- Global chat ---------------- */
let chatAttached = false;
const chatEsc = s => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chatTime(ms){ try { return new Date(ms).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }); } catch(e){ return ''; } }
function chatDayLabel(ms){
  try { return fmtLogDay(todayKey(new Date(ms || 0))); }
  catch(e){ return ''; }
}
let latestChat = {};
function renderChat(val){
  if (!els.chatMessages) return;
  const myUid = (auth.currentUser || {}).uid;
  const items = Object.entries(val || {}).map(([k,v]) => Object.assign({ k }, v)).sort((a,b) => (a.at||0)-(b.at||0));

  // unread badge (messages from the other person since last look)
  const seen = chatSeen();
  const unread = items.filter(m => (m.at || 0) > seen && m.uid !== myUid).length;
  if (els.chatBadge){
    els.chatBadge.textContent = unread;
    els.chatBadge.style.display = unread ? '' : 'none';
  }

  if (!items.length){ els.chatMessages.innerHTML = '<div class="chat-empty">Henüz mesaj yok. İlk mesajı sen yaz! ✍️</div>'; return; }
  const nearBottom = els.chatMessages.scrollHeight - els.chatMessages.scrollTop - els.chatMessages.clientHeight < 60;
  let lastDay = '';
  els.chatMessages.innerHTML = items.map(m => {
    const dayKey = new Date(m.at || 0).toDateString();
    let divider = '';
    if (dayKey !== lastDay){
      lastDay = dayKey;
      divider = '<div class="chat-day"><span>' + chatDayLabel(m.at) + '</span></div>';
    }
    return divider
    + '<div class="chat-msg">'
    + '<div class="who"><span>' + (chatEsc(m.name) || 'Biri') + '</span><span class="when">' + chatTime(m.at) + '</span></div>'
    + '<div class="body">' + chatEsc(m.text) + '</div>'
    + reactionsHTML(m)
    + '</div>';
  }).join('');
  if (nearBottom) els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}
async function sendChat(){
  const u = auth.currentUser; if (!u) return;
  const text = (els.chatInput.value || '').trim(); if (!text) return;
  els.chatInput.value = '';
  try {
    await push(ref(db, 'chat'), { uid: u.uid, name: u.displayName || u.email, text: text, at: Date.now() });
    markChatRead();
    if (typeof setTyping === 'function') setTyping(false);
  }
  catch(e){ toast(e.message); }
}
function attachChat(){
  if (chatAttached || !els.chatMessages) return;
  chatAttached = true;
  onValue(query(ref(db, 'chat'), limitToLast(100)), s => { latestChat = s.val() || {}; renderChat(latestChat); });
}
if (els.chatSend) els.chatSend.onclick = sendChat;
if (els.chatInput) els.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); }
});

/* ================================================================
   NEW FEATURES — subjects, session log, pomodoro, goals & badges,
   stats modal, notifications, nudges, chat reactions.
   (This replaces a duplicate presence installer that was here;
   installPresence() above already handles presence.)
   ================================================================ */

/* ---------- helpers ---------- */
function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(msg){
  let t = document.getElementById('sbToast');
  if (!t){ t = document.createElement('div'); t.id = 'sbToast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
window.toast = toast;   // diğer script bloklarından da erişilsin
/* Tek paylaşılan ses bağlamı — her seste yenisini açmak tarayıcı
   sınırına (Chrome'da 6) takılıp sesleri sessizce öldürüyordu. */
let _actx = null;
function audioCtx(){
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!_actx || _actx.state === 'closed') _actx = new C();
    if (_actx.state === 'suspended') _actx.resume().catch(() => {});
    return _actx;
  } catch(e){ return null; }
}
function chime(){
  try {
    const ctx = audioCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    [0, .22, .44].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 830 + i * 130;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(.001, now + t);
      g.gain.exponentialRampToValueAtTime(.22, now + t + .03);
      g.gain.exponentialRampToValueAtTime(.001, now + t + .3);
      o.start(now + t); o.stop(now + t + .32);
    });
  } catch(e){}
}

/* ---------- micro-interactions: ripple + confetti ---------- */
const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('pointerdown', e => {
  if (reducedMotion()) return;
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const rect = b.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const r = document.createElement('span');
  r.className = 'sb-ripple';
  r.style.width = r.style.height = size + 'px';
  r.style.left = (e.clientX - rect.left - size / 2) + 'px';
  r.style.top = (e.clientY - rect.top - size / 2) + 'px';
  b.appendChild(r);
  setTimeout(() => r.remove(), 600);
});
function confetti(){
  if (reducedMotion()) return;
  const colors = ['#7a5af8', '#ff5db1', '#4cd676', '#ffb167', '#6ec1ff'];
  for (let i = 0; i < 36; i++){
    const p = document.createElement('span');
    p.className = 'sb-confetti';
    p.style.left = (8 + Math.random() * 84) + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
    p.style.animationDelay = (Math.random() * 0.35) + 's';
    p.style.animationDuration = (1.6 + Math.random() * 1.3) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3400);
  }
}
function popSound(){
  try {
    const ctx = audioCtx(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + .09);
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.14, ctx.currentTime + .02);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14);
    o.start(); o.stop(ctx.currentTime + .16);
  } catch(e){}
}
function floatEmoji(x, y, emoji){
  if (reducedMotion()) return;
  const s = document.createElement('span');
  s.className = 'sb-float';
  s.textContent = emoji;
  s.style.left = x + 'px';
  s.style.top = y + 'px';
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 950);
}

/* ---------- user-card helpers (used inside draw) ---------- */
function ringHTML(pct){
  const p = Math.max(0, Math.min(1, pct || 0));
  const r = 16, c = 2 * Math.PI * r, off = c * (1 - p);
  return `<svg class="ring" width="42" height="42" viewBox="0 0 42 42" aria-label="Günlük hedef">
    <circle cx="21" cy="21" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
    <circle cx="21" cy="21" r="${r}" fill="none" stroke="${p >= 1 ? 'var(--ok)' : 'var(--acc)'}" stroke-width="4"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 21 21)"/>
    <text x="21" y="25" text-anchor="middle" font-size="10" fill="var(--text)">${Math.min(999, Math.round((pct || 0) * 100))}%</text>
  </svg>`;
}
const BADGE_STEPS = [[100,'💎'],[50,'🏆'],[30,'🌟'],[14,'🚀'],[7,'🥇'],[3,'✨']];
function badgesHTML(streak){
  const earned = BADGE_STEPS.filter(([n]) => (streak || 0) >= n)
    .map(([n, e]) => `<span class="badge" title="${n} gün seri">${e} ${n}</span>`);
  return earned.length ? `<div class="badges">${earned.join('')}</div>` : '';
}

/* ---------- subjects (custom, per user) ---------- */
let subjectsCacheJSON = '';
function refreshSubjects(){
  if (!els.subjectSelect) return;
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  const subj = me.subjects || {};
  const json = JSON.stringify(subj);
  if (json === subjectsCacheJSON) return;   // avoid resetting selection every second
  subjectsCacheJSON = json;
  const cur = els.subjectSelect.value;
  els.subjectSelect.innerHTML = '<option value="">Ders seç…</option>' +
    Object.values(subj).map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join('');
  if ([...els.subjectSelect.options].some(o => o.value === cur)) els.subjectSelect.value = cur;
  syncSubjLabel();
}

/* özel ders menüsü: mobilde tarayıcı seçicisi yerine site temasında liste */
function syncSubjLabel(){
  if (!els.subjLabel) return;
  const v = els.subjectSelect ? els.subjectSelect.value : '';
  els.subjLabel.textContent = v || 'Ders seç';
  els.subjLabel.classList.toggle('empty', !v);
}
function renderSubjMenu(){
  if (!els.subjMenu) return;
  const opts = [...(els.subjectSelect ? els.subjectSelect.options : [])];
  const cur = els.subjectSelect ? els.subjectSelect.value : '';
  const real = opts.filter(o => o.value);
  let html = `<button data-sv="" class="${cur ? '' : 'on'}">🚫 <span>Dersiz</span></button>`;
  html += real.length
    ? real.map(o => `<button data-sv="${escapeHtml(o.value)}" class="${o.value === cur ? 'on' : ''}">📖 <span>${escapeHtml(o.value)}</span></button>`).join('')
    : '<div class="sm-empty">Henüz ders yok — ＋ ile ekle</div>';
  els.subjMenu.innerHTML = html;
}
function toggleSubjMenu(force){
  if (!els.subjMenu) return;
  const open = els.subjMenu.style.display !== 'none';
  const next = (force === undefined) ? !open : force;
  if (next) renderSubjMenu();
  els.subjMenu.style.display = next ? '' : 'none';
  const f = els.subjMenu.closest('.subj-field');
  if (f) f.classList.toggle('menu-open', next);
}
if (els.subjTrigger) els.subjTrigger.onclick = e => {
  e.stopPropagation();
  if (els.subjTrigger.disabled) return;
  toggleSubjMenu();
};
if (els.subjMenu) els.subjMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-sv]'); if (!b) return;
  els.subjectSelect.value = b.getAttribute('data-sv');
  syncSubjLabel();
  toggleSubjMenu(false);
});
document.addEventListener('click', e => {
  if (!els.subjMenu || els.subjMenu.style.display === 'none') return;
  if (e.target.closest('#subjMenu') || e.target.closest('#subjTrigger')) return;
  toggleSubjMenu(false);
});
async function addSubject(raw){
  const uid = (auth.currentUser || {}).uid; if (!uid) return;
  const name = (raw || '').trim().slice(0, 30);
  if (!name) return;
  const me = (latestUsers || {})[uid] || {};
  const hit = Object.values(me.subjects || {}).find(s => (s.name || '').toLowerCase() === name.toLowerCase());
  if (hit){ els.subjectSelect.value = hit.name; syncSubjLabel(); toast('Bu ders zaten var 🙂'); return; }
  try {
    await push(ref(db, `users/${uid}/subjects`), { name });
    setTimeout(() => { subjectsCacheJSON = ''; refreshSubjects(); els.subjectSelect.value = name; syncSubjLabel(); renderSubjManage(); }, 350);
    toast('Ders eklendi: ' + name + ' 📚');
  } catch(e){ toast(e.message); }
}
function openSubjModal(){
  const m = document.getElementById('subjModal');
  const i = document.getElementById('subjNewName');
  if (!m) return;
  i.value = '';
  m.classList.add('open');
  setTimeout(() => i.focus(), 60);
}
function closeSubjModal(){
  const m = document.getElementById('subjModal');
  if (m) m.classList.remove('open');
}
if (els.subjectAdd) els.subjectAdd.onclick = () => { if (auth.currentUser) openSubjModal(); };
(function wireSubjModal(){
  const m = document.getElementById('subjModal'); if (!m) return;
  const i = document.getElementById('subjNewName');
  const save = () => { addSubject(i.value); closeSubjModal(); };
  document.getElementById('subjAddSave').onclick = save;
  document.getElementById('subjAddCancel').onclick = closeSubjModal;
  document.getElementById('subjAddClose').onclick = closeSubjModal;
  i.addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); save(); }
    else if (e.key === 'Escape'){ e.stopPropagation(); closeSubjModal(); }
  });
  m.addEventListener('click', e => { if (e.target === m) closeSubjModal(); });
})();

/* ---------- session log data ---------- */
let mySessions = {};
let theirSessions = {};
let theirUid = null;
let sessionsAttached = false;
function attachSessions(uid){
  if (sessionsAttached) return;
  sessionsAttached = true;
  onValue(query(ref(db, `sessions/${uid}`), limitToLast(400)), s => {
    mySessions = s.val() || {};
    if (statsOpen){ renderSessionLog(); renderSubjBreakdown(); }
    if (typeof sdSubject !== 'undefined' && sdSubject) sdRender();
  }, err => console.error('sessions read failed:', err && err.message));
}

/* Karşı tarafın oturumları — ders karşılaştırması için. users listesi
   gelince bir kez bağlanıyor. */
function attachTheirSessions(){
  const me = (auth.currentUser || {}).uid; if (!me) return;
  const other = Object.keys(latestUsers || {}).find(u => u !== me);
  if (!other || other === theirUid) return;
  theirUid = other;
  onValue(query(ref(db, `sessions/${other}`), limitToLast(400)), s => {
    theirSessions = s.val() || {};
    if (statsOpen) renderSubjBreakdown();
  }, err => console.error('partner sessions read failed:', err && err.message));
}

/* Tek seferlik taşıma: eski kayıtlar users/{uid}/sessions altındaydı. */
async function migrateSessions(uid){
  try {
    if (localStorage.getItem('sb_sess_migrated') === '1') return;
    const old = await get(ref(db, `users/${uid}/sessions`));
    if (old.exists()){
      const cur = await get(ref(db, `sessions/${uid}`));
      const merged = Object.assign({}, cur.val() || {}, old.val() || {});
      await update(ref(db, `sessions/${uid}`), merged);
      await set(ref(db, `users/${uid}/sessions`), null);
    }
    localStorage.setItem('sb_sess_migrated', '1');
  } catch(e){ console.error('session migration failed:', e && e.message); }
}

/* ---------- pomodoro ---------- */
const pomo = { active:false, phase:null, endsAt:0, timer:null, busy:false };
const pomoCfg = {
  get work(){ return Math.min(180, Math.max(1, parseInt(localStorage.getItem('sb_pomo_w') || '25', 10) || 25)); },
  get brk(){ return Math.min(60, Math.max(1, parseInt(localStorage.getItem('sb_pomo_b') || '5', 10) || 5)); }
};
/* Seri yalnızca oturum BİTİNCE hesaplanıyordu; araya boş günler girince
   kartta eski (yanlış) sayı asılı kalıyordu. Çizim anında doğrula. */
function liveStreak(u){
  const n = (u && u.streak) || 0;
  if (!n) return 0;
  const last = u.lastStudyDay;
  if (!last) return 0;
  const t = todayKey();
  const y = todayKey(new Date(Date.now() - 86400000));
  if (last === t || last === y) return n;   // bugün ya da dün → seri ayakta
  return 0;                                  // arada boş gün var → kırılmış
}

function amStudying(){
  const u = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  return !!u.studying;
}
async function pomoStart(){
  pomo.active = true; pomo.phase = 'work';
  pomo.endsAt = Date.now() + pomoCfg.work * 60000;
  if (!amStudying()) await toggleStudy();
  clearInterval(pomo.timer);
  pomo.timer = setInterval(pomoTick, 500);
  renderPomoUI();
  toast(`Pomodoro başladı 🍅 ${pomoCfg.work} dk`);
}
async function pomoStop(){
  pomo.active = false; pomo.phase = null;
  clearInterval(pomo.timer); pomo.timer = null;
  if (amStudying()) await toggleStudy();
  renderPomoUI();
  toast('Pomodoro bitti 👋');
}
function pomoAbort(){ // logout: just kill the local timer
  pomo.active = false; pomo.phase = null;
  clearInterval(pomo.timer); pomo.timer = null;
  renderPomoUI();
}
async function pomoTick(){
  if (!pomo.active || pomo.busy) { renderPomoUI(); return; }
  const left = pomo.endsAt - Date.now();
  if (left <= 0){
    pomo.busy = true;
    try {
      chime();
      if (pomo.phase === 'work'){
        if (amStudying()) await toggleStudy();          // logs the session
        pomo.phase = 'break';
        pomo.endsAt = Date.now() + pomoCfg.brk * 60000;
        toast('Mola zamanı ☕');
        notifyMe('Mola zamanı ☕', pomoCfg.brk + ' dakika dinlen');
      } else {
        pomo.phase = 'work';
        pomo.endsAt = Date.now() + pomoCfg.work * 60000;
        if (!amStudying()) await toggleStudy();
        toast('Yeni pomodoro 🍅');
        notifyMe('Mola bitti 🍅', 'Çalışmaya dönme vakti!');
      }
    } finally { pomo.busy = false; }
  }
  renderPomoUI();
}
function renderPomoUI(){
  if (!els.pomoPill) return;
  if (!pomo.active){
    els.pomoPill.style.display = 'none';
    updateFocus();
    return;
  }
  const left = Math.max(0, pomo.endsAt - Date.now());
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor(left / 1000) % 60).padStart(2, '0');
  els.pomoPill.style.display = '';
  els.pomoPill.className = 'pill ' + (pomo.phase === 'work' ? 'study' : 'idle') + (left < 10000 && left > 0 ? ' urgent' : '');
  els.pomoPill.textContent = (pomo.phase === 'work' ? '🍅 ' : '☕ ') + mm + ':' + ss;
  updateFocus();
}
function togglePomoPanel(){
  if (!els.pomoPanel) return;
  const open = els.pomoPanel.style.display !== 'none';
  if (open){ els.pomoPanel.style.display = 'none'; return; }
  els.pomoWork.value = pomoCfg.work;
  els.pomoBreak.value = pomoCfg.brk;
  els.pomoPanel.style.display = '';
}
if (els.pomoStartBtn) els.pomoStartBtn.onclick = () => {
  localStorage.setItem('sb_pomo_w', String(parseInt(els.pomoWork.value, 10) || 25));
  localStorage.setItem('sb_pomo_b', String(parseInt(els.pomoBreak.value, 10) || 5));
  els.pomoPanel.style.display = 'none';
  pomoStart();
};
document.addEventListener('click', e => {
  if (!els.pomoPanel || els.pomoPanel.style.display === 'none') return;
  if (e.target.closest('#pomoPanel') || e.target.closest('#startMenuBtn') || e.target.closest('#startMenu')) return;
  els.pomoPanel.style.display = 'none';
});

/* ---------- push notifications (kilitli ekran, PWA) ---------- */
const PUSH_ENDPOINT = '/api/send-push';   // Cloudflare Pages Function
let swReg = null;
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').then(r => { swReg = r; }).catch(() => {});
}
const pushOn = () => localStorage.getItem('sb_push') === '1';
function urlB64ToUint8Array(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function subscribePush(){
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = swReg || await navigator.serviceWorker.ready;
    const r = await fetch(PUSH_ENDPOINT);
    const j = await r.json();
    if (!j.publicKey) return false;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(j.publicKey)
    });
    const uid = (auth.currentUser || {}).uid; if (!uid) return false;
    const key = btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-40);
    await update(ref(db, `pushSubs/${uid}/${key}`), {
      sub: JSON.parse(JSON.stringify(sub)),
      ua: navigator.userAgent.slice(0, 120),
      at: Date.now()
    });
    localStorage.setItem('sb_push', '1');
    /* Ölü abonelikler birikiyor: 60 günden eski, bu cihaza ait olmayan
       kayıtları temizle (kural gereği sadece kendi uid'imize yazabiliyoruz). */
    try {
      const snap = await get(ref(db, `pushSubs/${uid}`));
      const mine = snap.val() || {};
      const cutoff = Date.now() - 60 * 24 * 3600 * 1000;
      const dead = {};
      Object.entries(mine).forEach(([k, v]) => {
        if (k !== key && v && typeof v.at === 'number' && v.at < cutoff) dead[k] = null;
      });
      if (Object.keys(dead).length) await update(ref(db, `pushSubs/${uid}`), dead);
    } catch(e){}
    return true;
  } catch(e){ console.error('push subscribe failed:', e && e.message); return false; }
}
async function unsubscribePush(){
  try {
    localStorage.setItem('sb_push', '0');
    if (!('serviceWorker' in navigator)) return;
    const reg = swReg || await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub){
      const uid = (auth.currentUser || {}).uid;
      const key = btoa(sub.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-40);
      if (uid) await update(ref(db, `pushSubs/${uid}`), { [key]: null });
      await sub.unsubscribe();
    }
  } catch(e){}
}
function sendPush(type, toUid, opts){
  const u = auth.currentUser; if (!u) return;
  const quiet = !(opts && opts.report);
  fetch(PUSH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, from: u.displayName || u.email, fromUid: u.uid, toUid: toUid || null })
  })
  .then(r => r.json())
  .then(j => {
    if (quiet) return;
    if (j && j.sent > 0) toast('Bildirim ulaştı ✓');
    else toast('Ulaşamadım — karşı tarafta bildirim kapalı olabilir');
  })
  .catch(() => { if (!quiet) toast('Bildirim gönderilemedi'); });
}

/* ---------- browser notifications ---------- */
function notifOn(){
  return localStorage.getItem('sb_notif') === '1' && 'Notification' in window && Notification.permission === 'granted';
}
function notifyMe(title, body){
  if (!notifOn()) return;
  // Servis işçisi yalnızca sayfa odakta DEĞİLKEN bildirim gösteriyor;
  // o yüzden sadece o durumda ona bırak. Aksi halde ikisi de atlıyordu.
  if (pushOn() && !document.hasFocus()) return;
  try { new Notification(title, { body }); } catch(e){}
}
function renderNotifBtn(){
  if (els.notifBtn) els.notifBtn.textContent = notifOn() ? '🔔 Açık' : '🔕 Kapalı';
}
if (els.notifBtn) els.notifBtn.onclick = async () => {
  if (notifOn()){
    localStorage.setItem('sb_notif', '0');
    await unsubscribePush();
    toast('Bildirimler kapalı 🔕');
  } else {
    if (!('Notification' in window)){
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
      toast(ios && !standalone
        ? 'iPhone: Safari\u2019de Paylaş → "Ana Ekrana Ekle" yap, sonra uygulamayı açıp 🔔\u2019a bas'
        : 'Tarayıcın bildirim desteklemiyor');
      return;
    }
    const p = await Notification.requestPermission();
    if (p === 'granted'){
      localStorage.setItem('sb_notif', '1');
      const ok = await subscribePush();
      toast(ok ? 'Bildirimler açık 🔔 — site kapalıyken de gelir ✅' : 'Bildirimler açık 🔔 (yalnızca site açıkken)');
    }
    else toast('Bildirim izni verilmedi');
  }
  renderNotifBtn();
};

/* ---------- nudges (👉 Dürt) ---------- */
let nudgesAttached = false;
function attachNudges(uid){
  if (nudgesAttached) return;
  nudgesAttached = true;
  onValue(ref(db, `nudges/${uid}`), s => {
    const v = s.val(); if (!v) return;
    Object.entries(v).forEach(([k, n]) => {
      if (n.type === 'watch'){
        toast((n.from || 'Biri') + ' bişeyler izleyelim diyor 🎬🍿');
        notifyMe('🎬 Bişeyler izleyelim!', (n.from || 'Biri') + ' film gecesi istiyor');
      } else {
        toast((n.from || 'Biri') + ' seni dürttü 👉 Hadi çalışmaya!');
        notifyMe((n.from || 'Biri') + ' seni dürttü 👉', 'Hadi çalışmaya!');
      }
      chime();
      try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch(e){}
      update(ref(db, `nudges/${uid}`), { [k]: null }).catch(() => {});
    });
  }, err => console.error('nudges read failed:', err && err.message));
}
if (els.usersList) els.usersList.addEventListener('click', async e => {
  const b = e.target.closest('.nudge-btn'); if (!b) return;
  const to = b.getAttribute('data-uid');
  const me = auth.currentUser; if (!me || !to) return;
  try {
    await push(ref(db, `nudges/${to}`), { from: me.displayName || me.email, at: Date.now() });
    sendPush('nudge', to, { report: true });
    toast('Dürttün 👉');
  } catch(err){ toast(err.message); }
});

/* ---------- stats & session log modal ---------- */
let statsOpen = false, chartDays = 7, subjMode = 'today';
let statsOpenedAt = 0;
const easeOut = t => 1 - Math.pow(1 - t, 3);
function statsAnimFactor(){
  const el = Date.now() - statsOpenedAt;
  return el >= 750 ? 1 : easeOut(Math.max(0, el) / 750);
}
function openStats(){        // profil sayfası açılınca çağrılır
  statsOpen = true;
  statsOpenedAt = Date.now();
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  const ti = document.getElementById('targetInput');
  if (ti) ti.value = me.dailyTargetMin || 120;
  renderStats();
  (function loop(){        // sayılar 0'dan sayarak gelsin
    if (!statsOpen) return;
    renderTarget();
    if (statsAnimFactor() < 1) requestAnimationFrame(loop);
  })();
}
function closeStats(){ statsOpen = false; }
function renderStats(){        // heavy parts, on open / data change
  if (!statsOpen) return;
  renderTarget();
  renderBadgeRow();
  animateChart(chartDays);
  renderSubjBreakdown();
  renderSessionLog();
  renderSubjManage();
}
function renderStatsLive(){    // cheap live parts, every second from draw()
  if (!statsOpen) return;
  renderTarget();
  renderSubjBreakdown();
}
function renderTarget(){
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  const targetMin = me.dailyTargetMin || 120;
  const cur = myTodayMs();
  const f = statsAnimFactor();
  const pctFull = Math.min(100, Math.round(cur / (targetMin * 60000) * 100));
  const pct = Math.round(pctFull * f);
  const bar = document.getElementById('targetBar');
  if (!bar) return;
  bar.style.width = pct + '%';
  bar.style.background = pctFull >= 100 ? 'var(--ok)' : 'var(--acc)';
  const tt = document.getElementById('targetText');
  if (tt) tt.textContent =
    msToHHMMSS(Math.round(cur * f)) + ' / ' + targetMin + ' dk' + (pctFull >= 100 && f === 1 ? ' — tamamlandı! 🎉' : ' (%' + pct + ')');
}
function renderBadgeRow(){
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  const box = document.getElementById('badgeRow');
  if (box) box.innerHTML = badgesHTML(liveStreak(me));
}
function animateChart(days){
  const t0 = Date.now();
  (function loop(){
    if (!statsOpen) return;
    const f = Math.min(1, (Date.now() - t0) / 450);
    drawChart(days, easeOut(f));
    if (f < 1) requestAnimationFrame(loop);
  })();
}
function drawChart(days, grow = 1){
  const cv = document.getElementById('statChart');
  if (!cv) return;
  const cssW = cv.clientWidth || (cv.parentElement ? cv.parentElement.clientWidth : 600) || 600;
  const cssH = 180;
  const dpr = window.devicePixelRatio || 1;
  cv.width = cssW * dpr; cv.height = cssH * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const palette = ['#7a5af8', '#4cd676', '#ff5db1', '#ffb167'];
  const dayKeys = [], labels = [];
  for (let i = days - 1; i >= 0; i--){
    const d = new Date(Date.now() - i * 86400000);
    dayKeys.push(todayKey(d));
    labels.push(d.getDate());
  }
  const users = Object.entries(latestUsers || {});
  const series = users.map(([uid, u], i) => ({
    name: u.displayName || 'Kullanıcı',
    color: palette[i % palette.length],
    data: dayKeys.map(k => {
      let v = ((u.totals || {}).perDay || {})[k] || 0;
      if (k === todayKey() && u.studying && u.currentStartAt) v += Math.max(0, Date.now() - u.currentStartAt);
      return v;
    })
  }));
  const maxV = Math.max(3600000, ...series.flatMap(s => s.data));

  const padL = 32, padB = 18, padT = 8, padR = 6;
  const plotW = cssW - padL - padR, plotH = cssH - padT - padB;

  // hour gridlines
  ctx.font = '10px Inter, sans-serif';
  const hours = Math.ceil(maxV / 3600000);
  const step = hours > 8 ? Math.ceil(hours / 4) : (hours > 4 ? 2 : 1);
  for (let h = 0; h <= hours; h += step){
    const y = padT + plotH - (h * 3600000 / maxV) * plotH;
    ctx.strokeStyle = 'rgba(128,128,128,.22)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    ctx.fillStyle = 'rgba(128,128,128,.9)';
    ctx.fillText(h + 'sa', 4, y + 3);
  }

  const groupW = plotW / dayKeys.length;
  const barW = Math.max(3, Math.min(16, (groupW - 4) / Math.max(1, series.length)));
  dayKeys.forEach((k, di) => {
    series.forEach((s, si) => {
      const v = s.data[di];
      const bh = (v / maxV) * plotH * grow;
      const x = padL + di * groupW + (groupW - series.length * barW) / 2 + si * barW;
      ctx.fillStyle = s.color;
      ctx.fillRect(x, padT + plotH - bh, barW - 1, bh);
    });
    if (days <= 7 || di % 5 === 0){
      ctx.fillStyle = 'rgba(128,128,128,.9)';
      ctx.fillText(String(labels[di]), padL + di * groupW + groupW / 2 - 5, cssH - 5);
    }
  });
  document.getElementById('chartLegend').innerHTML =
    series.map(s => `<span style="color:${s.color}">■</span> ${escapeHtml(s.name)}`).join(' &nbsp; ');
}
function renderSubjBreakdown(){
  const box = document.getElementById('subjBreakdown');
  if (!box) return;
  const now = Date.now();
  const tKey = todayKey();
  const WIN = { today: 0, week: 7, month: 30, all: 0 };
  const inWindow = s => {
    if (subjMode === 'today') return (s.day || todayKey(new Date(s.startAt || now))) === tKey;
    if (subjMode === 'all') return true;
    return (s.endAt || 0) >= now - WIN[subjMode] * 86400000;
  };
  const agg = {}; let total = 0;
  Object.values(mySessions || {}).forEach(s => {
    if (inWindow(s)){
      const key = s.subject || '(dersiz)';
      agg[key] = (agg[key] || 0) + (s.ms || 0);
      total += s.ms || 0;
    }
  });
  // karşı tarafın aynı aralıktaki dersleri (karşılaştırma satırı için)
  const theirAgg = {};
  Object.values(theirSessions || {}).forEach(s => {
    if (inWindow(s)) theirAgg[s.subject || '(dersiz)'] = (theirAgg[s.subject || '(dersiz)'] || 0) + (s.ms || 0);
  });
  const theirName = escapeHtml(((latestUsers || {})[theirUid] || {}).displayName || 'O');
  // include the running session live
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  if (me.studying && me.currentStartAt){
    const key = me.currentSubject || '(dersiz)';
    const live = Math.max(0, now - me.currentStartAt);
    agg[key] = (agg[key] || 0) + live;
    total += live;
  }
  const rows = Object.entries(agg).sort((a, b) => b[1] - a[1]);
  box.innerHTML = rows.length ? rows.map(([n, ms]) => {
    const pct = total ? Math.round(ms / total * 100) : 0;
    const t = theirAgg[n] || 0;
    const cmp = t ? `<div class="muted small" style="margin-top:3px">${theirName}: ${msToHHMMSS(t)}</div>` : '';
    return `<button class="subj-row" data-subj="${escapeHtml(n)}" title="Günlük dökümü gör">
      <div class="spaced"><span>${escapeHtml(n)} <span class="sr-chev">›</span></span><span class="muted small">${msToHHMMSS(ms)} · %${pct}</span></div>
      <div class="progress-outer"><div class="progress-inner" style="width:${pct}%"></div></div>
      ${cmp}
    </button>`;
  }).join('') : '<div class="muted small" style="margin-top:6px">Bu aralıkta kayıt yok.</div>';
}
function fmtLogDay(dstr){
  try {
    if (dstr === todayKey()) return 'Bugün';
    if (dstr === todayKey(new Date(Date.now() - 86400000))) return 'Dün';
    const d = new Date(dstr + 'T12:00:00');
    const opts = { day:'numeric', month:'long', weekday:'long' };
    if (dstr.slice(0, 4) !== todayKey().slice(0, 4)) opts.year = 'numeric';
    return d.toLocaleDateString('tr-TR', opts);
  } catch(e){ return dstr; }
}
function renderSessionLog(){
  const box = document.getElementById('sessionLog');
  if (!box) return;
  const items = Object.entries(mySessions || {})
    .map(([k, v]) => Object.assign({ k }, v))
    .sort((a, b) => (b.startAt || 0) - (a.startAt || 0)).slice(0, 120);
  if (!items.length){ box.innerHTML = '<div class="muted small">Henüz kayıt yok</div>'; return; }
  const byDay = {};
  items.forEach(s => {
    const d = s.day || todayKey(new Date(s.startAt || Date.now()));
    (byDay[d] = byDay[d] || []).push(s);
  });
  const fmtT = ms => { try { return new Date(ms).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }); } catch(e){ return ''; } };
  box.innerHTML = Object.entries(byDay).map(([d, ss]) => {
    const tot = ss.reduce((a, s) => a + (s.ms || 0), 0);
    return `<div class="log-day">
      <div class="spaced"><b>${fmtLogDay(d)}</b><span class="muted small">${ss.length} oturum · ${msToHHMMSS(tot)}</span></div>` +
      ss.map(s => `<div class="log-row">
        <span>${fmtT(s.startAt)}–${fmtT(s.endAt)}${s.manual ? ' <span class="log-man" title="Elle eklendi">✎</span>' : ''}</span>
        <button class="log-subj ${s.subject ? '' : 'none'}" data-sess="${s.k}" title="Dersi düzenle">${escapeHtml(s.subject || '＋ ders ekle')}</button>
        <span>${msToHHMMSS(s.ms || 0)}</span>
      </div>`).join('') + '</div>';
  }).join('');
}
function renderSubjManage(){
  const box = document.getElementById('subjManage');
  if (!box) return;
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  const subj = me.subjects || {};
  box.innerHTML = Object.entries(subj).map(([k, s]) =>
    `<span class="tag" style="margin:2px">${escapeHtml(s.name)} <button class="subj-del" data-key="${k}" title="Sil" style="padding:0 6px;font-size:11px">✕</button></span>`
  ).join(' ') || '—';
}
document.getElementById('subjManage').addEventListener('click', async e => {
  const b = e.target.closest('.subj-del'); if (!b) return;
  const uid = (auth.currentUser || {}).uid; if (!uid) return;
  if (!confirm('Bu dersi silmek istediğine emin misin? (Geçmiş kayıtlar silinmez)')) return;
  try {
    await update(ref(db, `users/${uid}/subjects`), { [b.getAttribute('data-key')]: null });
    setTimeout(() => { subjectsCacheJSON = ''; refreshSubjects(); renderSubjManage(); }, 350);
  } catch(err){ toast(err.message); }
});
document.getElementById('targetSave').onclick = async () => {
  const uid = (auth.currentUser || {}).uid; if (!uid) return;
  const v = Math.min(960, Math.max(5, parseInt(document.getElementById('targetInput').value, 10) || 120));
  document.getElementById('targetInput').value = v;
  try { await update(ref(db, `users/${uid}`), { dailyTargetMin: v }); toast('Günlük hedef: ' + v + ' dk 🎯'); }
  catch(e){ toast(e.message); }
};
function setChip(onId, offId){
  document.getElementById(onId).classList.add('on');
  document.getElementById(offId).classList.remove('on');
}
document.getElementById('chart7').onclick = () => { chartDays = 7; setChip('chart7','chart30'); animateChart(7); };
document.getElementById('chart30').onclick = () => { chartDays = 30; setChip('chart30','chart7'); animateChart(30); };
(function(){
  const ids = { today:'subjToday', week:'subjWeek', month:'subjMonth', all:'subjAll' };
  Object.entries(ids).forEach(([mode, id]) => {
    const b = document.getElementById(id); if (!b) return;
    b.onclick = () => {
      subjMode = mode;
      Object.values(ids).forEach(x => {
        const el = document.getElementById(x); if (el) el.classList.toggle('on', x === id);
      });
      renderSubjBreakdown();
    };
  });
})();


/* ---------- chat reactions + read state ---------- */
const REACTS = ['❤️','👍','😂','🔥','🥺'];
function reactionsHTML(m){
  const rs = m.reactions || {};
  const mine = (auth.currentUser || {}).uid;
  const counts = {};
  Object.entries(rs).forEach(([uid, e]) => { if (e){ (counts[e] = counts[e] || []).push(uid); } });
  const chips = Object.entries(counts).map(([e, uids]) =>
    `<button class="react-chip ${uids.includes(mine) ? 'mine' : ''}" data-key="${m.k}" data-emoji="${e}">${e} ${uids.length}</button>`
  ).join('');
  return `<div class="reacts">${chips}<button class="react-add" data-key="${m.k}" title="Tepki ekle">＋</button></div>`;
}
if (els.chatMessages) els.chatMessages.addEventListener('click', async e => {
  const add = e.target.closest('.react-add');
  if (add){
    const key = add.getAttribute('data-key');
    const pal = document.createElement('span');
    pal.className = 'react-pal';
    pal.innerHTML = REACTS.map(r => `<button class="react-chip" data-key="${key}" data-emoji="${r}">${r}</button>`).join('');
    add.replaceWith(pal);
    return;
  }
  const chip = e.target.closest('.react-chip');
  if (chip){
    const key = chip.getAttribute('data-key');
    const emoji = chip.getAttribute('data-emoji');
    const me = auth.currentUser; if (!me) return;
    const cur = (((latestChat || {})[key] || {}).reactions || {})[me.uid];
    if (cur !== emoji) floatEmoji(e.clientX, e.clientY, emoji);
    try { await update(ref(db, `chat/${key}/reactions`), { [me.uid]: cur === emoji ? null : emoji }); }
    catch(err){ toast(err.message); }
  }
});
function chatSeen(){ return parseInt(localStorage.getItem('sb_chat_seen') || '0', 10) || 0; }
function markChatRead(){
  localStorage.setItem('sb_chat_seen', String(Date.now()));
  if (els.chatBadge) els.chatBadge.style.display = 'none';
}
if (els.chatCard) els.chatCard.addEventListener('click', markChatRead);
if (els.chatInput) els.chatInput.addEventListener('focus', markChatRead);

/* ---------- typing indicator ("... yazıyor") ---------- */
/* Kendi presence kaydımıza typingAt damgası atarız; karşı taraf 4 sn
   tazelik penceresinde gösterir. Yeni kural gerekmez. */
let typingLastSent = 0, typingClearTimer = null;
function setTyping(on){
  const u = auth.currentUser; if (!u) return;
  update(ref(db, `presence/${u.uid}`), { typingAt: on ? Date.now() : null }).catch(() => {});
}
if (els.chatInput) els.chatInput.addEventListener('input', () => {
  if (!auth.currentUser) return;
  if (!els.chatInput.value){
    clearTimeout(typingClearTimer);
    setTyping(false);
    return;
  }
  const now = Date.now();
  if (now - typingLastSent > 2000){ typingLastSent = now; setTyping(true); }
  clearTimeout(typingClearTimer);
  typingClearTimer = setTimeout(() => setTyping(false), 3000);
});
if (els.chatInput) els.chatInput.addEventListener('blur', () => setTyping(false));
function renderTyping(){
  if (!els.chatTyping) return;
  const myUid = (auth.currentUser || {}).uid;
  const now = Date.now();
  const names = [];
  Object.entries(latestPresence || {}).forEach(([uid, p]) => {
    if (uid === myUid) return;
    if (p && p.typingAt && (now - p.typingAt) < 4000){
      names.push(((latestUsers || {})[uid] || {}).displayName || 'Biri');
    }
  });
  if (names.length){
    els.chatTypingText.textContent = names.join(' ve ') + ' yazıyor…';
    els.chatTyping.style.display = '';
  } else {
    els.chatTyping.style.display = 'none';
  }
}

/* ---------- library: PDF → Kindle mails + shared reading list ---------- */
/* Kindle gönderimi Google Apps Script üzerinden yapılır (Netlify yerine):
   6 dakika çalışma süresi → büyük PDF'ler sorunsuz gider, kredi/limit yok.
   ⬇ script.google.com'da dağıttıktan sonra çıkan ".../exec" adresini buraya yapıştır. */
const LIB_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyzBMzAzZ1PBiIyl-z_XLNRKfBnPyKtLDSJl_sLAH36t8II5b3CZIhOubQJ0Xqmeg/exec';
/* Gmail eki base64'e çevrilince ~%33 büyüyor: 25MB'lık gerçek tavan
   pratikte ~18MB'a denk geliyor. Üstü sessizce e-postada patlıyordu. */
const LIB_MAX_BYTES = 18 * 1024 * 1024;
let latestLibrary = {};
let libAttached = false;

/* Arka plan fonksiyonu sonucu tarayıcıya dönemez; durumu Firebase'e yazar.
   Burada dinleyip kullanıcıya bildiriyor ve iş düğümünü temizliyoruz. */
function watchKindleJob(jobId, libKey){
  const jref = ref(db, `kindleJobs/${jobId}`);
  const stop = onValue(jref, async s => {
    const v = s.val();
    if (!v || !v.status || v.status === 'pending') return;
    stop();
    const ok = v.status === 'sent';
    toast(ok ? 'İki Kindle\u2019a da gönderildi 📚✉️' : ('Kindle\u2019a gitmedi: ' + (v.error || 'bilinmeyen hata')));
    try { await update(ref(db, `library/${libKey}`), { sent: ok, kindleError: ok ? null : (v.error || 'hata') }); } catch(e){}
    try { await set(jref, null); } catch(e){}
  }, () => {});
  // 7 dk sonra hâlâ ses yoksa (Apps Script tavanı 6 dk) haber ver
  setTimeout(async () => {
    try { stop(); } catch(e){}
    const cur = (latestLibrary[libKey] || {}).sent;
    if (cur === 'pending'){
      toast('Kindle gönderimi yanıt vermedi — Apps Script kurulumunu kontrol et 🤔');
      try { await update(ref(db, `library/${libKey}`), { sent: false, kindleError: 'Betikten yanıt gelmedi' }); } catch(e){}
    }
  }, 7 * 60000);
}

function attachLibrary(){
  if (libAttached) return; libAttached = true;
  let libFirst = true;
  onValue(ref(db, 'library'), s => {
    latestLibrary = s.val() || {};
    renderLibrary();
    if (libFirst){ libFirst = false; reconcileKindleJobs(); }
  }, err => console.error('library read failed:', err && err.message));
}
function openLib(){
  els.libView.classList.add('open');
  document.body.style.overflow = 'hidden';
  attachLibrary();
  renderLibrary();
}
function closeLib(){
  els.libView.classList.remove('open');
  document.body.style.overflow = '';
}
if (els.libBtn) els.libBtn.onclick = openLib;
if (els.libClose) els.libClose.onclick = closeLib;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && els.libView && els.libView.classList.contains('open')) closeLib();
});

function libHintMsg(msg){ if (els.libHint) els.libHint.textContent = msg || ''; }
function libBusy(on, label){
  if (!els.libAddBtn) return;
  els.libAddBtn.disabled = on;
  els.libAddBtn.textContent = on ? (label || '⏳ Gönderiliyor…') : '📤 PDF seç ve gönder';
}
function fmtSize(kb){
  return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : (kb || 0) + ' KB';
}

/* Sekme kapanırsa watchKindleJob dinleyicisi ölüyor ve kayıt sonsuza dek
   'gönderiliyor…' kalıyordu. Açılışta eski işleri kapatıyoruz. */
const LIB_STALE_MS = 10 * 60 * 1000;
async function reconcileKindleJobs(){
  const uid = (auth.currentUser || {}).uid; if (!uid) return;
  const now = Date.now();
  for (const [k, v] of Object.entries(latestLibrary || {})){
    if (!v || v.sent !== 'pending') continue;
    if (v.byUid !== uid) continue;                 // kural gereği sadece kendi kaydımızı düzeltebiliriz
    if (now - (v.at || 0) < LIB_STALE_MS) continue;
    try {
      await update(ref(db, `library/${k}`), { sent: false, kindleError: 'yanıt alınamadı (zaman aşımı)' });
      if (v.jobId) await set(ref(db, `kindleJobs/${v.jobId}`), null);
    } catch(e){}
  }
}

/* Yeniden gönder: dosya Storage'da zaten duruyor, sadece yeni bir iş açıyoruz. */
async function retryKindle(libKey){
  const b = latestLibrary[libKey]; const u = auth.currentUser;
  if (!b || !u || !b.url) return;
  const jobId = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  try {
    const idToken = await u.getIdToken();
    await set(ref(db, `kindleJobs/${jobId}`), { status: 'pending', at: Date.now() });
    await update(ref(db, `library/${libKey}`), { sent: 'pending', kindleError: null, jobId, at: b.at || Date.now() });
    await fetch(LIB_ENDPOINT, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ filename: b.filename, url: b.url, jobId, idToken })
    });
    toast('Tekrar gönderiliyor ✉️');
    watchKindleJob(jobId, libKey);
  } catch(e){ toast('Tekrar gönderilemedi: ' + e.message); }
}

function renderLibrary(){
  if (!els.libList) return;
  const myUid = (auth.currentUser || {}).uid;
  const items = Object.entries(latestLibrary).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => (b.at || 0) - (a.at || 0));
  if (els.libEmpty) els.libEmpty.style.display = items.length ? 'none' : '';
  const userIds = Object.keys(latestUsers || {});
  els.libList.innerHTML = items.map(b => {
    const fin = b.finished || {};
    const chips = userIds.map(uid => {
      const nm = escapeHtml((latestUsers[uid] || {}).displayName || 'Kullanıcı');
      const f = fin[uid];
      return `<span class="tag">${f ? '✅' : '📖'} ${nm}: ${f ? new Date(f.at).toLocaleDateString('tr-TR') : '—'}</span>`;
    }).join('');
    const mine = !!fin[myUid];
    return `<div class="lib-item">
      <div class="spaced" style="gap:8px">
        <div style="min-width:0">
          <div class="lib-title">📕 ${escapeHtml(b.title || b.filename || 'Kitap')}</div>
          <div class="muted small">${escapeHtml(b.by || 'Biri')} ekledi · ${new Date(b.at || 0).toLocaleDateString('tr-TR')} · ${fmtSize(b.sizeKB)}${b.url ? ' · <a href="' + escapeHtml(b.url) + '" target="_blank" rel="noopener">⬇ indir</a>' : ''}${b.sent === 'pending' ? ' · <span class="lib-pending">✉️ gönderiliyor…</span>' : (b.sent === false ? ' · <span style="color:var(--danger)" title="' + escapeHtml(b.kindleError || '') + '">Kindle\u2019a gönderilemedi</span> · <button class="lib-retry small" data-key="' + b.k + '">↻ tekrar dene</button>' : '')}</div>
        </div>
        <button class="lib-del small" data-key="${b.k}" title="Kaydı sil">✕</button>
      </div>
      <div class="row" style="margin-top:10px;gap:6px;align-items:center">
        ${chips}
        <button class="lib-fin small ${mine ? '' : 'primary'}" data-key="${b.k}">${mine ? '↺ Bitirmedim' : '✔ Bitirdim'}</button>
      </div>
    </div>`;
  }).join('');
}

if (els.libAddBtn) els.libAddBtn.onclick = () => { libHintMsg(''); els.libFile.click(); };
if (els.libFile) els.libFile.addEventListener('change', async () => {
  const f = els.libFile.files && els.libFile.files[0];
  els.libFile.value = '';
  const u = auth.currentUser;
  if (!f || !u) return;
  if (!/\.pdf$/i.test(f.name)){ libHintMsg('Sadece PDF gönderilebilir'); return; }
  if (f.size > LIB_MAX_BYTES){
    libHintMsg('Bu PDF çok büyük (' + (f.size / 1048576).toFixed(1) + ' MB). E-posta yolunun tavanı ~25 MB — daha büyükleri amazon.com/sendtokindle ile gönderebilirsin.');
    return;
  }
  const title = (els.libTitle.value || '').trim() || f.name.replace(/\.pdf$/i, '');
  const key = push(ref(db, 'library')).key;
  const storagePath = `library/${key}/${f.name}`;

  // 1) upload to Firebase Storage (this is what bypasses the old 4.5MB cap)
  libBusy(true, '⏫ Yükleniyor… %0');
  let url = '';
  try {
    const task = uploadBytesResumable(sRef(storage, storagePath), f, { contentType: 'application/pdf' });
    await new Promise((res, rej) => {
      task.on('state_changed',
        snap => libBusy(true, '⏫ Yükleniyor… %' + Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        rej, res);
    });
    url = await getDownloadURL(task.snapshot.ref);
  } catch(e){
    libBusy(false);
    libHintMsg('Yükleme başarısız: ' + e.message + '');
    return;
  }

  // 2) arka plan fonksiyonunu tetikle (hemen 202 döner, mail arkada gider)
  libBusy(true, '✉️ Kindle\u2019lara gönderiliyor…');
  const jobId = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let queued = true, errMsg = '';
  if (!/^https:\/\//.test(LIB_ENDPOINT)){
    queued = false; errMsg = 'Kindle betiği adresi ayarlanmamış (LIB_ENDPOINT)';
  } else {
    try {
      /* Apps Script OPTIONS preflight'ı yanıtlamaz; text/plain + no-cors ile
         istek "basit istek" sayılır ve sorunsuz gider. Cevabı okuyamayız —
         gerekmiyor da: sonuç kindleJobs/{jobId} üzerinden Firebase'den gelir. */
      /* Gizli anahtar yerine kendi Firebase kimlik jetonumuzu yolluyoruz;
         betik onu Google'a doğrulatıyor. Jeton kısa ömürlü ve bize özel. */
      const idToken = await u.getIdToken();
      /* İşi önce biz (girişli kullanıcı) açıyoruz; böylece veritabanı
         kuralı yalnızca VAR OLAN bir işin güncellenmesine izin verebiliyor. */
      await set(ref(db, `kindleJobs/${jobId}`), { status: 'pending', at: Date.now() });
      await fetch(LIB_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ filename: f.name, url, jobId, idToken })
      });
    } catch(e){ queued = false; errMsg = e.message; }
  }

  if (!queued && !confirm('Kindle gönderimi başlatılamadı (' + errMsg + ').\nYine de kütüphaneye kaydedilsin mi? (⬇ indir bağlantısı yine de çalışır)')){
    try { await deleteObject(sRef(storage, storagePath)); } catch(e){}
    libBusy(false); libHintMsg('Gönderilemedi: ' + errMsg);
    return;
  }
  try {
    await update(ref(db, `library/${key}`), {
      title, filename: f.name, sizeKB: Math.round(f.size / 1024),
      by: u.displayName || u.email, byUid: u.uid, at: Date.now(),
      sent: queued ? 'pending' : false, url, storagePath, jobId: queued ? jobId : null
    });
    els.libTitle.value = '';
    libHintMsg('');
    toast(queued
      ? 'Kütüphaneye eklendi 📚 — Kindle\u2019lara gönderiliyor, büyük dosyalar birkaç dakika sürebilir ✉️'
      : 'Kütüphaneye eklendi (mail gönderilemedi)');
    if (queued) watchKindleJob(jobId, key);
  } catch(e){ toast(e.message); }
  libBusy(false);
});

if (els.libList) els.libList.addEventListener('click', async e => {
  const uid = (auth.currentUser || {}).uid; if (!uid) return;
  const fin = e.target.closest('.lib-fin');
  if (fin){
    const key = fin.getAttribute('data-key');
    const cur = (((latestLibrary[key] || {}).finished) || {})[uid];
    try {
      await update(ref(db, `library/${key}/finished`), { [uid]: cur ? null : { at: Date.now() } });
      if (!cur){ confetti(); toast('Kitap bitti, tebrikler! 📖✨'); }
    }
    catch(err){ toast(err.message); }
    return;
  }
  const rt = e.target.closest('.lib-retry');
  if (rt){ retryKindle(rt.getAttribute('data-key')); return; }

  const del = e.target.closest('.lib-del');
  if (del){
    if (!confirm('Bu kitap kaydını silmek istediğine emin misin? (Depodaki PDF de silinir)')) return;
    const key = del.getAttribute('data-key');
    const b = latestLibrary[key] || {};
    try {
      await update(ref(db, 'library'), { [key]: null });
      if (b.storagePath){ try { await deleteObject(sRef(storage, b.storagePath)); } catch(e){} }
    }
    catch(err){ toast(err.message); }
  }
});

/* ================================================================
   MOVIE NIGHT — izlenecekler (Keep tarzı), "bişeyler izleyelim"
   çağrısı ve tek tıkla Google Meet katılımı.
   ================================================================ */
const WN_COLORS = ['#7a5af8', '#ff5db1', '#4cd676', '#ffb167', '#6ec1ff', '#f8d55a'];
let latestWatch = {}, latestMeet = null;
let watchAttached = false, meetLoaded = false, prevMeetAt = null;
let wnColor = 0, wnmColor = 0, wnEditKey = null, meetPasting = false;

function attachWatch(){
  if (watchAttached) return; watchAttached = true;
  onValue(ref(db, 'watchlist'), s => {
    latestWatch = s.val() || {};
    renderWatchNotes();
    // künye kartı açıksa canlı güncelle (yıldız/yorum anında yansısın)
    if (mcKey){
      if (latestWatch[mcKey]) renderMovieCard();
      else closeMovieCard();          // öğe silinmişse karttan çık
    }
  }, err => console.error('watchlist read failed:', err && err.message));
  onValue(ref(db, 'meet'), s => {
    const m = s.val();
    const first = !meetLoaded; meetLoaded = true;
    if (!first && m && m.url && m.at !== prevMeetAt && m.byUid !== (auth.currentUser || {}).uid){
      toast((m.by || 'Arkadaşın') + ' Meet başlattı 🎥 — 🎬 sekmesinden katıl!');
      notifyMe('🎥 Meet hazır!', (m.by || 'Arkadaşın') + ' seni bekliyor');
      popSound();
    }
    prevMeetAt = m && m.at;
    latestMeet = m;
    renderMeet();
  }, err => console.error('meet read failed:', err && err.message));
}
function showWnPage(on){
  const h = document.getElementById('watchHome'), p = document.getElementById('wnPage');
  if (h) h.style.display = on ? 'none' : '';
  if (p) p.style.display = on ? '' : 'none';
  if (on){ renderWatchNotes(); }
  if (els.watchView) els.watchView.scrollTop = 0;
}
function openWatch(){
  els.watchView.classList.add('open');
  document.body.style.overflow = 'hidden';
  showWnPage(false);
  renderMeet(); renderWatchNotes();
}
function closeWatch(){
  els.watchView.classList.remove('open');
  document.body.style.overflow = '';
}
if (els.watchBtn) els.watchBtn.onclick = openWatch;
if (els.watchClose) els.watchClose.onclick = closeWatch;
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (els.watchView && els.watchView.classList.contains('open')){
    const c = document.getElementById('wnCard');
    const p = document.getElementById('wnPage');
    if (c && c.style.display !== 'none') closeMovieCard();
    else if (p && p.style.display !== 'none') showWnPage(false);
    else closeWatch();
  }
});
document.getElementById('wnOpenCard').addEventListener('click', () => showWnPage(true));
document.getElementById('wnBack').addEventListener('click', () => showWnPage(false));

/* ---- "bişeyler izleyelim" ---- */
if (els.watchNudgeBtn) els.watchNudgeBtn.onclick = async () => {
  const me = auth.currentUser; if (!me) return;
  const others = Object.keys(latestUsers || {}).filter(uid => uid !== me.uid);
  if (!others.length){ toast('Gönderecek kimse yok 🙈'); return; }
  try {
    for (const to of others){
      await push(ref(db, `nudges/${to}`), { from: me.displayName || me.email, at: Date.now(), type: 'watch' });
      sendPush('watch', to);
    }
    toast('Gönderildi 🎬🍿');
  } catch(e){ toast(e.message); }
};

/* ---- Google Meet paylaşımı ---- */
function meetCodeFrom(input){
  const v = (input || '').trim();
  const m = v.match(/meet\.google\.com\/([a-z0-9-]+)/i) || v.match(/^([a-z]{3}-?[a-z]{4}-?[a-z]{3})$/i);
  return m ? m[1] : null;
}
function renderMeet(){
  if (!els.meetBox) return;
  if (latestMeet && latestMeet.url){
    const when = new Date(latestMeet.at || 0).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
    els.meetBox.innerHTML = `
      <b class="stat-title"><span class="meet-live-dot"></span>🎥 Görüntülü buluşma hazır</b>
      <div class="muted small" style="margin-top:6px">${escapeHtml(latestMeet.by || 'Biri')} başlattı · ${when}</div>
      <div class="meet-actions">
        <button class="primary" data-mact="join">🎥 Katıl</button>
        <button data-mact="end">Bitir</button>
      </div>`;
  } else if (meetPasting){
    els.meetBox.innerHTML = `
      <b class="stat-title">🎥 Google Meet</b>

      <input id="meetInput" placeholder="https://meet.google.com/xxx-yyyy-zzz" autocomplete="off">
      <div class="meet-actions">
        <button class="primary" data-mact="share">Paylaş</button>
        <button data-mact="reopen">Sekme açılmadı mı?</button>
        <button data-mact="cancel">Vazgeç</button>
      </div>`;
  } else {
    els.meetBox.innerHTML = `
      <b class="stat-title">🎥 Google Meet</b>

      <div class="meet-actions">
        <button class="primary" data-mact="start">Meet başlat</button>
      </div>`;
  }
}
if (els.meetBox) els.meetBox.addEventListener('click', async e => {
  const b = e.target.closest('[data-mact]'); if (!b) return;
  const act = b.getAttribute('data-mact');
  const me = auth.currentUser;
  if (act === 'start'){
    window.open('https://meet.google.com/new', '_blank', 'noopener');
    meetPasting = true; renderMeet();
    setTimeout(() => { const i = document.getElementById('meetInput'); if (i) i.focus(); }, 80);
  } else if (act === 'reopen'){
    window.open('https://meet.google.com/new', '_blank', 'noopener');
  } else if (act === 'cancel'){
    meetPasting = false; renderMeet();
  } else if (act === 'share'){
    if (!me) return;
    const code = meetCodeFrom((document.getElementById('meetInput') || {}).value);
    if (!code){ toast('Bu bir Meet linkine benzemiyor 🤔'); return; }
    try {
      await update(ref(db, 'meet'), {
        url: 'https://meet.google.com/' + code.toLowerCase(),
        by: me.displayName || me.email, byUid: me.uid, at: Date.now()
      });
      meetPasting = false;
      sendPush('meet');
      toast('Paylaşıldı — karşı tarafa haber gitti 🎥');
    } catch(err){ toast(err.message); }
  } else if (act === 'join'){
    if (latestMeet && latestMeet.url) window.open(latestMeet.url, '_blank', 'noopener');
  } else if (act === 'end'){
    if (!confirm('Buluşmayı herkes için kapatmak istediğine emin misin?')) return;
    try { await update(ref(db), { meet: null }); } catch(err){ toast(err.message); }
  }
});

/* ---- izlenecekler (Keep tarzı ortak kontrol listesi) ---- */
const WN_BGS = [
  { id:'tema', name:'Tema', css:'', fg:'' },
  { id:'gece', name:'Gece',
    css:'radial-gradient(1.6px 1.6px at 18% 22%, rgba(255,255,255,.85), transparent 55%),' +
        'radial-gradient(1.2px 1.2px at 68% 12%, rgba(255,255,255,.7), transparent 55%),' +
        'radial-gradient(1.4px 1.4px at 84% 46%, rgba(255,255,255,.75), transparent 55%),' +
        'radial-gradient(1.2px 1.2px at 34% 64%, rgba(255,255,255,.6), transparent 55%),' +
        'radial-gradient(1.5px 1.5px at 56% 86%, rgba(255,255,255,.7), transparent 55%),' +
        'radial-gradient(1.1px 1.1px at 10% 78%, rgba(255,255,255,.6), transparent 55%),' +
        'linear-gradient(180deg,#474e73,#2b2f4a)', fg:'#f1f2ff' },
  { id:'gunbatimi', name:'Gün batımı', css:'linear-gradient(180deg,#ff9a8b,#b06179)', fg:'#fff5f6' },
  { id:'orman', name:'Orman', css:'linear-gradient(180deg,#31614e,#1d3b30)', fg:'#e9fff3' },
  { id:'okyanus', name:'Okyanus', css:'linear-gradient(180deg,#2f5f8d,#173350)', fg:'#eaf4ff' },
  { id:'lila', name:'Lila', css:'linear-gradient(180deg,#b3a1e6,#8a75c6)', fg:'#ffffff' },
  { id:'pembe', name:'Pembe', css:'linear-gradient(180deg,#ffc0d0,#ef8fae)', fg:'#571e31' },
  { id:'kum', name:'Kum', css:'linear-gradient(180deg,#f2e0c2,#e0c393)', fg:'#5b4326' }
];
let wnDoneCollapsed = false;
const wnItemText = n => n.title ? (n.text ? n.title + ' — ' + n.text : n.title) : (n.text || '');
const wnItems = () => Object.entries(latestWatch)
  .filter(([k]) => k !== '_meta')
  .map(([k, v]) => Object.assign({ k }, v));

function applyWnBg(){
  const board = els.wnBoard; if (!board) return;
  const id = ((latestWatch._meta || {}).bg) || 'tema';
  const bg = WN_BGS.find(b => b.id === id) || WN_BGS[0];
  if (bg.css){
    board.style.background = bg.css;
    board.style.setProperty('--wnfg', bg.fg);
    board.classList.add('custom');
  } else {
    board.style.background = '';
    board.style.removeProperty('--wnfg');
    board.classList.remove('custom');
  }
}
function renderWatchNotes(){
  if (!els.wnListOpen) return;
  applyWnBg();
  const items = wnItems();
  const open = items.filter(n => !n.done).sort((a, b) => (a.at || 0) - (b.at || 0));
  const done = items.filter(n => n.done).sort((a, b) => (b.doneAt || b.at || 0) - (a.doneAt || a.at || 0));
  const cnt = document.getElementById('wnCount');
  if (cnt) cnt.textContent = open.length;
  const row = n => `<div class="wn-item ${n.done ? 'done' : ''}" data-key="${n.k}">
      <input type="checkbox" class="wn-check" ${n.done ? 'checked' : ''} aria-label="İşaretle">
      <div class="txt">${escapeHtml(wnItemText(n))}</div>
      <button class="wn-edit-btn" title="Adı düzenle">✎</button>
      <button class="wn-x" title="Sil">✕</button>
    </div>`;
  els.wnListOpen.innerHTML = open.map(row).join('') ||
    '<div class="wn-hint">Liste boş</div>';
  if (done.length){
    els.wnDoneWrap.style.display = '';
    els.wnDoneCount.textContent = done.length + ' ';
    els.wnDoneChev.textContent = wnDoneCollapsed ? '▸ ' : '▾ ';
    els.wnListDone.style.display = wnDoneCollapsed ? 'none' : '';
    els.wnListDone.innerHTML = done.map(row).join('');
  } else {
    els.wnDoneWrap.style.display = 'none';
  }
}
async function wnAdd(text){
  const u = auth.currentUser; if (!u) return;
  const t = (text || '').trim(); if (!t) return;
  try {
    await push(ref(db, 'watchlist'), { text: t, done: false, by: u.displayName || u.email, byUid: u.uid, at: Date.now() });
  } catch(e){ toast(e.message); }
}
if (els.wnNewInput){
  els.wnNewInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = els.wnNewInput.value;
    els.wnNewInput.value = '';
    wnAdd(v);
  });
  els.wnNewInput.addEventListener('blur', () => {
    const v = els.wnNewInput.value;
    if (v.trim()){ els.wnNewInput.value = ''; wnAdd(v); }
  });
}
function wnStartEdit(item){
  const key = item.getAttribute('data-key');
  const n = latestWatch[key]; if (!n) return;
  const txtEl = item.querySelector('.txt');
  if (!txtEl || item.querySelector('.wn-edit')) return;
  const inp = document.createElement('input');
  inp.className = 'wn-edit';
  inp.maxLength = 200;
  inp.value = wnItemText(n);
  txtEl.replaceWith(inp);
  inp.focus();
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e){}
  let committed = false;
  const commit = async save => {
    if (committed) return; committed = true;
    const v = inp.value.trim();
    if (save && v && v !== wnItemText(n)){
      try { await update(ref(db, `watchlist/${key}`), { text: v, title: null, updatedAt: Date.now() }); }
      catch(e){ toast(e.message); }
    }
    renderWatchNotes();
  };
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter'){ ev.preventDefault(); commit(true); }
    else if (ev.key === 'Escape'){ ev.stopPropagation(); commit(false); }
  });
  inp.addEventListener('blur', () => commit(true));
}
function wnListClick(e){
  const item = e.target.closest('.wn-item'); if (!item) return;
  const key = item.getAttribute('data-key');
  if (e.target.classList.contains('wn-check')){
    const n = latestWatch[key]; if (!n) return;
    update(ref(db, `watchlist/${key}`), { done: !n.done, doneAt: !n.done ? Date.now() : null })
      .catch(err => toast(err.message));
    return;
  }
  if (e.target.closest('.wn-x')){
    if (!confirm('Bu öğeyi silmek istediğine emin misin?')) return;
    update(ref(db, 'watchlist'), { [key]: null }).catch(err => toast(err.message));
    return;
  }
  if (e.target.closest('.wn-edit-btn')){ wnStartEdit(item); return; }
  if (e.target.closest('.txt')) openMovieCard(key);
}

/* ---- film künye kartı ---- */
let mcKey = null;
const myWho = () => isSpecialUser ? 'numan' : 'erva';   // Numan = özel hesap, diğeri = Erva
function starRow(el, value, editable, onSet){
  el.innerHTML = [1,2,3,4,5].map(i => `<span class="st ${i <= value ? 'on' : ''} ${editable ? '' : 'readonly'}" data-v="${i}">${i <= value ? '★' : '☆'}</span>`).join('');
  if (editable){
    el.querySelectorAll('.st').forEach(s => s.onclick = () => {
      let v = parseInt(s.getAttribute('data-v'), 10);
      if (v === value) v = 0;   // aynı yıldıza basınca sıfırla
      onSet(v);
    });
  }
}
function openMovieCard(key){
  mcKey = key;
  document.getElementById('watchHome').style.display = 'none';
  document.getElementById('wnPage').style.display = 'none';
  document.getElementById('wnCard').style.display = '';
  if (els.watchView) els.watchView.scrollTop = 0;
  renderMovieCard();
}
function closeMovieCard(){
  mcKey = null;
  document.getElementById('wnCard').style.display = 'none';
  showWnPage(true);
}
function renderMovieCard(){
  const n = latestWatch[mcKey]; if (!n) return;
  const mc = n.card || {};
  const mine = myWho();

  document.getElementById('mcName').textContent = wnItemText(n);
  const items = wnItems().sort((a,b)=>(a.at||0)-(b.at||0));
  const idx = items.findIndex(x => x.k === mcKey);
  document.getElementById('mcNo').textContent = idx >= 0 ? String(idx + 1).padStart(2, '0') : '—';

  // afiş
  const img = document.getElementById('mcPosterImg'), empty = document.getElementById('mcPosterEmpty');
  if (mc.poster){ img.src = mc.poster; img.style.display = ''; empty.style.display = 'none'; }
  else { img.style.display = 'none'; empty.style.display = ''; }

  // tarih (ortak alan)
  const dateEl = document.getElementById('mcDate');
  if (document.activeElement !== dateEl) dateEl.value = mc.date || '';

  // kişisel puanlar
  const rN = (mc.rate && mc.rate.numan) || 0;
  const rE = (mc.rate && mc.rate.erva) || 0;
  starRow(document.querySelector('[data-rate="numan"]'), rN, mine === 'numan', v => saveCard({ ['rate/numan']: v || null }));
  starRow(document.querySelector('[data-rate="erva"]'), rE, mine === 'erva', v => saveCard({ ['rate/erva']: v || null }));

  // genel puan = ikisinin ortalaması (otomatik)
  const both = [rN, rE].filter(x => x > 0);
  const avg = both.length ? both.reduce((a,b)=>a+b,0) / both.length : 0;
  const ov = document.getElementById('mcOverall');
  ov.innerHTML = [1,2,3,4,5].map(i => `<span class="st ${i <= Math.round(avg) ? 'on' : ''} readonly">${i <= Math.round(avg) ? '★' : '☆'}</span>`).join('');
  document.getElementById('mcOverallNote').textContent = both.length
    ? ('ortalama ' + avg.toFixed(1) + ' / 5' + (both.length < 2 ? ' (tek oy)' : ''))
    : 'ikiniz puan verince oluşur';

  // yorumlar — herkes kendininkini yazar, diğerininkini okur
  ['numan','erva'].forEach(who => {
    const ta = document.querySelector(`[data-cmt="${who}"]`);
    const editable = who === mine;
    if (document.activeElement !== ta) ta.value = (mc.comment && mc.comment[who]) || '';
    ta.disabled = !editable;
    ta.classList.toggle('locked', !editable);
    ta.placeholder = editable ? 'yorumun…' : '—';
  });
}
async function saveCard(patch){
  if (!mcKey) return;
  const upd = {};
  Object.entries(patch).forEach(([k, v]) => { upd[`watchlist/${mcKey}/card/${k}`] = v; });
  try { await update(ref(db), upd); } catch(e){ toast(e.message); }
}
// afiş yükleme
document.getElementById('mcPosterBtn').onclick = () => document.getElementById('mcPosterFile').click();
document.getElementById('mcPosterFile').addEventListener('change', async ev => {
  const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
  if (!f || !mcKey) return;
  try {
    const u = auth.currentUser;
    const blob = await pCompressTo(f, 400, 560, .82);
    const sr = sRef(storage, `posters/${mcKey}.jpg`);
    await uploadBytesResumable(sr, blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=604800' });
    const url = await getDownloadURL(sr);
    await saveCard({ poster: url });
  } catch(e){ toast('Afiş yüklenemedi: ' + (e && e.message ? e.message : e)); }
});
// tarih + yorum (kendi alanın) kaydet
document.getElementById('mcDate').addEventListener('change', e => saveCard({ date: e.target.value.trim() || null }));
['numan','erva'].forEach(who => {
  const ta = document.querySelector(`[data-cmt="${who}"]`);
  ta.addEventListener('blur', () => {
    if (ta.disabled || who !== myWho()) return;
    saveCard({ [`comment/${who}`]: ta.value.trim() || null });
  });
});
document.getElementById('wnCardBack').onclick = closeMovieCard;

/* genel bir 400x560 kare-olmayan sıkıştırıcı (afiş için) */
function pCompressTo(file, W, H, q){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        const scale = Math.max(W / img.width, H / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        c.toBlob(b => b ? res(b) : rej(new Error('Görsel işlenemedi')), 'image/jpeg', q || .82);
      };
      img.onerror = () => rej(new Error('Görsel okunamadı'));
      img.src = e.target.result;
    };
    r.onerror = () => rej(new Error('Dosya okunamadı'));
    r.readAsDataURL(file);
  });
}
if (els.wnListOpen) els.wnListOpen.addEventListener('click', wnListClick);
if (els.wnListDone) els.wnListDone.addEventListener('click', wnListClick);
if (els.wnDoneToggle) els.wnDoneToggle.addEventListener('click', () => {
  wnDoneCollapsed = !wnDoneCollapsed;
  renderWatchNotes();
});

/* ---- arka plan seçici ---- */
function renderBgPal(){
  els.wnBgPal.innerHTML = WN_BGS.map(b =>
    `<button class="wn-bg" data-bg="${b.id}" title="${b.name}" style="background:${b.css || 'var(--card)'}"></button>`
  ).join('');
}
if (els.wnBgBtn) els.wnBgBtn.addEventListener('click', e => {
  e.stopPropagation();
  const open = els.wnBgPal.style.display !== 'none';
  if (open){ els.wnBgPal.style.display = 'none'; return; }
  renderBgPal();
  els.wnBgPal.style.display = '';
});
document.addEventListener('click', e => {
  if (!els.wnBgPal || els.wnBgPal.style.display === 'none') return;
  const b = e.target.closest('.wn-bg');
  if (b){
    update(ref(db, 'watchlist/_meta'), { bg: b.getAttribute('data-bg') }).catch(err => toast(err.message));
    els.wnBgPal.style.display = 'none';
    return;
  }
  if (!e.target.closest('#wnBgPal') && !e.target.closest('#wnBgBtn')) els.wnBgPal.style.display = 'none';
});


/* ---------------- profile ---------------- */
let profOpen = false;
const meData = () => (latestUsers || {})[(auth.currentUser || {}).uid] || {};
function pCompress(file){          // 256px kare JPEG blob
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const img = new Image();
      img.onload = () => {
        const S = 256, m = Math.min(img.width, img.height);
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        c.toBlob(b => b ? res(b) : rej(new Error('Görsel işlenemedi')), 'image/jpeg', .85);
      };
      img.onerror = () => rej(new Error('Görsel okunamadı'));
      img.src = e.target.result;
    };
    r.onerror = () => rej(new Error('Dosya okunamadı'));
    r.readAsDataURL(file);
  });
}
function openProf(){
  const u = auth.currentUser; if (!u) return;
  profOpen = true;
  els.profView.classList.add('open');
  document.body.style.overflow = 'hidden';
  els.profName.value = u.displayName || '';
  attachLibrary();          // kitap istatistiği için
  renderProfAvatar();
  renderProfStats();
  openStats();              // istatistikler artık bu sayfanın içinde
  els.profView.scrollTop = 0;
}
function closeProf(){
  profOpen = false;
  closeStats();
  els.profView.classList.remove('open');
  document.body.style.overflow = '';
}
if (els.profClose) els.profClose.onclick = closeProf;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && profOpen) closeProf();
});
function renderProfAvatar(){
  const u = auth.currentUser; if (!u || !els.profAvatar) return;
  const av = meData().avatar;
  els.profAvatar.innerHTML = isAvatarSrc(av)
    ? `<img src="${escapeHtml(av)}" alt="">`
    : escapeHtml(initials(u.displayName || u.email));
}
function renderProfStats(){
  if (!els.profStats || !auth.currentUser) return;
  const m = meData();
  const uid = auth.currentUser.uid;
  const allLive = (m.totals?.allTimeMs || 0) + ((m.studying && m.currentStartAt) ? Math.max(0, Date.now() - m.currentStartAt) : 0);
  const books = Object.values(latestLibrary || {}).filter(b => b && b.finished && b.finished[uid]).length;
  const sess = Object.keys(mySessions || {}).length;
  const chips = [
    [msToHHMMSS(myTodayMs()), 'Bugün'],
    [msToHHMMSS(allLive), 'Toplam'],
    [liveStreak(m) + ' 🔥', 'Seri'],
    [(m.dailyTargetMin || 120) + ' dk', 'Günlük hedef'],
    [sess, 'Kayıtlı oturum'],
    [books, 'Bitirilen kitap']
  ];
  els.profStats.innerHTML = chips.map(([v, k]) =>
    `<div class="prof-stat"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
  renderBadgeRow();
}
function renderProfLive(){ if (profOpen) renderProfStats(); }

/* ---- elle oturum ekleme ---- */
function saFill(){
  const d = document.getElementById('saDate');
  const st = document.getElementById('saStart');
  const en = document.getElementById('saEnd');
  const sel = document.getElementById('saSubj');
  if (!d) return;
  d.value = todayKey();
  d.max = todayKey();
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  st.value = hh + ':00';
  en.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const opts = [...(els.subjectSelect ? els.subjectSelect.options : [])].filter(o => o.value);
  sel.innerHTML = '<option value="">(dersiz)</option>' +
    opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.value)}</option>`).join('');
  saPreview();
}
function saTimes(){
  const d = document.getElementById('saDate').value;
  const st = document.getElementById('saStart').value;
  const en = document.getElementById('saEnd').value;
  if (!d || !st || !en) return null;
  const startAt = new Date(d + 'T' + st).getTime();
  let endAt = new Date(d + 'T' + en).getTime();
  if (isNaN(startAt) || isNaN(endAt)) return null;
  if (endAt <= startAt) endAt += 86400000;      // gece yarısını geçen oturum
  return { startAt, endAt, ms: endAt - startAt };
}
function saPreview(){
  const p = document.getElementById('saPreview'); if (!p) return;
  const t = saTimes();
  if (!t){ p.textContent = ''; return; }
  if (t.ms > 16 * 3600000){ p.textContent = '⚠️ 16 saatten uzun oturum eklenemez'; p.style.color = 'var(--danger)'; return; }
  if (t.startAt > Date.now()){ p.textContent = '⚠️ Gelecekteki bir zaman eklenemez'; p.style.color = 'var(--danger)'; return; }
  p.style.color = '';
  p.textContent = 'Süre: ' + msToHHMMSS(t.ms);
}
(function wireSessAdd(){
  const m = document.getElementById('sessAddModal'); if (!m) return;
  const close = () => m.classList.remove('open');
  const btn = document.getElementById('sessAddBtn');
  if (btn) btn.onclick = () => { saFill(); m.classList.add('open'); };
  document.getElementById('saClose').onclick = close;
  document.getElementById('saCancel').onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  ['saDate', 'saStart', 'saEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saPreview);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('open')) close(); });
  document.getElementById('saSave').onclick = async () => {
    const uid = (auth.currentUser || {}).uid; if (!uid) return;
    const t = saTimes();
    if (!t){ toast('Tarih ve saatleri doldur 🙂'); return; }
    if (t.ms < 60000){ toast('En az 1 dakikalık oturum ekleyebilirsin'); return; }
    if (t.ms > 16 * 3600000){ toast('16 saatten uzun oturum eklenemez'); return; }
    if (t.startAt > Date.now()){ toast('Gelecekteki bir zaman eklenemez'); return; }
    const subj = document.getElementById('saSubj').value || '';
    const day = todayKey(new Date(t.startAt));
    try {
      const uref = ref(db, `users/${uid}`);
      const u = (await get(uref)).val() || {};
      const totals = u.totals || { allTimeMs: 0, perDay: {} };
      const perDay = totals.perDay || {};
      perDay[day] = (perDay[day] || 0) + t.ms;
      await update(uref, { totals: { allTimeMs: (totals.allTimeMs || 0) + t.ms, perDay } });
      await push(ref(db, `sessions/${uid}`), {
        subject: subj, startAt: t.startAt, endAt: t.endAt, ms: t.ms, day, manual: true
      });
      close();
      toast('Oturum eklendi: ' + msToHHMMSS(t.ms) + ' ✓');
    } catch(e){ toast(e.message); }
  };
})();

/* ---- ders detayı: günlük döküm ---- */
let sdSubject = null, sdRange = 30;   // 7 | 30 | 0 (tümü)
function sdOpen(name){
  sdSubject = name;
  const m = document.getElementById('subjDetailModal');
  document.getElementById('sdTitle').textContent = '📖 ' + name;
  if (m) m.classList.add('open');
  sdRender();
}
function sdClose(){
  sdSubject = null;
  const m = document.getElementById('subjDetailModal');
  if (m) m.classList.remove('open');
}
function sdRender(){
  if (!sdSubject) return;
  const daysBox = document.getElementById('sdDays');
  const chipsBox = document.getElementById('sdChips');
  if (!daysBox || !chipsBox) return;

  // gün gün topla
  const perDay = {};
  Object.values(mySessions || {}).forEach(s => {
    const key = s.subject || '(dersiz)';
    if (key !== sdSubject) return;
    const d = s.day || todayKey(new Date(s.startAt || Date.now()));
    perDay[d] = (perDay[d] || 0) + (s.ms || 0);
  });
  // devam eden oturumu da göster
  const me = (latestUsers || {})[(auth.currentUser || {}).uid] || {};
  if (me.studying && me.currentStartAt && (me.currentSubject || '(dersiz)') === sdSubject){
    const d = todayKey();
    perDay[d] = (perDay[d] || 0) + Math.max(0, Date.now() - me.currentStartAt);
  }

  let entries = Object.entries(perDay).sort((a, b) => b[0] < a[0] ? -1 : 1).reverse();
  if (sdRange){
    const cut = todayKey(new Date(Date.now() - (sdRange - 1) * 86400000));
    entries = entries.filter(([d]) => d >= cut);
  }

  const total = entries.reduce((a, [, ms]) => a + ms, 0);
  const best = entries.reduce((a, [d, ms]) => ms > a[1] ? [d, ms] : a, ['', 0]);
  const sessCount = Object.values(mySessions || {}).filter(s => (s.subject || '(dersiz)') === sdSubject).length;
  const avg = entries.length ? Math.round(total / entries.length) : 0;
  const maxMs = best[1] || 1;
  const tkey = todayKey();

  chipsBox.innerHTML = [
    [msToHHMMSS(total), sdRange ? ('Son ' + sdRange + ' gün') : 'Tüm zamanlar'],
    [entries.length, 'Çalışılan gün'],
    [msToHHMMSS(avg), 'Gün ortalaması'],
    [best[1] ? msToHHMMSS(best[1]) : '—', 'En iyi gün'],
    [sessCount, 'Oturum sayısı']
  ].map(([v, k]) => `<div class="sd-chip"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');

  daysBox.innerHTML = entries.length ? entries.map(([d, ms]) => `
    <div class="sd-day">
      <div class="spaced"><b>${fmtLogDay(d)}</b><span class="muted">${msToHHMMSS(ms)}</span></div>
      <div class="sd-bar"><i class="${d === tkey ? 'today' : ''}" style="width:${Math.max(2, Math.round(ms / maxMs * 100))}%"></i></div>
    </div>`).join('')
    : '<div class="muted small" style="margin-top:8px">Bu aralıkta bu dersten kayıt yok.</div>';
}
document.addEventListener('click', e => {
  const r = e.target.closest('.subj-row');
  if (r){ sdOpen(r.getAttribute('data-subj')); return; }
});
(function wireSubjDetail(){
  const m = document.getElementById('subjDetailModal'); if (!m) return;
  document.getElementById('sdClose').onclick = sdClose;
  m.addEventListener('click', e => { if (e.target === m) sdClose(); });
  const setR = (n, on) => {
    sdRange = n;
    ['sdR7', 'sdR30', 'sdRAll'].forEach(id => document.getElementById(id).classList.toggle('on', id === on));
    sdRender();
  };
  document.getElementById('sdR7').onclick = () => setR(7, 'sdR7');
  document.getElementById('sdR30').onclick = () => setR(30, 'sdR30');
  document.getElementById('sdRAll').onclick = () => setR(0, 'sdRAll');
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sdSubject) sdClose(); });
})();

/* ---- oturum günlüğü: sonradan ders atama/değiştirme ---- */
let sessEditKey = null;
document.addEventListener('click', e => {
  const b = e.target.closest('.log-subj');
  if (!b) return;
  sessEditKey = b.getAttribute('data-sess');
  const s = (mySessions || {})[sessEditKey]; if (!s) return;
  const m = document.getElementById('sessModal');
  const list = document.getElementById('sessSubjList');
  const info = document.getElementById('sessInfo');
  const fmtT = ms => { try { return new Date(ms).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }); } catch(err){ return ''; } };
  if (info) info.textContent = fmtLogDay(s.day || todayKey(new Date(s.startAt || Date.now()))) +
    ' · ' + fmtT(s.startAt) + '–' + fmtT(s.endAt) + ' · ' + msToHHMMSS(s.ms || 0);
  const opts = [...(els.subjectSelect ? els.subjectSelect.options : [])].filter(o => o.value);
  let h = `<button data-ss="" class="${s.subject ? '' : 'on'}">🚫 <span>Dersiz</span></button>`;
  h += opts.map(o => `<button data-ss="${escapeHtml(o.value)}" class="${o.value === s.subject ? 'on' : ''}">📖 <span>${escapeHtml(o.value)}</span></button>`).join('');
  if (!opts.length) h += '<div class="sm-empty">Henüz ders yok — üst çubuktaki ＋ ile ekleyebilirsin</div>';
  if (list) list.innerHTML = h;
  if (m) m.classList.add('open');
});
(function wireSessModal(){
  const m = document.getElementById('sessModal'); if (!m) return;
  const close = () => { m.classList.remove('open'); sessEditKey = null; };
  document.getElementById('sessClose').onclick = close;
  m.addEventListener('click', e => { if (e.target === m) close(); });
  document.getElementById('sessSubjList').addEventListener('click', async e => {
    const b = e.target.closest('[data-ss]'); if (!b || !sessEditKey) return;
    const uid = (auth.currentUser || {}).uid; if (!uid) return;
    const val = b.getAttribute('data-ss');
    try {
      await update(ref(db, `sessions/${uid}/${sessEditKey}`), { subject: val || null });
      toast(val ? ('Ders güncellendi: ' + val + ' 📖') : 'Ders kaldırıldı');
      close();
    } catch(err){ toast(err.message); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && m.classList.contains('open')) close(); });
})();
if (els.profAvatarBtn) els.profAvatarBtn.onclick = () => els.profAvatarFile.click();
if (els.profAvatarFile) els.profAvatarFile.addEventListener('change', async () => {
  const f = els.profAvatarFile.files && els.profAvatarFile.files[0];
  els.profAvatarFile.value = '';
  const u = auth.currentUser;
  if (!f || !u) return;
  try {
    toast('Fotoğraf yükleniyor…');
    const blob = await pCompress(f);
    const path = `avatars/${u.uid}.jpg`;
    const sr = sRef(storage, path);
    await uploadBytesResumable(sr, blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=604800' });
    const url = await getDownloadURL(sr);
    await update(ref(db, `users/${u.uid}`), { avatar: url });
    renderProfAvatar();
    toast('Profil fotoğrafın güncellendi 🖼');
  } catch(e){ toast('Yüklenemedi: ' + (e && e.message ? e.message : e)); }
});
if (els.profNameSave) els.profNameSave.onclick = async () => {
  const u = auth.currentUser; if (!u) return;
  const val = (els.profName.value || '').trim();
  if (!val){ toast('İsim boş olamaz 🙂'); return; }
  try {
    await updateProfile(u, { displayName: val });
    await update(ref(db, `users/${u.uid}`), { displayName: val });
    renderAuthChip(u);
    toast('Görünen ad güncellendi ✓');
  } catch(e){ toast(e.message); }
};
if (els.profLogout) els.profLogout.onclick = async () => {
  if (!confirm('Çıkış yapmak istediğine emin misin?')) return;
  try { closeProf(); await signOut(auth); } catch(e){ toast(e.message); }
};

