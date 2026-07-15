// functions/api/send-push.js  → served at  /api/send-push
// Cloudflare Pages Function. Web Push (VAPID) bildirimlerini gönderir.
// web-push kütüphanesi Node crypto istediğinden burada Web Crypto ile
// imzalama elle yapılır (Cloudflare Workers uyumlu).
//
// Kurulum (Cloudflare Pages → Settings → Environment variables):
//   VAPID_PUBLIC_KEY  = (mevcut public key)
//   VAPID_PRIVATE_KEY = (mevcut private key)
//   VAPID_SUBJECT     = mailto:numanberk2005@gmail.com

const DB_URL = "https://studywithme-6e234-default-rtdb.europe-west1.firebasedatabase.app";
const MSGS = {
  study: f => ({ title: f + " çalışmaya başladı 📚", body: "Sen de katıl!" }),
  nudge: f => ({ title: f + " seni dürttü 👉", body: "Hadi çalışmaya!" }),
  watch: f => ({ title: "🎬 Bişeyler izleyelim!", body: f + " film gecesi istiyor 🍿" }),
  meet:  f => ({ title: "🎥 Meet hazır!", body: f + " seni bekliyor — 🎬 sekmesinden katıl" }),
  goal:  f => ({ title: f + " hedefini tamamladı 🎉", body: "Tebrik etmeyi unutma!" })
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/* ---------- base64url helpers ---------- */
const b64urlToBytes = s => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - s.length % 4) % 4);
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
const bytesToB64url = buf => {
  const u = new Uint8Array(buf); let bin = "";
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const strToB64url = str => {
  const u = new TextEncoder().encode(str); let bin = "";
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const concat = (...arrs) => {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};

/* ---------- import the VAPID private key for ES256 signing ---------- */
async function importVapidKey(pub, priv) {
  const pubBytes = b64urlToBytes(pub);     // 65 bytes: 0x04 + X(32) + Y(32)
  const d = b64urlToBytes(priv);           // 32 bytes
  const jwk = {
    kty: "EC", crv: "P-256",
    x: bytesToB64url(pubBytes.slice(1, 33)),
    y: bytesToB64url(pubBytes.slice(33, 65)),
    d: bytesToB64url(d),
    ext: true, key_ops: ["sign"]
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/* ---------- build a signed VAPID JWT for one push endpoint ---------- */
async function vapidHeaders(endpoint, pub, priv, subject) {
  const aud = new URL(endpoint).origin;
  const header = strToB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = strToB64url(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject
  }));
  const signingInput = new TextEncoder().encode(header + "." + body);
  const key = await importVapidKey(pub, priv);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signingInput);
  const jwt = header + "." + body + "." + bytesToB64url(sig);
  return { Authorization: "vapid t=" + jwt + ", k=" + pub };
}

/* ---------- encrypt the payload (aes128gcm, RFC 8291) ---------- */
async function encryptPayload(subscription, plaintext) {
  const uaPub = b64urlToBytes(subscription.keys.p256dh);   // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16 bytes

  // ephemeral server key pair
  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKeys.publicKey)); // 65 bytes

  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, localKeys.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const hkdf = async (ikm, info, salt2, len) => {
    const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt2, info }, base, len * 8));
  };

  const encoder = new TextEncoder();
  // PRK combining step (RFC 8291)
  const authInfo = concat(encoder.encode("WebPush: info\0"), uaPub, localPubRaw);
  const ikm = await hkdf(shared, authInfo, authSecret, 32);

  const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
  const cek = await hkdf(ikm, cekInfo, salt, 16);
  const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
  const nonce = await hkdf(ikm, nonceInfo, salt, 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const record = concat(new Uint8Array(plaintext), new Uint8Array([0x02])); // delimiter, no padding
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // header: salt(16) | rs(4 = 4096) | idlen(1) | localPub(65)
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  const header = concat(salt, rs, new Uint8Array([localPubRaw.length]), localPubRaw);
  return concat(header, ct);
}

async function sendOne(sub, payloadStr, pub, priv, subject) {
  const body = await encryptPayload(sub, new TextEncoder().encode(payloadStr));
  const headers = await vapidHeaders(sub.endpoint, pub, priv, subject);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "2419200"
    },
    body
  });
  return res.ok || res.status === 201;
}

export async function onRequestOptions() { return new Response(null, { status: 204, headers: cors }); }

export async function onRequestGet({ env }) {
  if (!env.VAPID_PUBLIC_KEY) return json({ error: "VAPID ayarlı değil" }, 500);
  return json({ publicKey: env.VAPID_PUBLIC_KEY });
}

export async function onRequestPost({ request, env }) {
  const PUB = env.VAPID_PUBLIC_KEY, PRIV = env.VAPID_PRIVATE_KEY;
  const SUBJECT = env.VAPID_SUBJECT || "mailto:numanberk2005@gmail.com";
  if (!PUB || !PRIV) return json({ error: "VAPID anahtarları ayarlanmamış" }, 500);

  let payload;
  try { payload = await request.json(); } catch { return json({ error: "Geçersiz istek" }, 400); }
  const { type, from, fromUid, toUid } = payload;
  const gen = MSGS[type];
  if (!gen) return json({ error: "Bilinmeyen tip" }, 400);

  const msg = JSON.stringify({ ...gen(from || "Arkadaşın"), url: "/", tag: type });

  let all = {};
  try { all = (await (await fetch(DB_URL + "/pushSubs.json")).json()) || {}; }
  catch (e) { return json({ error: "Abonelikler okunamadı: " + e.message }, 502); }

  const targets = [];
  for (const [uid, subs] of Object.entries(all)) {
    if (uid === fromUid) continue;
    if (toUid && uid !== toUid) continue;
    for (const s of Object.values(subs || {})) if (s && s.sub && s.sub.endpoint) targets.push(s.sub);
  }

  let sent = 0, failed = 0;
  await Promise.all(targets.map(async s => {
    try { (await sendOne(s, msg, PUB, PRIV, SUBJECT)) ? sent++ : failed++; }
    catch { failed++; }
  }));

  return json({ ok: true, sent, failed });
}
