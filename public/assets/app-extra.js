// دليل الطالب: الإشعارات على الجوال، حالة المنصات الآن، «اسأل الدليل»
(() => {
  "use strict";
  const BSH = window.BSH;
  if (!BSH) return;
  const $ = (s) => document.querySelector(s);
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c));
    return e;
  }
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  // =====================================================================
  // 1) الإشعارات على الجوال
  // =====================================================================
  let lookupId = null;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && location.protocol === "https:";
  const b64ToU8 = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  async function currentSub() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; } }
  async function sendSub(sub) {
    const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON(), studentId: lookupId }) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "تعذر تفعيل الإشعارات.");
  }
  function pushUI(state) {
    const row = $("#pushRow"), btn = $("#pushBtn"), t = $("#pushTitle"), s = $("#pushSub");
    row.hidden = false; row.classList.toggle("on", state === "on"); btn.hidden = false; btn.className = "btn sm";
    if (state === "on") { t.textContent = "الإشعارات مفعّلة على هذا الجهاز ✓"; s.textContent = "تصلك الردود والاستدعاءات وإعلانات شعبتك وتذكير الاختبارات"; btn.textContent = "إيقاف"; btn.className = "btn light sm"; }
    else if (state === "ios") { t.textContent = "ثبّت الموقع أولًا لتصلك الإشعارات"; s.textContent = "على الآيفون تعمل الإشعارات بعد إضافة الموقع إلى الشاشة الرئيسية"; btn.textContent = "كيف؟"; }
    else if (state === "denied") { t.textContent = "الإشعارات محظورة في المتصفح"; s.textContent = "اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح ثم أعد المحاولة"; btn.hidden = true; }
    else if (state === "nosupport") { row.hidden = true; }
    else if (state === "preview") { t.textContent = "فعّل الإشعارات على جوالك"; s.textContent = "في المعاينة لا تعمل الإشعارات؛ تعمل في الموقع الحقيقي بعد النشر"; btn.hidden = true; }
    else { t.textContent = "فعّل الإشعارات على جوالك"; s.textContent = "تصلك الردود والاستدعاءات وإعلانات شعبتك وتذكير الاختبارات"; btn.textContent = "تفعيل"; }
    row.dataset.state = state;
  }
  async function refreshPush() {
    if (window.__PV_PREVIEW) return pushUI("preview");
    if (isIOS && !standalone) return pushUI("ios");
    if (!supported) return pushUI("nosupport");
    if (Notification.permission === "denied") return pushUI("denied");
    const sub = Notification.permission === "granted" ? await currentSub() : null;
    if (sub) { try { await sendSub(sub); } catch {} return pushUI("on"); } // تحديث الصف والشعبة بصمت
    pushUI("off");
  }
  $("#pushBtn").addEventListener("click", async () => {
    const btn = $("#pushBtn"), st = $("#pushRow").dataset.state;
    if (st === "ios") { const d = $("#iosDlg"); if (typeof d.showModal === "function") d.showModal(); return; }
    BSH.busy(btn, true, "…");
    try {
      if (st === "on") { const sub = await currentSub(); if (sub) { await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", subscription: sub.toJSON() }) }).catch(() => {}); await sub.unsubscribe(); } pushUI("off"); BSH.toast("أوقفت الإشعارات على هذا الجهاز."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { pushUI(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }));
      await sendSub(sub); pushUI("on");
      BSH.toast("تم! ستصلك إشعارات الدليل على هذا الجهاز.");
    } catch (e) { BSH.toast(e.message || "تعذر تفعيل الإشعارات."); } finally { BSH.busy(btn, false); }
  });
  BSH.on("lookup", (d) => { lookupId = d.id; refreshPush(); });
  $("#hideData").addEventListener("click", () => { lookupId = null; $("#pushRow").hidden = true; });

  // =====================================================================
  // 2) حالة المنصات الآن
  // =====================================================================
  const ST = { up: ["تعمل", "up"], slow: ["بطيئة", "slow"], down: ["متوقفة", "down"], unknown: ["تعذّر الفحص", "unk"] };
  let platformStatus = [];
  const ago = (iso) => { if (!iso) return ""; const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 6e4)); return m < 60 ? "قبل " + m + " دقيقة" : "قبل " + Math.round(m / 60) + " ساعة"; };
  async function loadStatus() {
    try {
      const d = await (await fetch("/api/status")).json();
      platformStatus = d.items || [];
      const box = $("#pstat"); box.textContent = "";
      const known = platformStatus.filter((x) => x.state !== "unknown");
      box.hidden = !known.length;
      if (known.length) {
        box.append(el("span", { class: "ps-l", text: "حالة المنصات الآن:" }));
        platformStatus.forEach((x) => { const [tx, cls] = ST[x.state] || ST.unknown; box.append(el("span", { class: "ps " + cls, title: x.note || "" }, el("i", { "aria-hidden": "true" }), x.name + " " + tx)); });
        if (d.checkedAt) box.append(el("small", { text: "آخر فحص " + ago(d.checkedAt) }));
      }
      const down = platformStatus.filter((x) => x.state === "down");
      const ban = $("#pdown"); ban.textContent = ""; ban.hidden = !down.length;
      if (down.length) ban.append(el("i", { "aria-hidden": "true" }), el("div", {}, el("b", { text: down.map((x) => x.name).join(" و") + (down.length > 1 ? " متوقفتان" : " متوقفة") + " حاليًا" }),
        el("p", { text: down.map((x) => x.note).filter(Boolean).join(" · ") || "العطل من المنصة نفسها وليس من جهازك. لا داعي لإرسال استفسار، وجرّب بعد قليل." })));
    } catch {}
  }
  loadStatus(); setInterval(() => { if (!document.hidden) loadStatus(); }, 5 * 60000);

  // =====================================================================
  // 3) «اسأل الدليل»: يجيب من الأسئلة الشائعة والملفات وأقسام الموقع
  // =====================================================================
  const norm = (s) => String(s || "").toLowerCase()
    .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const STOP = new Set(("من في على الى إلى عن ما ماذا كيف هل لا لم لن انا انه اني ابي ابغى ابغا ودي عندي لي لك او و يا هذا هذه ذلك تلك كم متى وين اين وش ايش لماذا ليش مع ان قد كان كانت هو هي هم انت انتم شي شيء اذا لو ثم بعد قبل كل بس طيب ممكن يمكن اريد احتاج اعرف ما اقدر قادر عشان علشان لان لأن حق حقي الي اللي الذي التي فيه فيها عليه عليها منه منها").split(" ").map(norm));
  const SYN = [
    ["مرور", "باسورد باسوورد باس سر سري سريه password مرور الرقم_السري"],
    ["دخول", "دخول ادخل يدخل تسجيل_الدخول لوجن login افتح يفتح يفتحلي ينفتح اقدر_ادخل"],
    ["تسجيل", "تسجيل اسجل سجل يسجل التسجيل تقديم اقدم يقدم التقديم اشترك اشتراك"],
    ["حصه", "حصه حصص درس دروس محاضره كلاس الحصه افتراضي"],
    ["تيمز", "تيمز تمز teams تيم"],
    ["مدرستي", "مدرستي منصه المنصه madrasati"],
    ["بريد", "بريد ايميل ايميلي email ميل حساب حسابي"],
    ["قدرات", "قدرات قياس"],
    ["تحصيلي", "تحصيلي"],
    ["قبول", "قبول جامعه جامعات تخصص تخصصات رغبات رغبه موزون موزونه"],
    ["جدول", "جدول جدولي حصصي"],
    ["اختبار", "اختبار اختبارات امتحان امتحانات"],
    ["تطوع", "تطوع تطوعي تطوعيه ساعات"],
    ["موهبه", "موهبه موهوب موهوبين مقياس"],
    ["اولمبياد", "اولمبياد اولمبيادات مسابقه مسابقات ابداع نسمو"],
    ["نسيت", "نسيت نسيان ضايع ضاع نسيته"],
    ["رسوم", "رسوم سعر فلوس مبلغ تكلفه مجاني"],
    ["شهاده", "شهاده شهادات"],
    ["استفسار", "استفسار طلب شكوى ملاحظه تذكره متابعه"],
  ];
  const synMap = new Map();
  SYN.forEach(([c, list]) => list.split(" ").forEach((w) => synMap.set(norm(w.replace(/_/g, " ")).replace(/\s+/g, ""), c)));
  function stem(w) {
    for (const p of ["وال", "بال", "كال", "فال", "لل", "ال"]) if (w.startsWith(p) && w.length - p.length >= 3) { w = w.slice(p.length); break; }
    if (w.length > 4 && w.startsWith("و")) w = w.slice(1);
    if (/ت(ه|ها|هم)$/.test(w) && w.length >= 4) return w.replace(/ت(ه|ها|هم)$/, "ه");
    for (const sfx of ["ات", "ون", "ين", "ها", "هم", "كم", "ني", "ه", "ي"]) if (w.endsWith(sfx) && w.length - sfx.length >= 3) { w = w.slice(0, -sfx.length); break; }
    return w;
  }
  // كل كلمة تعطي جذرها، ومعه المرادف الموحّد بوزن أقل (حتى لا تضيع الكلمة الأصلية)
  function wtokens(s) {
    const out = [];
    norm(s).split(/\s+/).filter(Boolean).forEach((w) => {
      if (STOP.has(w) || w.length < 2) return;
      const st = stem(w), c = synMap.get(w) || synMap.get(st);
      if (c && c !== st) { out.push({ t: c, w: 1 }); out.push({ t: st, w: 0.4 }); }
      else out.push({ t: st, w: 1 });
    });
    return out;
  }
  const tokens = (s) => wtokens(s).map((x) => x.t);
  let docs = [], df = new Map();
  function buildDocs() {
    const C = BSH.content || {};
    docs = [];
    (C.faq || []).forEach((f) => docs.push({ kind: "faq", title: f.q, text: f.a, cat: f.cat, link: f.link, id: f.id }));
    (C.files || []).forEach((f) => docs.push({ kind: "file", title: f.title, text: f.cat || "", cat: f.cat, url: f.url }));
    [["جدولي واختباراتي", "جدول حصص اختبارات مواعيد شعبه", "myschedule"], ["بياناتي وبريد المنصة", "بريد ايميل بيانات هويه", "mydata"], ["المنصات التعليمية", "منصات روابط مدرستي تيمز قياس قبول", "platforms"],
     ["الفعاليات والمواعيد", "فعاليات مسابقات تسجيل", "events"], ["متابعة الاستفسار", "متابعه رد طلب استفسار", "ticket"]]
      .forEach(([t, k, id]) => docs.push({ kind: "sec", title: t, text: k, jump: id }));
    docs.forEach((d) => { d.tt = tokens(d.title); d.xt = tokens(d.text + " " + (d.cat || "")); });
    df = new Map();
    docs.forEach((d) => new Set([...d.tt, ...d.xt]).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  }
  function search(q) {
    if (!docs.length) buildDocs();
    const seen = new Map(); wtokens(q).forEach((x) => seen.set(x.t, Math.max(seen.get(x.t) || 0, x.w)));
    const qt = [...seen.entries()];
    if (!qt.length) return { qt, hits: [] };
    const N = docs.length;
    const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
    const max = qt.reduce((a, [t, w]) => a + w * idf(t) * 2, 0);
    const hits = docs.map((d) => {
      let s = 0, matched = 0;
      qt.forEach(([t, w]) => { const inT = d.tt.includes(t), inX = d.xt.includes(t); if (inT || inX) matched++; s += w * idf(t) * (inT ? 2 : inX ? 1 : 0); });
      const extra = Math.max(0, new Set(d.tt).size - matched);
      return { d, score: (s / max) * (1 - 0.15 * Math.min(1, extra / 10)), matched };
    }).filter((h) => h.matched > 0).sort((a, b) => b.score - a.score || (a.d.kind === "faq" ? -1 : 1));
    return { qt, hits };
  }
  const log = $("#askLog");
  function say(who, ...kids) { const m = el("div", { class: "msg " + who }, ...kids); log.append(m); log.scrollTop = log.scrollHeight; return m; }
  function chips(list) { const w = el("div", { class: "ask-chips" }); list.forEach((t) => { const b = el("button", { type: "button", text: t }); b.onclick = () => ask(t); w.append(b); }); return w; }
  function goTicket() { close(); BSH.openTab("new"); BSH.jump("ticket"); }
  function answer(q) {
    const { hits } = search(q);
    const nq = norm(q);
    const warn = platformStatus.filter((x) => x.state === "down" && (/مدرستي|منص/.test(nq) && x.id === "madrasati" || /تيمز|حص|teams/.test(nq) && x.id === "teams"));
    if (warn.length) say("bot warn", el("b", { text: "تنبيه: " + warn.map((x) => x.name).join(" و") + " متوقفة الآن" }), el("p", { text: "قد تكون المشكلة من المنصة نفسها وليست من جهازك. جرّب بعد قليل." }));
    const best = hits[0];
    if (!best || best.score < 0.4) {
      say("bot", el("p", { text: "لم أجد إجابة دقيقة لسؤالك في دليل المدرسة." }), el("div", { class: "ask-acts" }, (() => { const b = el("button", { class: "btn sm", type: "button", text: "أرسل استفسارًا للمسؤول" }); b.onclick = goTicket; return b; })()),
        hits.length ? el("p", { class: "ask-near", text: "ربما تقصد:" }) : null, hits.length ? chips(hits.slice(0, 3).map((h) => h.d.title)) : null);
      return;
    }
    const d = best.d;
    const acts = el("div", { class: "ask-acts" });
    if (d.kind === "faq") {
      if (d.link) acts.append(el("a", { class: "btn sm", href: d.link, target: "_blank", rel: "noopener", text: "فتح الرابط ↗" }));
      const fl = (BSH.content?.files || []).find((f) => f.section === "faq" && f.cat === d.cat);
      if (fl) acts.append(el("a", { class: "btn light sm", href: fl.url, target: "_blank", rel: "noopener", text: "الدليل الكامل PDF" }));
    } else if (d.kind === "file") acts.append(el("a", { class: "btn sm", href: d.url, target: "_blank", rel: "noopener", text: "فتح الملف ↗" }));
    else if (d.kind === "sec") { const b = el("button", { class: "btn sm", type: "button", text: "انتقل إلى " + d.title }); b.onclick = () => { close(); BSH.jump(d.jump); }; acts.append(b); }
    const fb = el("div", { class: "ask-fb" }, el("span", { text: "هل أفادتك الإجابة؟" }));
    const yes = el("button", { type: "button", "aria-label": "نعم", text: "👍" }), no = el("button", { type: "button", "aria-label": "لا", text: "👎" });
    yes.onclick = () => { fb.textContent = "سعدت بمساعدتك 🌱"; };
    no.onclick = () => { fb.textContent = ""; const b = el("button", { class: "btn outline sm", type: "button", text: "أرسل استفسارًا للمسؤول" }); b.onclick = goTicket; fb.append(el("span", { text: "آسف لذلك. " }), b); };
    fb.append(yes, no);
    say("bot", d.cat ? el("small", { class: "ask-cat", text: d.cat }) : null, el("b", { text: d.title }), d.kind === "faq" ? el("p", { text: d.text }) : null, acts.childNodes.length ? acts : null,
      hits.length > 1 ? el("p", { class: "ask-near", text: "أسئلة قريبة:" }) : null, hits.length > 1 ? chips(hits.slice(1, 3).map((h) => h.d.title)) : null, fb);
  }
  function ask(q) { q = String(q || "").trim(); if (!q) return; say("me", el("p", { text: q })); setTimeout(() => answer(q), 250); }
  const panel = $("#askPanel"), fab = $("#askFab");
  function open() {
    panel.hidden = false; fab.setAttribute("aria-expanded", "true"); fab.hidden = true;
    if (!log.childNodes.length) { say("bot", el("p", { text: "أهلًا بك! اكتب سؤالك بكلماتك، وأجيبك من دليل المدرسة." }), chips(["نسيت كلمة المرور", "ما أعرف أدخل الحصة", "كم ساعات التطوع المطلوبة؟", "ما هي الدرجة الموزونة؟"])); }
    setTimeout(() => $("#askQ").focus(), 50);
  }
  function close() { panel.hidden = true; fab.hidden = false; fab.setAttribute("aria-expanded", "false"); }
  fab.addEventListener("click", open);
  $("#askClose").addEventListener("click", () => { close(); fab.focus(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) close(); });
  $("#askForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#askQ").value; $("#askQ").value = ""; ask(q); });
  BSH.on("content", () => { docs = []; });
  // يظهر في البحث أعلى الصفحة أيضًا
  const askItem = { k: "sec", kl: "مساعد", t: "اسأل الدليل", s: norm("اسال الدليل سؤال مساعد محادثه"), go: open, quick: true };
  (BSH.searchStatic = BSH.searchStatic || []).push(askItem);
  BSH.searchExtra = (BSH.searchExtra || []).concat(askItem);
  BSH.askGuide = (q) => { open(); if (q) ask(q); };
  BSH._askSearch = (q) => { const r = search(q); return { qt: r.qt, top: r.hits.slice(0, 4).map((h) => [h.d.title, +h.score.toFixed(3), h.d.tt]) }; };
})();
