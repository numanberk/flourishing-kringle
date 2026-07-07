// netlify/functions/send-to-kindle.js
// PDF'i iki Kindle adresine, senin Gmail hesabın ÜZERİNDEN mail olarak gönderir.
// Site PDF'i önce Firebase Storage'a yükler, buraya sadece indirme LİNKİ gelir;
// dosyayı bu fonksiyon indirir ve maile ekler (~25 MB'a kadar).
//
// Kurulum (bir kere):
//  1) Gmail hesabında (numanberk2005@gmail.com) 2 Adımlı Doğrulama açık olmalı:
//       myaccount.google.com/security → "2 Adımlı Doğrulama" → aç.
//  2) Uygulama Şifresi oluştur:
//       myaccount.google.com/apppasswords → isim ver (ör. "kindle") → Oluştur →
//       çıkan 16 haneli şifreyi (boşluklu görünür, boşluklar önemsiz) KOPYALA.
//  3) Netlify → Site settings → Environment variables:
//        GMAIL_USER     = numanberk2005@gmail.com
//        GMAIL_APP_PASS = (16 haneli uygulama şifresi, boşluklu ya da boşluksuz)
//  4) Amazon → İçerik ve Cihazlar → Tercihler → Kişisel Belge Ayarları →
//     Onaylı e-posta listesine numanberk2005@gmail.com adresini İKİNİZ de ekleyin.
//     (Yoksa Kindle maili sessizce çöpe atar.)
//
// Not: Gmail bu yolla günde ~500 mail sınırına sahiptir — ikiniz için fazlasıyla yeterli.

const nodemailer = require("nodemailer");

const KINDLE_TO = [
  "ervamervekalayci2_tUJaUy@kindle.com",
  "NUMANBERK2005_WLVXEC@kindle.com"
];

// Sadece kendi Firebase projemizin Storage linklerini indiririz.
const ALLOWED_URL_PREFIX = "https://firebasestorage.googleapis.com/v0/b/studywithme-6e234";

// Gmail eki tavanı 25MB; base64 payı düşülünce güvenli PDF sınırı ~25MB.
const MAX_PDF_BYTES = 25 * 1024 * 1024;

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Sadece POST" }) };

  const USER = process.env.GMAIL_USER;
  const PASS = (process.env.GMAIL_APP_PASS || "").replace(/\s+/g, ""); // boşlukları temizle
  if (!USER || !PASS)
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Mail servisi ayarlanmamış (GMAIL_USER / GMAIL_APP_PASS env değişkenleri eksik)" }) };

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Geçersiz istek gövdesi" }) }; }

  const { filename, url, data } = payload;
  if (!filename || (!url && !data))
    return { statusCode: 400, headers, body: JSON.stringify({ error: "filename ve url (veya data) gerekli" }) };
  if (!/\.pdf$/i.test(filename))
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Sadece PDF gönderilebilir" }) };

  // PDF içeriğini hazırla (Buffer)
  let buf;
  try {
    if (url) {
      if (!url.startsWith(ALLOWED_URL_PREFIX))
        return { statusCode: 400, headers, body: JSON.stringify({ error: "İzin verilmeyen dosya adresi" }) };
      const fileRes = await fetch(url);
      if (!fileRes.ok)
        return { statusCode: 502, headers, body: JSON.stringify({ error: "Dosya indirilemedi (HTTP " + fileRes.status + ")" }) };
      buf = Buffer.from(await fileRes.arrayBuffer());
    } else {
      buf = Buffer.from(data, "base64"); // küçük dosyalar için doğrudan gönderim
    }
    if (buf.length > MAX_PDF_BYTES)
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Dosya e-posta için çok büyük (sınır ~25 MB)" }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Dosya alınamadı: " + e.message }) };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: USER, pass: PASS }
  });

  // İki Kindle'a ayrı ayrı gönder ki biri başarısız olsa diğeri gitsin.
  const failed = [];
  for (const to of KINDLE_TO) {
    try {
      await transporter.sendMail({
        from: USER,
        to,
        subject: filename,
        text: filename,
        attachments: [{ filename, content: buf, contentType: "application/pdf" }]
      });
    } catch (e) {
      failed.push(to + ": " + (e.message || "bilinmeyen hata"));
    }
  }

  if (failed.length === 0)
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  if (failed.length < KINDLE_TO.length)
    return { statusCode: 207, headers, body: JSON.stringify({ ok: false, partial: true, error: "Bazı adreslere gidemedi → " + failed.join(" | ") }) };
  return { statusCode: 502, headers, body: JSON.stringify({ error: "Gönderilemedi → " + failed.join(" | ") }) };
};
