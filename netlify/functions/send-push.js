// netlify/functions/send-push.js
// Kilitli ekrana bildirim gönderir (Web Push). Site açık olmasa bile çalışır.
//
// Kurulum:
//  1) Netlify → Site settings → Environment variables:
//       VAPID_PUBLIC_KEY  = (verilen public key)
//       VAPID_PRIVATE_KEY = (verilen private key)
//       VAPID_SUBJECT     = mailto:numanberk2005@gmail.com
//  2) package.json'da "web-push" bağımlılığı olmalı (verildi).
//  3) Realtime Database kurallarına pushSubs bloğu eklenmeli (verildi).

const webpush = require("web-push");

const DB_URL = "https://studywithme-6e234-default-rtdb.europe-west1.firebasedatabase.app";

const MSGS = {
  study: f => ({ title: f + " çalışmaya başladı 📚", body: "Sen de katıl!" }),
  nudge: f => ({ title: f + " seni dürttü 👉", body: "Hadi çalışmaya!" }),
  watch: f => ({ title: "🎬 Bişeyler izleyelim!", body: f + " film gecesi istiyor 🍿" }),
  meet:  f => ({ title: "🎥 Meet hazır!", body: f + " seni bekliyor — 🎬 sekmesinden katıl" })
};

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };

  const PUB = process.env.VAPID_PUBLIC_KEY;
  const PRIV = process.env.VAPID_PRIVATE_KEY;
  const SUBJECT = process.env.VAPID_SUBJECT || "mailto:numanberk2005@gmail.com";
  if (!PUB || !PRIV)
    return { statusCode: 500, headers, body: JSON.stringify({ error: "VAPID anahtarları ayarlanmamış" }) };

  // GET → site abone olurken public key'i buradan alır
  if (event.httpMethod === "GET")
    return { statusCode: 200, headers, body: JSON.stringify({ publicKey: PUB }) };

  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Sadece GET/POST" }) };

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Geçersiz istek" }) }; }

  const { type, from, fromUid, toUid } = payload;
  const gen = MSGS[type];
  if (!gen) return { statusCode: 400, headers, body: JSON.stringify({ error: "Bilinmeyen tip" }) };

  const msg = JSON.stringify(Object.assign(gen(from || "Arkadaşın"), { url: "/", tag: type }));
  webpush.setVapidDetails(SUBJECT, PUB, PRIV);

  // abonelikleri oku (pushSubs kuralı: read true)
  let all = {};
  try {
    const r = await fetch(DB_URL + "/pushSubs.json");
    all = (await r.json()) || {};
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Abonelikler okunamadı: " + e.message }) };
  }

  const targets = [];
  Object.entries(all).forEach(([uid, subs]) => {
    if (uid === fromUid) return;              // gönderen kendine bildirim almasın
    if (toUid && uid !== toUid) return;       // hedef belliyse sadece ona
    Object.values(subs || {}).forEach(s => { if (s && s.sub && s.sub.endpoint) targets.push(s.sub); });
  });

  let sent = 0, failed = 0;
  await Promise.all(targets.map(async s => {
    try { await webpush.sendNotification(s, msg); sent++; }
    catch (e) { failed++; }                    // süresi dolmuş abonelikler sessizce atlanır
  }));

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, sent, failed }) };
};
