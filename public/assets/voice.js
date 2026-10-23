// القراءة الصوتية: أفضل صوت عربي متاح في الجهاز + تهيئة النص لينطق بوضوح (التواريخ، الأوقات، الرموز)
(() => {
  "use strict";
  const ok = "speechSynthesis" in window;
  const S = ok ? window.speechSynthesis : null;

  // ===== اختيار الصوت =====
  // ترتيب الأفضلية: الأصوات العصبية الطبيعية (Edge/Windows) ثم أصوات آبل وجوجل المحسّنة
  const RANK = [
    [/natural|neural|online/i, 60], [/hamed|zariyah|shakir|salma|fatima|hoda|naayf/i, 25],
    [/maged|majed|tarik|laila|mariam|muna|amira/i, 22], [/premium|enhanced|siri/i, 18], [/google/i, 14]];
  let voice = null;
  function pick() {
    if (!ok) return null;
    const list = S.getVoices().filter((v) => /^ar(-|_|$)/i.test(v.lang));
    if (!list.length) return null;
    const score = (v) => {
      let s = 0;
      for (const [re, w] of RANK) if (re.test(v.name)) s += w;
      if (/^ar[-_]SA/i.test(v.lang)) s += 10; else if (/^ar[-_](AE|KW|QA|BH|OM|JO|EG)/i.test(v.lang)) s += 5;
      if (v.localService === false) s += 4; // أصوات السحابة أوضح عادةً
      if (/compact|eloquence/i.test(v.name)) s -= 15;
      return s;
    };
    return list.sort((a, b) => score(b) - score(a))[0];
  }
  if (ok) { voice = pick(); S.addEventListener?.("voiceschanged", () => { voice = pick(); }); }

  // ===== تهيئة النص =====
  const AR_D = (s) => String(s).replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0);
  const HOURS = ["الثانية عشرة", "الواحدة", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة", "السابعة", "الثامنة", "التاسعة", "العاشرة", "الحادية عشرة", "الثانية عشرة"];
  const GM = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  function sayTime(h, m, suf) {
    h = +h; m = +m;
    let part = "";
    if (/^(م|مساء|pm)/i.test(suf || "")) part = h >= 4 && h < 12 ? " مساءً" : h < 4 ? " ظهرًا" : "";
    else if (/^(ص|صباح|am)/i.test(suf || "")) part = " صباحًا";
    else if (h >= 13) { part = h < 16 ? " ظهرًا" : " مساءً"; } else if (h === 12) part = " ظهرًا"; else if (h >= 5) part = " صباحًا";
    const hh = HOURS[h % 12];
    const mm = m === 0 ? "" : m === 15 ? " والربع" : m === 30 ? " والنصف" : m === 45 ? " إلا ربعًا" : m === 20 ? " والثلث" : m === 40 ? " إلا ثلثًا" : " و" + m + " دقيقة";
    const hour = m === 45 || m === 40 ? HOURS[(h + 1) % 12] : hh;
    return "الساعة " + hour + mm + part;
  }
  function prepare(text) {
    let s = AR_D(String(text || ""));
    s = s.replace(/https?:\/\/\S+/g, " رابط ").replace(/\S+@\S+\.\S+/g, " بريد إلكتروني ");
    // إيموجي ورموز زخرفية
    s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, " ");
    s = s.replace(/[•·▪●◆★☆✓✔✗×→←↗↖⟵⟶»«"“”"'`|_~^#*<>\[\]{}]/g, " ");
    // تواريخ ISO: 2026-10-20
    s = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y, mo, d) => (+mo >= 1 && +mo <= 12 ? +d + " " + GM[+mo - 1] + " " + y : m));
    // 1448/1/6 أو 6/1/1448 (هجري) و 2026/10/20 أو 20/10/2026 (ميلادي)
    const dmy = (d, mo, y) => { const H = +y < 1600; return +mo >= 1 && +mo <= 12 ? +d + " " + (H ? HM : GM)[+mo - 1] + " " + y + (H ? " هجري" : "") : null; };
    s = s.replace(/\b(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*(هـ|ه)?(?![\d/])/g, (m, y, mo, d) => dmy(d, mo, y) || m);
    s = s.replace(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*(هـ|ه|م)?(?![\d/])/g, (m, d, mo, y) => dmy(d, mo, y) || m);
    s = s.replace(/(\d{4})\s*(هـ|ه)(?=[\s.,،)]|$)/g, "$1 هجري").replace(/(\d{4})\s*م(?=[\s.,،)]|$)/g, "$1 ميلادي");
    // أوقات: 7:30 ص، 13:00، 9:30 مساءً
    s = s.replace(/(?<![\d.])(\d{1,2})\s*[:٫.]\s*(\d{2})(?:\s*(صباحًا|صباحا|مساءً|مساء|ص|م|am|pm)(?![ء-ي]))?(?![\d])/gi, (m, h, mi, suf) => (+h <= 24 && +mi < 60 ? sayTime(h, mi, suf) : m));
    s = s.replace(/الساعة[\s،,(]*(?=الساعة)/g, "").replace(/(الرابط|رابط)\s+رابط/g, "$1");
    // نطاق أوقات/أرقام «7 – 9» ← «من 7 إلى 9»
    s = s.replace(/(الساعة [^–\-—]+?)\s*[–—-]\s*(الساعة)/g, "من $1 إلى $2");
    // اختصارات شائعة في الموقع
    s = s.replace(/(\d+)\s*د(?![ء-ي.])/g, "$1 دقيقة").replace(/(\d+)\s*س(?![ء-ي])/g, "$1 ساعة").replace(/(?<![ء-ي])ش\s*(\d+)/g, "الشعبة $1").replace(/(?<![ء-ي])أ\.\s*/g, "الأستاذ ").replace(/(?<![ء-ي])د\.\s*/g, "الدكتور ");
    s = s.replace(/\s*[—–]\s*(?!الساعة)/g, "، ").replace(/(للشعبة|الشعبة)\s+الشعبة/g, "$1");
    s = s.replace(/\bPDF\b/gi, "بي دي إف").replace(/\bQR\b/gi, "كيو آر").replace(/\bTeams\b/gi, "تيمز").replace(/\bOTP\b/gi, "رمز التحقق");
    // رموز الطلبات مثل BSH-7K2Q تُنطق حرفًا حرفًا
    s = s.replace(/\b([A-Z]{2,5})-([A-Z0-9]{3,8})\b/g, (m, a, b) => "الرمز " + (a + " " + b).split("").join(" "));
    s = s.replace(/%/g, " بالمئة").replace(/\+/g, " زائد ").replace(/&/g, " و ");
    s = s.replace(/[(){}]/g, "، ").replace(/\s*[:：]\s*/g, ": ").replace(/\s*\/\s*/g, " أو ");
    return s.replace(/\s+/g, " ").replace(/(\s*[،,]\s*)+/g, "، ").trim();
  }
  // تقسيم إلى جمل قصيرة (المتصفحات تقطع النص الطويل، والجمل القصيرة أوضح نطقًا)
  function chunks(s) {
    const parts = s.split(/(?<=[.!؟?؛\n])\s+|(?<=،)\s+(?=\S{2,}.{60,})/);
    const out = [];
    for (let p of parts) {
      p = p.trim(); if (!p) continue;
      while (p.length > 200) { const cut = p.lastIndexOf(" ", 180); out.push(p.slice(0, cut > 60 ? cut : 180)); p = p.slice(cut > 60 ? cut + 1 : 180); }
      out.push(p);
    }
    return out;
  }

  let current = null;
  function stop() { if (!ok) return; try { S.cancel(); } catch {} if (current) { const c = current; current = null; c.onend && c.onend(); } }
  /** ينطق النص. يعيد false إذا لم تكن القراءة مدعومة */
  function speak(text, opt = {}) {
    if (!ok) return false;
    stop();
    const list = chunks(prepare(text));
    if (!list.length) return true;
    const job = { onend: opt.onend }; current = job;
    let i = 0;
    const next = () => {
      if (current !== job) return;
      if (i >= list.length) { current = null; job.onend && job.onend(); return; }
      const u = new SpeechSynthesisUtterance(list[i++]);
      u.lang = voice ? voice.lang : "ar-SA"; if (voice) u.voice = voice;
      u.rate = opt.rate || (voice && /natural|online|neural/i.test(voice.name) ? 1 : 0.92); u.pitch = 1;
      u.onend = () => setTimeout(next, 120); u.onerror = () => { current = null; job.onend && job.onend(); };
      S.speak(u);
    };
    // كروم يحتاج دفعة صغيرة بعد cancel
    setTimeout(next, 60);
    // حماية من توقف كروم بعد ~15 ثانية
    const keep = voice && /google/i.test(voice.name) ? setInterval(() => { if (current !== job) return clearInterval(keep); if (S.speaking && !S.paused) { S.pause(); S.resume(); } }, 10000) : 0;
    return true;
  }
  window.BSHVoice = { speak, stop, prepare, get voice() { return voice; }, get speaking() { return !!current; }, supported: ok };
})();
