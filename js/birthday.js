/* =========================================================
   BIRTHDAY ADDITIONS — lightbox, countdown, travel guide.
   Runs last so it can safely wrap hooks defined above.
   ========================================================= */
(function(){
  const $ = id => document.getElementById(id);
  const bday = $('birthdayView');
  const esc = s => (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* ================= 1) PHOTO LIGHTBOX ================= */
  const lb = $('lightbox'), lbImg = $('lbImg'), lbCap = $('lbCap'), lbCount = $('lbCount');
  let lbItems = [], lbIdx = 0;
  function lbCollect(sel){
    lbItems = [...document.querySelectorAll(sel)].map(img => ({
      src: img.src,
      cap: img.closest('.photo-card')
        ? ((img.closest('.photo-card').querySelector('.photo-cap') || {}).textContent || '')
        : (img.getAttribute('alt') || '')
    }));
  }
  function lbShow(i){
    if (!lbItems.length) return;
    lbIdx = (i + lbItems.length) % lbItems.length;
    lbImg.src = lbItems[lbIdx].src;
    lbCap.textContent = lbItems[lbIdx].cap;
    lbCount.textContent = (lbIdx + 1) + ' / ' + lbItems.length;
  }
  function lbClose(){ lb.classList.remove('open'); lbImg.src = ''; }
  document.addEventListener('click', e => {
    const g = e.target.closest('#galleryGrid .photo-card img');
    const t = e.target.closest('#crPhotos .cr-ph img');
    const p = e.target.closest('#crPlaces .pl-ph img');
    const img = g || t || p;
    if (!img) return;
    lbCollect(g ? '#galleryGrid .photo-card img' : (t ? '#crPhotos .cr-ph img' : '#crPlaces .pl-ph img'));
    const idx = lbItems.findIndex(it => it.src === img.src);
    lbShow(idx < 0 ? 0 : idx);
    lb.classList.add('open');
  });
  $('lbClose').addEventListener('click', lbClose);
  $('lbPrev').addEventListener('click', () => lbShow(lbIdx - 1));
  $('lbNext').addEventListener('click', () => lbShow(lbIdx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) lbClose(); });
  let touchX = null;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive:true });
  lb.addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 40) lbShow(lbIdx + (dx < 0 ? 1 : -1));
  }, { passive:true });

  /* ================= 2) COUNTDOWN → 11 Haziran 2028 ================= */
  const CD_START = new Date('2025-06-03T00:00:00');   // yolculuğun başı (istersen değiştir)
  const CD_END   = new Date('2028-06-11T00:00:00');   // hedef: 11 Haziran 2028
  const pad = n => String(n).padStart(2, '0');
  let weeksBuilt = -2;
  function renderCountdown(){
    if (!bday.classList.contains('open')) return;
    const sec = $('geriSayim');
    if (!sec || !sec.classList.contains('active')) return;
    const now = Date.now();
    let left = CD_END - now;
    const done = left <= 0; if (done) left = 0;
    $('cdD').textContent = Math.floor(left / 86400000);
    $('cdH').textContent = pad(Math.floor(left / 3600000) % 24);
    $('cdM').textContent = pad(Math.floor(left / 60000) % 60);
    $('cdS').textContent = pad(Math.floor(left / 1000) % 60);

    const total = CD_END - CD_START;
    const passed = Math.min(total, Math.max(0, now - CD_START));
    const pct = passed / total * 100;
    $('cdFill').style.width = pct + '%';
    $('cdPlane').style.left = pct + '%';
    $('cdPct').textContent = done ? 'O gün geldi!! 🎉💖' : '%' + pct.toFixed(2) + '\u2019ini beraber yürüdük bilee';
    $('cdPassed').textContent = '💘 ' + Math.floor(passed / 86400000) + '\u2019i geçti';
    $('cdLeft').textContent = '⏳ ' + Math.ceil(left / 86400000) + '\u2019i kaldı';

    const wk = 7 * 86400000;
    const totalWeeks = Math.ceil(total / wk);
    const curWeek = done ? totalWeeks : Math.min(totalWeeks - 1, Math.floor(passed / wk));
    if (curWeek !== weeksBuilt){
      weeksBuilt = curWeek;
      let out = '';
      for (let i = 0; i < totalWeeks; i++){
        if (i < curWeek) out += '<span>❤️</span>';
        else if (i === curWeek && !done) out += '<span class="now">💗</span>';
        else out += '<span>🤍</span>';
      }
      $('cdWeeks').innerHTML = out;
    }
  }
  setInterval(renderCountdown, 1000);

  /* ================= 3) TRAVEL GUIDE (own PIN, fully editable) ================= */
  /* ====== CHANGE THE TRAVEL PIN HERE ====== */
  /* ======================================== */

  /* İçerik artık veritabanında (travelGuide/). Aşağıdaki SEED sadece ilk
     açılışta bir kere yüklenir; sonrasında her şey siteden düzenlenir. */
  const TRAVEL_SEED = [
    { id:'ingiltere', name:'İngiltere', flag:'🇬🇧', tag:'çay, yağmur, kırmızı otobüsler', grad1:'#5b79e3', grad2:'#23368f', cities:[
      { id:'londra', name:'Londra', emoji:'🎡', tag:'iki kişilik bir şehir masalı', best:'Nisan–Haziran',
        paras:'Big Ben\'in önünde klasik turist fotoğrafı, sonra Thames kenarında amaçsız yürüyüş. Kırmızı telefon kulübesinde saçma pozlar zorunlu.\n\nCamden Market\'te dünya mutfağından atıştırıp Notting Hill\'in renkli kapılarını sayacağız. British Museum bedava — yağmurlu güne birebir.',
        todo:'Westminster\'dan Tower Bridge\'e nehir yürüyüşü\nÇift katlı otobüsün üst katında en ön koltuk\nCamden Market\'te bir şeyler atıştırmak\nNotting Hill\'de en güzel kapıyı seçme yarışması' },
      { id:'oxford', name:'Oxford', emoji:'📚', tag:'kitap kokulu sokaklar', best:'Mayıs–Eylül',
        paras:'Dünyanın en eski üniversite şehirlerinden birinde, taş avlular ve bisikletli öğrenciler arasında bir gün.\n\nChrist Church\'ün yemekhanesi Harry Potter\'daki büyük salonun ilhamı — girip "birinci sınıflar buraya" diye fısıldaşacağız.',
        todo:'Bodleian Kütüphanesi turu\nChrist Church yemekhanesi\nCovered Market\'te cookie molası\nNehirde punting (sandal) denemesi' },
      { id:'bath', name:'Bath', emoji:'🛁', tag:'bal rengi taştan bir şehir', best:'Nisan–Ekim',
        paras:'Romalılardan kalma hamamların etrafına kurulmuş, tamamı bal rengi taştan minicik bir şehir. Her sokağı kartpostal.\n\nJane Austen buralıymış; biz de Pulteney Köprüsü\'nde durup 200 yıl öncesini hayal edeceğiz.',
        todo:'Roma Hamamları\nRoyal Crescent önünde piknik\nSally Lunn\'s\'ta meşhur çörek\nTermal çatı havuzunda gün batımı' }
    ]},
    { id:'turkiye', name:'Türkiye', flag:'🇹🇷', tag:'bizim evimiz, baştan keşif', grad1:'#e34d4d', grad2:'#8f1d1d', cities:[
      { id:'istanbul', name:'İstanbul', emoji:'🌉', tag:'iki kıta, bir biz', best:'Nisan–Mayıs, Eylül–Ekim',
        paras:'Karaköy\'den vapura binip martılara simit atarak Kadıköy\'e geçmek — dünyanın en ucuz ve en güzel "cruise"u.\n\nBalat\'ın renkli merdivenleri, Kapalıçarşı\'nın labirenti, gece Galata\'nın ışıkları. Aynı şehirde yüz farklı şehir var.',
        todo:'Boğaz vapurunda çay + simit\nBalat\'ta fotoğraf turu\nKadıköy\'de sokak lezzetleri\nGece Galata Kulesi çevresinde yürüyüş' },
      { id:'kapadokya', name:'Kapadokya', emoji:'🎈', tag:'gün doğumunda yüzlerce balon', best:'Nisan–Haziran, Eylül–Kasım',
        paras:'Sabah 5\'te kalkmaya değecek tek şey: vadinin üzerinde aynı anda yükselen yüzlerce sıcak hava balonu.\n\nPeri bacalarının arasında yürüyüş, mağara otelde kalma deneyimi ve testi kebabı. Başka gezegen gibi ama iki saat uçuş mesafesinde.',
        todo:'Balon turu (ya da en azından izleme terası)\nMağara otelde bir gece\nGüvercinlik Vadisi yürüyüşü\nTesti kebabı seremonisi' },
      { id:'izmir', name:'İzmir', emoji:'🌊', tag:'gün batımı Kordon\'da güzel', best:'Mayıs–Ekim',
        paras:'Kordon\'da çimlere oturup denize karşı gün batımı — İzmir\'in en meşhur aktivitesi ve tamamen bedava.\n\nSabah boyoz + çay, öğlen Alaçatı\'nın taş sokakları, akşam Urla\'da sakin bir yemek. Ege modunda yavaşlamak serbest.',
        todo:'Kordon\'da gün batımı\nBoyoz + kumru turu\nAlaçatı gezisi\nTarihi Asansör\'den manzara' }
    ]},
    { id:'avusturya', name:'Avusturya', flag:'🇦🇹', tag:'valsler ve dağ kasabaları', grad1:'#c94f6d', grad2:'#5e1c33', cities:[
      { id:'viyana', name:'Viyana', emoji:'🎻', tag:'kahvehanelerin başkenti', best:'Nisan–Haziran, Aralık',
        paras:'Viyana kahvehanesi bir mekân değil, bir yaşam biçimi: bir sacher torte, bir melange ve saatlerce oturma hakkı.\n\nSchönbrunn Sarayı\'nın bahçelerinde imparator gibi yürüyüp akşam bir konser salonuna sızacağız. Aralıkta gelirsek Noel pazarları ekstra büyü.',
        todo:'Café Central\'de sacher torte\nSchönbrunn bahçeleri\nBir klasik müzik konseri\nNoel pazarı (kış planı)' },
      { id:'salzburg', name:'Salzburg', emoji:'🏰', tag:'Mozart\'ın şehri', best:'Mayıs–Eylül',
        paras:'Alplerin eteğinde, nehrin ikiye böldüğü minyatür bir barok şehir. Tepedeki kale her sokaktan görünüyor.\n\nMozart burada doğmuş; biz de doğduğu evin önünden geçip "yetenek bulaşıcı olsa keşke" diyeceğiz.',
        todo:'Hohensalzburg Kalesi\nGetreidegasse\'de vitrin turu\nMirabell bahçeleri\nMozartkugel tadımı' },
      { id:'hallstatt', name:'Hallstatt', emoji:'🏞️', tag:'göl kenarında bir masal', best:'Mayıs–Ekim',
        paras:'Dağla göl arasına sıkışmış, kartpostalların bile abartamadığı bir köy. Nüfusu bin kişilik ama güzelliği bin şehirlik.\n\nGöl kenarında oturup su sesini dinlemekten başka plan yapmaya gerek yok. Zaten başka yapacak bir şey de yok — olay bu.',
        todo:'Klasik Hallstatt manzara noktası\nGölde kürek teknesi\nSkywalk seyir terası\nKöy fırınından taze bir şeyler' }
    ]},
    { id:'norvec', name:'Norveç', flag:'🇳🇴', tag:'fiyortlar ve kuzey ışıkları', grad1:'#3e7ea6', grad2:'#12324a', cities:[
      { id:'oslo', name:'Oslo', emoji:'🛶', tag:'deniz kenarında modern kuzey', best:'Mayıs–Ağustos',
        paras:'Opera binasının çatısına yürüyerek çıkılıyor — şehir ayaklarının altında, deniz burnunun dibinde.\n\nMüze adası Bygdøy\'de viking gemileri, sonra limanda taze bir şeyler. Pahalı ama planlamak bedava.',
        todo:'Opera çatısında yürüyüş\nViking Gemi Müzesi\nAker Brygge limanı\nVigeland heykel parkı' },
      { id:'bergen', name:'Bergen', emoji:'🌧️', tag:'yedi dağın ve yağmurun şehri', best:'Haziran–Ağustos',
        paras:'Bryggen\'in rengarenk ahşap evleri UNESCO listesinde; her biri yamuk yumuk ve tam da o yüzden mükemmel.\n\nFløyen fünikülerine binip yukarıdan fiyortlara bakacağız. Yağmur yağarsa — ki yağacak — şehrin en meşhur ikramı sayılır.',
        todo:'Bryggen rıhtımı\nFløyen tepesine füniküler\nBalık pazarı\nFiyort turu başlangıcı' },
      { id:'tromso', name:'Tromsø', emoji:'🌌', tag:'kuzey ışıklarının kapısı', best:'Eylül–Mart (ışıklar için)',
        paras:'Kutup dairesinin üstünde, kışın gökyüzünün yeşile boyandığı yer. Aurora görmek garantili değil — o yüzden gördüğünde efsane.\n\nKızak köpekleri, ren geyikleri ve gece yarısı hâlâ aydınlık yazlar. Kışın gidersek termal içlik ciddi bir yatırım.',
        todo:'Kuzey ışıkları avı turu\nFjellheisen teleferiği\nHusky kızak deneyimi\nArctic Cathedral' }
    ]},
    { id:'japonya', name:'Japonya', flag:'🇯🇵', tag:'neon, tapınak ve ramen', grad1:'#e05f7f', grad2:'#7e1e3c', cities:[
      { id:'tokyo', name:'Tokyo', emoji:'🗼', tag:'geleceğe kısa bir gezi', best:'Mart–Nisan (sakura), Ekim–Kasım',
        paras:'Shibuya kavşağında bir anda binlerce kişiyle karşıdan karşıya geçmek — kaosun bu kadar düzenli olabildiği tek yer.\n\nSabah huzurlu bir tapınak, öğlen Akihabara\'da oyun makineleri, gece bir ramen tezgâhında sessiz mutluluk. Hepsi aynı gün.',
        todo:'Shibuya kavşağı + Hachiko\nSenso-ji Tapınağı\nAkihabara arcade turu\nGerçek bir ramen dükkânı' },
      { id:'kyoto', name:'Kyoto', emoji:'⛩️', tag:'bin kapının şehri', best:'Mart–Nisan, Kasım',
        paras:'Fushimi Inari\'nin binlerce turuncu kapısının altından tepeye yürüyüş — sabah erken gidersek yol sadece bizim.\n\nArashiyama bambu ormanında rüzgârın sesi, Gion\'da eski ahşap sokaklar. Kyoto acele edilmeyecek bir şehir.',
        todo:'Fushimi Inari torii yolu\nArashiyama bambu ormanı\nGion\'da akşam yürüyüşü\nBir çay seremonisi' },
      { id:'osaka', name:'Osaka', emoji:'🐙', tag:'Japonya\'nın mutfağı', best:'Mart–Mayıs, Ekim–Kasım',
        paras:'Şehrin sloganı "kuidaore": yemekten iflas etmek. Dotonbori\'nin neonları altında takoyaki, okonomiyaki, tekrar takoyaki.\n\nİnsanları Tokyo\'dan daha gürültücü, daha şakacı. Sokak yemeği turu burada olimpik spor sayılır.',
        todo:'Dotonbori gece turu\nTakoyaki tadımı\nOsaka Kalesi\nKuromon pazarı kahvaltısı' }
    ]},
    { id:'cin', name:'Çin', flag:'🇨🇳', tag:'sur, panda ve neon', grad1:'#d1483b', grad2:'#6e150d', cities:[
      { id:'pekin', name:'Pekin', emoji:'🏮', tag:'imparatorların başkenti', best:'Nisan–Mayıs, Eylül–Ekim',
        paras:'Çin Seddi\'nin Mutianyu bölümünde kalabalıktan uzak yürüyüş — uzaydan görünmüyormuş ama tepesinden dünya görünüyor.\n\nYasak Şehir\'in avlularında yarım gün kaybolmak serbest. Akşam Pekin ördeği ile taçlandırma zorunlu.',
        todo:'Çin Seddi (Mutianyu)\nYasak Şehir\nPekin ördeği yemeği\nHutong sokaklarında bisiklet' },
      { id:'sanghay', name:'Şanghay', emoji:'🌃', tag:'gelecek şimdiden burada', best:'Mart–Mayıs, Eylül–Kasım',
        paras:'Bund\'da nehrin bir yakası 1920\'ler Avrupa\'sı, karşı yakası bilim kurgu filmi seti. Gece ışıklar açılınca inanması zor.\n\nYu Bahçesi\'nin göletleri, Fransız Mahallesi\'nin platanlı sokakları ve dünyanın en hızlı trenlerinden biri. Kontrast şehri.',
        todo:'Bund\'da gece silüeti\nYu Bahçesi\nFransız Mahallesi yürüyüşü\nMaglev trenine binmek' },
      { id:'chengdu', name:'Chengdu', emoji:'🐼', tag:'pandalar!! (ve hotpot)', best:'Mart–Haziran, Eylül–Kasım',
        paras:'Panda araştırma merkezinde sabah erken saat: bambu çiğneyen, yuvarlanan, hiçbir şeyi umursamayan pandalar. Gezinin duygusal zirvesi burası olabilir.\n\nAkşam Sichuan hotpot — "az acılı" bile ciddiye alınacak seviyede. Yanına soğuk bir şeyler şart.',
        todo:'Panda merkezi (sabah erken!)\nSichuan hotpot deneyimi\nJinli antik sokağı\nHalk parkında çay bahçesi' }
    ]}
  ];

  const countryGrid = $('countryGrid'), cityWrap = $('cityWrap'), cityGrid = $('cityGrid'), cityHead = $('cityHead');
  const reader = $('cityReader');
  const tgModal = $('tgModal'), tgFields = $('tgFields'), tgTitle = $('tgTitle');
  let travelUnlocked = true, travelInited = false, travelData = {}, fb2 = null;
  let guideRaw = null;           // travelGuide/ snapshot (null = henüz gelmedi)
  let seedTried = false;
  let editMode = false;
  let curCountryId = null, curCityId = null;

  function relockTravel(){
    // şifre kaldırıldı; sadece görünümleri başa sar
    editMode = false;
    if ($('tgEditBtn')) $('tgEditBtn').textContent = '✏️ Düzenle';
    closeTgModal();
    closeReader();
    showCountries();
  }

  /* hook into the existing tab switcher + close handler */
  const origShow = window.showBirthdaySection;
  window.showBirthdaySection = function(id){
    origShow(id);
    if (id === 'seyahat') initTravel();
    else relockTravel();
    if (id === 'geriSayim') renderCountdown();
  };
  const prevClose = window.onBirthdayClose;
  window.onBirthdayClose = function(){
    if (prevClose) prevClose();
    relockTravel();
    lbClose();
  };

  /* ---- data ----
     travelGuide/countries/{cid} = { name, flag, tag, grad1, grad2, order,
         cities/{ctid} = { name, emoji, tag, best, paras, todo, order, photos/{k}:{img,by,at} } }
     travel/{ctid} = { visited, notes } (eski yapı, aynen korunur)          */
  const me = () => (window.fb && window.fb.auth) ? window.fb.auth.currentUser : null;

  function initTravel(){
    showCountries();
    if (travelInited) return; travelInited = true;
    const hook = _fb => {
      fb2 = _fb;
      fb2.onValue(fb2.ref(fb2.db, 'travel'), s => { travelData = s.val() || {}; refreshTravelUI(); });
      fb2.onValue(fb2.ref(fb2.db, 'travelGuide'), s => {
        guideRaw = s.val() || {};
        maybeSeed();
        refreshTravelUI();
      });
    };
    if (window.fb) hook(window.fb);
    else window.addEventListener('fb-ready', () => hook(window.fb), { once:true });
  }

  function maybeSeed(){
    if (seedTried || !fb2 || !me()) return;
    if (guideRaw && Object.keys(guideRaw.countries || {}).length) return;
    seedTried = true;
    const writes = {};
    TRAVEL_SEED.forEach((c, ci) => {
      const cities = {};
      c.cities.forEach((ct, cti) => {
        cities[ct.id] = { name: ct.name, emoji: ct.emoji, tag: ct.tag, best: ct.best, paras: ct.paras, todo: ct.todo, order: cti };
      });
      writes['travelGuide/countries/' + c.id] = { name: c.name, flag: c.flag, tag: c.tag, grad1: c.grad1, grad2: c.grad2, order: ci, cities };
    });
    fb2.update(fb2.ref(fb2.db), writes).catch(e => console.error('travel seed failed:', e && e.message));
  }

  /* normalized views over the data (falls back to SEED until DB loads) */
  function countryList(){
    const src = (guideRaw && Object.keys(guideRaw.countries || {}).length) ? guideRaw.countries : null;
    if (!src){
      return TRAVEL_SEED.map((c, i) => Object.assign({ id: c.id, order: i }, c));
    }
    return Object.entries(src).map(([id, c]) => Object.assign({ id }, c))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name), 'tr'));
  }
  function cityList(c){
    if (Array.isArray(c.cities)) return c.cities.map((ct, i) => Object.assign({ id: ct.id, order: i }, ct)); // seed fallback
    return Object.entries(c.cities || {}).map(([id, ct]) => Object.assign({ id }, ct))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name), 'tr'));
  }
  function findCountry(cid){ return countryList().find(c => c.id === cid) || null; }
  function findCity(cid, ctid){
    const c = findCountry(cid); if (!c) return null;
    const ct = cityList(c).find(x => x.id === ctid);
    return ct ? { c, ct } : null;
  }
  const parasArr = ct => String(ct.paras || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  const todoArr = ct => String(ct.todo || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  const gradOf = c => 'linear-gradient(135deg,' + (c.grad1 || '#c94f6d') + ',' + (c.grad2 || '#5e1c33') + ')';

  function totalCities(){ return countryList().reduce((a, c) => a + cityList(c).length, 0); }
  function visitedCount(){
    let n = 0;
    countryList().forEach(c => cityList(c).forEach(ct => { if ((travelData[ct.id] || {}).visited) n++; }));
    return n;
  }
  function renderProgress(){
    $('travelProgress').textContent = '✔ ' + visitedCount() + ' / ' + totalCities() + ' şehir gezildi';
  }

  /* ---- edit mode ---- */
  $('tgEditBtn').addEventListener('click', () => {
    if (!me()){ toast('Düzenlemek için önce Çalışma Odası\u2019na giriş yapmalısın 💗'); return; }
    editMode = !editMode;
    $('tgEditBtn').textContent = editMode ? '✔ Düzenleme bitti' : '✏️ Düzenle';
    refreshTravelUI(true);
  });

  /* ---- views: countries → cities → reader ---- */
  function showCountries(){
    curCountryId = null;
    cityWrap.style.display = 'none';
    countryGrid.style.display = '';
    renderProgress();
    countryGrid.innerHTML = countryList().map(c => `
      <div class="t-country" role="button" tabindex="0" data-c="${c.id}" style="background:${gradOf(c)}">
        <div class="fl">${esc(c.flag || '🌍')}</div>
        <div class="nm">${esc(c.name)}</div>
        <div class="tg">${esc(c.tag || '')}</div>
        <div class="ct">${cityList(c).length} şehir</div>
        ${editMode ? `<div class="t-mini"><button data-act="editc" data-c="${c.id}">✏️</button><button data-act="delc" data-c="${c.id}">🗑</button></div>` : ''}
      </div>`).join('')
      + (editMode ? '<div class="t-add" role="button" tabindex="0" data-act="addc">＋ Ülke ekle</div>' : '');
  }
  function showCities(cid){
    const c = findCountry(cid); if (!c){ showCountries(); return; }
    curCountryId = cid;
    countryGrid.style.display = 'none';
    cityWrap.style.display = '';
    cityHead.textContent = (c.flag || '🌍') + ' ' + c.name;
    cityGrid.innerHTML = cityList(c).map(ct => {
      const v = (travelData[ct.id] || {}).visited;
      return `<div class="t-city" role="button" tabindex="0" data-city="${ct.id}">
        <div class="hero" style="background:${gradOf(c)}">${esc(ct.emoji || '📍')}</div>
        <div class="b">
          <div class="nm">${esc(ct.name)}${v ? ' <span style="color:#1c8a44">✔</span>' : ''}</div>
          <div class="tg">${esc(ct.tag || '')}</div>
        </div>
        ${editMode ? `<div class="t-mini"><button data-act="editct" data-city="${ct.id}">✏️</button><button data-act="delct" data-city="${ct.id}">🗑</button></div>` : ''}
      </div>`;
    }).join('')
      + (editMode ? '<div class="t-add" role="button" tabindex="0" data-act="addct">＋ Şehir ekle</div>' : '');
  }
  function refreshTravelUI(force){
    if (!travelUnlocked) return;
    renderProgress();
    if (curCountryId && cityWrap.style.display !== 'none') showCities(curCountryId);
    else if (force || countryGrid.style.display !== 'none') showCountries();
    if (reader.classList.contains('open') && curCityId){
      const f = findCity(curCountryId, curCityId);
      if (f){ renderReaderContent(f); renderReaderLive(); }
      else closeReader();  // şehir silindi
    }
  }

  countryGrid.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]');
    if (act){
      const a = act.getAttribute('data-act');
      if (a === 'addc') return openCountryForm(null);
      if (a === 'editc') return openCountryForm(act.getAttribute('data-c'));
      if (a === 'delc') return deleteCountry(act.getAttribute('data-c'));
    }
    const b = e.target.closest('.t-country');
    if (b) showCities(b.getAttribute('data-c'));
  });
  $('cityBack').addEventListener('click', showCountries);
  cityGrid.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act){
      const a = act.getAttribute('data-act');
      if (a === 'addct') return openCityForm(curCountryId, null);
      if (a === 'editct') return openCityForm(curCountryId, act.getAttribute('data-city'));
      if (a === 'delct') return deleteCity(curCountryId, act.getAttribute('data-city'));
    }
    const b = e.target.closest('.t-city');
    if (b) openReader(curCountryId, b.getAttribute('data-city'));
  });

  /* ---- edit forms ---- */
  function openTgModal(){ tgModal.classList.add('open'); tgModal.setAttribute('aria-hidden', 'false'); }
  function closeTgModal(){ tgModal.classList.remove('open'); tgModal.setAttribute('aria-hidden', 'true'); tgFields.innerHTML = ''; tgSaveFn = null; }
  let tgSaveFn = null;
  $('tgCancel').addEventListener('click', closeTgModal);
  tgModal.addEventListener('click', e => { if (e.target === tgModal) closeTgModal(); });
  $('tgSave').addEventListener('click', async () => {
    if (!tgSaveFn) return;
    if (!me() || !fb2){ toast('Önce Çalışma Odası\u2019na giriş yapmalısın 💗'); return; }
    try { await tgSaveFn(); closeTgModal(); }
    catch(e){ toast('Kaydedilemedi: ' + e.message); }
  });
  const fld = (id, label, val, hint) =>
    `<div class="tg-field"><label>${label}</label><input type="text" id="${id}" value="${esc(val || '')}">${hint ? '<div class="hint">' + hint + '</div>' : ''}</div>`;
  const fldArea = (id, label, val, rows, hint) =>
    `<div class="tg-field"><label>${label}</label><textarea id="${id}" rows="${rows}">${esc(val || '')}</textarea>${hint ? '<div class="hint">' + hint + '</div>' : ''}</div>`;

  function openCountryForm(cid){
    const c = cid ? findCountry(cid) : null;
    tgTitle.textContent = c ? 'Ülkeyi düzenle' : 'Yeni ülke';
    tgFields.innerHTML =
      fld('tgfName', 'Ülke adı', c ? c.name : '') +
      fld('tgfFlag', 'Bayrak (emoji)', c ? c.flag : '🌍') +
      fld('tgfTag', 'Kısa slogan', c ? c.tag : '') +
      `<div class="tg-field"><label>Kart renkleri</label>
        <input type="color" id="tgfG1" value="${(c && c.grad1) || '#c94f6d'}">
        <input type="color" id="tgfG2" value="${(c && c.grad2) || '#5e1c33'}">
      </div>`;
    tgSaveFn = async () => {
      const name = $('tgfName').value.trim(); if (!name) throw new Error('İsim boş olamaz');
      const id = cid || ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      await fb2.update(fb2.ref(fb2.db, 'travelGuide/countries/' + id), {
        name, flag: $('tgfFlag').value.trim() || '🌍', tag: $('tgfTag').value.trim(),
        grad1: $('tgfG1').value, grad2: $('tgfG2').value,
        order: c ? (c.order ?? 0) : Date.now()
      });
    };
    openTgModal();
  }
  function openCityForm(cid, ctid){
    if (!cid) return;
    const f = ctid ? findCity(cid, ctid) : null;
    const ct = f ? f.ct : null;
    tgTitle.textContent = ct ? 'Şehri düzenle' : 'Yeni şehir';
    tgFields.innerHTML =
      fld('tgfName', 'Şehir adı', ct ? ct.name : '') +
      fld('tgfEmoji', 'Emoji', ct ? ct.emoji : '📍') +
      fld('tgfTag', 'Kısa slogan', ct ? ct.tag : '') +
      fld('tgfBest', 'En iyi zaman', ct ? ct.best : '') +
      fldArea('tgfParas', 'Yazılar', ct ? ct.paras : '', 7, 'Paragrafları arada boş satır bırakarak ayır. Gezilecek yerler şehir sayfasındaki "＋ Yer ekle" ile eklenir.');
    tgSaveFn = async () => {
      const name = $('tgfName').value.trim(); if (!name) throw new Error('İsim boş olamaz');
      const id = ctid || ('ct' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      await fb2.update(fb2.ref(fb2.db, 'travelGuide/countries/' + cid + '/cities/' + id), {
        name, emoji: $('tgfEmoji').value.trim() || '📍', tag: $('tgfTag').value.trim(),
        best: $('tgfBest').value.trim(), paras: $('tgfParas').value,
        order: ct ? (ct.order ?? 0) : Date.now()
      });
    };
    openTgModal();
  }
  async function deleteCountry(cid){
    if (!me() || !fb2){ toast('Önce giriş yapmalısın 💗'); return; }
    const c = findCountry(cid); if (!c) return;
    if (!await (window.ask ? window.ask : async m => window.confirm(m))('"' + c.name + '" ülkesini TÜM şehirleriyle silmek istediğine emin misin?')) return;
    const writes = { ['travelGuide/countries/' + cid]: null };
    cityList(c).forEach(ct => { writes['travel/' + ct.id] = null; });
    try { await fb2.update(fb2.ref(fb2.db), writes); }
    catch(e){ toast('Silinemedi: ' + e.message); }
  }
  async function deleteCity(cid, ctid){
    if (!me() || !fb2){ toast('Önce giriş yapmalısın 💗'); return; }
    const f = findCity(cid, ctid); if (!f) return;
    if (!await (window.ask ? window.ask : async m => window.confirm(m))('"' + f.ct.name + '" şehrini silmek istediğine emin misin?')) return;
    try {
      await fb2.update(fb2.ref(fb2.db), {
        ['travelGuide/countries/' + cid + '/cities/' + ctid]: null,
        ['travel/' + ctid]: null
      });
    } catch(e){ toast('Silinemedi: ' + e.message); }
  }

  /* ---- clean reader ---- */
  const openPlaces = new Set();          // hangi yerler açık (yeniden çizimde korunur)
  const migratedCities = new Set();
  let photoTarget = { type:'city', pid:null };

  function placesList(ct){
    if (ct.places && Object.keys(ct.places).length){
      return Object.entries(ct.places).map(([id, p]) => Object.assign({ id }, p))
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name), 'tr'));
    }
    // eski todo satırları (henüz taşınmadıysa) sadece görüntülemek için
    return todoArr(ct).map((t, i) => ({ id: 'p' + i, name: t, _virtual: true, order: i }));
  }
  function migratePlaces(f){
    // eski "todo" satırlarını kalıcı yerlere çevir (bir kere, giriş yapılmışsa)
    if (!me() || !fb2 || !f || migratedCities.has(f.ct.id)) return;
    if (f.ct.places && Object.keys(f.ct.places).length) return;
    const lines = todoArr(f.ct);
    if (!lines.length) return;
    migratedCities.add(f.ct.id);
    const base = 'travelGuide/countries/' + curCountryId + '/cities/' + f.ct.id;
    const writes = { [base + '/todo']: null };
    lines.forEach((t, i) => { writes[base + '/places/p' + i] = { name: t, order: i }; });
    fb2.update(fb2.ref(fb2.db), writes).catch(e => console.error('place migration failed:', e && e.message));
  }
  function openReader(cid, ctid){
    const f = findCity(cid, ctid); if (!f) return;
    curCountryId = cid; curCityId = ctid;
    openPlaces.clear();
    migratePlaces(f);
    renderReaderContent(f);
    renderReaderLive();
    reader.classList.add('open');
    reader.setAttribute('aria-hidden', 'false');
    reader.scrollTop = 0;
  }
  function placePhotosHTML(p){
    const photos = Object.entries(p.photos || {}).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => (a.at || 0) - (b.at || 0));
    const imgs = photos.map(ph =>
      (ph.img && /^data:image\//.test(ph.img))
        ? `<div class="pl-ph"><button class="ph-del" data-p="${p.id}" data-k="${ph.k}" title="Sil">✕</button><img src="${ph.img}" alt="${esc(p.name)}"></div>`
        : ''
    ).join('');
    return imgs ? '<div class="pl-photos">' + imgs + '</div>' : '';
  }
  function renderPlaces(f){
    const list = placesList(f.ct);
    const logged = !!me();
    $('crPlaces').innerHTML = list.length ? list.map(p => {
      const descPs = String(p.desc || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      return `<div class="pl ${openPlaces.has(p.id) ? 'open' : ''}" data-p="${p.id}">
        <div class="pl-head" data-toggle="${p.id}">
          <span class="pl-nm">${esc(p.emoji || '📍')} ${esc(p.name)}</span>
          <span class="pl-arrow">▶</span>
        </div>
        <div class="pl-body">
          ${descPs.length ? descPs.map(d => '<p>' + esc(d) + '</p>').join('') : '<div class="pl-empty">Henüz detay yok' + (logged ? ' — ✏️ ile ekle' : '') + '.</div>'}
          ${placePhotosHTML(p)}
          ${logged && !p._virtual ? `<div class="pl-actions">
            <button data-pact="edit" data-p="${p.id}">✏️ Düzenle</button>
            <button data-pact="photo" data-p="${p.id}">📷 Fotoğraf</button>
            <button data-pact="del" data-p="${p.id}">🗑 Sil</button>
          </div>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="pl-empty">Henüz yer eklenmemiş — "＋ Yer ekle" ile başlayın.</div>';
  }
  function renderReaderContent(f){
    $('crHero').style.background = gradOf(f.c);
    $('crEmoji').textContent = f.ct.emoji || '📍';
    $('crName').textContent = f.ct.name;
    $('crMeta').textContent = (f.c.flag || '🌍') + ' ' + f.c.name + (f.ct.best ? '  ·  en iyi zaman: ' + f.ct.best : '');
    const ps = parasArr(f.ct);
    $('crParas').innerHTML = ps.length ? ps.map(p => '<p>' + esc(p) + '</p>').join('') : '<p style="color:#c98aa0">Henüz yazı yok — ✏️ Düzenle ile ekleyin.</p>';
    renderPlaces(f);
    const photos = Object.entries(f.ct.photos || {}).map(([k, v]) => Object.assign({ k }, v)).sort((a, b) => (a.at || 0) - (b.at || 0));
    $('crPhotos').innerHTML = photos.map(p =>
      (p.img && /^data:image\//.test(p.img))
        ? `<div class="cr-ph"><button class="ph-del" data-k="${p.k}" title="Sil">✕</button><img src="${p.img}" alt="${esc(f.ct.name)}"></div>`
        : ''
    ).join('');
  }
  function closeReader(){
    reader.classList.remove('open');
    reader.setAttribute('aria-hidden', 'true');
    curCityId = null;
  }
  $('crClose').addEventListener('click', closeReader);
  function renderReaderLive(){
    if (!curCityId) return;
    const d = travelData[curCityId] || {};
    const btn = $('crVisit');
    btn.textContent = d.visited ? '✔ Gittik!' : '🧳 Henüz gitmedik — işaretle';
    btn.classList.toggle('on', !!d.visited);
    const notes = Object.entries(d.notes || {})
      .map(([k, v]) => Object.assign({ k }, v))
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    $('crNotes').innerHTML = notes.length
      ? notes.map(n => '<div class="n">' + esc(n.text) + '<div class="m">' + esc(n.by || 'Biri') + ' · ' + new Date(n.at || 0).toLocaleDateString('tr-TR') + '</div></div>').join('')
      : '<div style="color:#c98aa0;font-size:.9rem;margin-top:8px">Henüz not yok — ilkini sen bırak 💌</div>';
    $('crNoteHint').textContent = me() ? '' : 'Not bırakmak, düzenlemek ve ✔ işaretlemek için Çalışma Odası girişi gerekli';
  }
  $('crVisit').addEventListener('click', async () => {
    if (!curCityId) return;
    if (!me() || !fb2){ $('crNoteHint').textContent = 'Önce Çalışma Odası\u2019na giriş yapmalısın 💗'; return; }
    const cur = !!((travelData[curCityId] || {}).visited);
    try { await fb2.update(fb2.ref(fb2.db, 'travel/' + curCityId), { visited: !cur }); }
    catch(e){ toast('Kaydedilemedi: ' + e.message); }
  });
  $('crEdit').addEventListener('click', () => {
    if (!curCityId) return;
    if (!me()){ $('crNoteHint').textContent = 'Önce Çalışma Odası\u2019na giriş yapmalısın 💗'; return; }
    openCityForm(curCountryId, curCityId);
  });
  $('crNoteBtn').addEventListener('click', async () => {
    const u = me();
    if (!u || !fb2){ $('crNoteHint').textContent = 'Önce Çalışma Odası\u2019na giriş yapmalısın 💗'; return; }
    const t = ($('crNoteInput').value || '').trim().slice(0, 200);
    if (!t || !curCityId) return;
    const key = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    try {
      await fb2.update(fb2.ref(fb2.db, 'travel/' + curCityId + '/notes/' + key), { text: t, by: u.displayName || u.email, at: Date.now() });
      $('crNoteInput').value = '';
    } catch(e){ toast('Kaydedilemedi: ' + e.message); }
  });
  $('crNoteInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('crNoteBtn').click(); });

  /* ---- city photos (compressed, stored with the city) ---- */
  function tgCompress(file, maxDim, quality){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = e => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
          else if (h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject; img.src = e.target.result;
      };
      r.onerror = reject; r.readAsDataURL(file);
    });
  }
  $('crPhotoAdd').addEventListener('click', () => {
    if (!curCityId) return;
    if (!me()){ $('crNoteHint').textContent = 'Önce Çalışma Odası\u2019na giriş yapmalısın 💗'; return; }
    photoTarget = { type:'city', pid:null };
    $('tgPhotoFile').click();
  });
  $('tgPhotoFile').addEventListener('change', async () => {
    const file = $('tgPhotoFile').files && $('tgPhotoFile').files[0];
    $('tgPhotoFile').value = '';
    const u = me();
    if (!file || !u || !fb2 || !curCityId) return;
    const cityBase = 'travelGuide/countries/' + curCountryId + '/cities/' + curCityId;
    const path = photoTarget.type === 'place'
      ? cityBase + '/places/' + photoTarget.pid + '/photos/'
      : cityBase + '/photos/';
    const btn = $('crPhotoAdd'); const old = btn.textContent;
    btn.textContent = '⏳ Yükleniyor…'; btn.disabled = true;
    try {
      const img = await tgCompress(file, 1280, 0.82);
      const key = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      await fb2.update(fb2.ref(fb2.db, path + key), { img, by: u.displayName || u.email, at: Date.now() });
    } catch(e){ toast('Yüklenemedi: ' + e.message); }
    btn.textContent = old; btn.disabled = false;
    photoTarget = { type:'city', pid:null };
  });
  $('crPhotos').addEventListener('click', async e => {
    const del = e.target.closest('.ph-del');
    if (!del) return;
    if (!me() || !fb2){ $('crNoteHint').textContent = 'Önce giriş yapmalısın 💗'; return; }
    if (!await (window.ask ? window.ask : async m => window.confirm(m))('Bu fotoğrafı silmek istediğine emin misin?')) return;
    try {
      await fb2.update(fb2.ref(fb2.db, 'travelGuide/countries/' + curCountryId + '/cities/' + curCityId + '/photos'), { [del.getAttribute('data-k')]: null });
    } catch(err){ toast('Silinemedi: ' + err.message); }
  });

  /* ---- places: add / edit / delete / expand / photos ---- */
  function openPlaceForm(pid){
    if (!curCityId) return;
    const f = findCity(curCountryId, curCityId); if (!f) return;
    const p = pid ? ((f.ct.places || {})[pid] || null) : null;
    tgTitle.textContent = p ? 'Yeri düzenle' : 'Yeni yer';
    tgFields.innerHTML =
      fld('tgfName', 'Yer adı', p ? p.name : '') +
      fld('tgfEmoji', 'Emoji', p ? (p.emoji || '📍') : '📍') +
      fldArea('tgfDesc', 'Detaylar', p ? p.desc : '', 6, 'Paragrafları arada boş satır bırakarak ayır');
    tgSaveFn = async () => {
      const name = $('tgfName').value.trim(); if (!name) throw new Error('İsim boş olamaz');
      const id = pid || ('pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
      await fb2.update(fb2.ref(fb2.db, 'travelGuide/countries/' + curCountryId + '/cities/' + curCityId + '/places/' + id), {
        name, emoji: $('tgfEmoji').value.trim() || '📍', desc: $('tgfDesc').value,
        order: p ? (p.order ?? 0) : Date.now()
      });
      openPlaces.add(id);
    };
    openTgModal();
  }
  $('crPlaceAdd').addEventListener('click', () => {
    if (!curCityId) return;
    if (!me()){ $('crNoteHint').textContent = 'Önce Çalışma Odası\u2019na giriş yapmalısın 💗'; return; }
    openPlaceForm(null);
  });
  $('crPlaces').addEventListener('click', async e => {
    // fotoğraf sil
    const phDel = e.target.closest('.ph-del');
    if (phDel){
      if (!me() || !fb2) return;
      if (!await (window.ask ? window.ask : async m => window.confirm(m))('Bu fotoğrafı silmek istediğine emin misin?')) return;
      try {
        await fb2.update(fb2.ref(fb2.db, 'travelGuide/countries/' + curCountryId + '/cities/' + curCityId + '/places/' + phDel.getAttribute('data-p') + '/photos'), { [phDel.getAttribute('data-k')]: null });
      } catch(err){ toast('Silinemedi: ' + err.message); }
      return;
    }
    // aksiyon butonları
    const act = e.target.closest('[data-pact]');
    if (act){
      const pid = act.getAttribute('data-p');
      const a = act.getAttribute('data-pact');
      if (!me() || !fb2){ $('crNoteHint').textContent = 'Önce giriş yapmalısın 💗'; return; }
      if (a === 'edit') return openPlaceForm(pid);
      if (a === 'photo'){ photoTarget = { type:'place', pid }; $('tgPhotoFile').click(); return; }
      if (a === 'del'){
        const f = findCity(curCountryId, curCityId);
        const p = f && (f.ct.places || {})[pid];
        if (!await (window.ask ? window.ask : async m => window.confirm(m))('"' + ((p && p.name) || 'Bu yeri') + '" silmek istediğine emin misin?')) return;
        try {
          await fb2.update(fb2.ref(fb2.db, 'travelGuide/countries/' + curCountryId + '/cities/' + curCityId + '/places'), { [pid]: null });
          openPlaces.delete(pid);
        } catch(err){ toast('Silinemedi: ' + err.message); }
        return;
      }
    }
    // aç / kapat
    const head = e.target.closest('.pl-head');
    if (head){
      const pid = head.getAttribute('data-toggle');
      if (openPlaces.has(pid)) openPlaces.delete(pid); else openPlaces.add(pid);
      const f = findCity(curCountryId, curCityId);
      if (f) renderPlaces(f);
    }
  });

  /* ---- keyboard: capture phase so Esc closes overlays first,
         without also closing the whole birthday view ---- */
  document.addEventListener('keydown', e => {
    if (lb.classList.contains('open')){
      if (e.key === 'Escape'){ lbClose(); e.stopImmediatePropagation(); }
      else if (e.key === 'ArrowRight') lbShow(lbIdx + 1);
      else if (e.key === 'ArrowLeft') lbShow(lbIdx - 1);
    } else if (tgModal.classList.contains('open') && e.key === 'Escape'){
      closeTgModal(); e.stopImmediatePropagation();
    } else if (reader.classList.contains('open') && e.key === 'Escape'){
      closeReader(); e.stopImmediatePropagation();
    }
  }, true);
})();
