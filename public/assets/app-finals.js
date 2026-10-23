// دليل الطالب: بطاقة «اختباراتي النهائية» داخل بياناتي (المادة والفترة والوقت، ومقر اللجنة ورقمها، ومقر الشعبة، ورقم الجلوس)
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
  const TZ = "Asia/Riyadh";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const dayName = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", timeZone: "UTC" });
  const hijri = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", timeZone: "UTC" });
  const greg = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "numeric", timeZone: "UTC" });
  const t12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const s = h < 12 ? "ص" : "م"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + s; };
  // لحظة بدء الاختبار بتوقيت مكة (UTC+3 دائمًا)
  const at = (x) => Date.parse(x.date + "T" + (x.start || "07:00") + ":00+03:00");
  const endAt = (x) => Date.parse(x.date + "T" + (x.end || x.start || "12:00") + ":00+03:00");
  const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = d; return s; };

  let F = null, timer = null;
  // «غدًا» و«بعد يومين» بحسب أيام التقويم، والساعات والدقائق في يوم الاختبار نفسه
  function left(x) {
    const ms = at(x) - Date.now();
    if (ms <= 0) return "الآن";
    const d = Math.round((Date.parse(x.date + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
    if (d >= 3) return "بعد " + d + (d <= 10 ? " أيام" : " يومًا");
    if (d === 2) return "بعد يومين";
    if (d === 1) return "غدًا";
    const m = Math.round(ms / 6e4), h = Math.floor(m / 60);
    if (h >= 1) return "بعد " + h + " س" + (m % 60 ? " " + (m % 60) + " د" : "");
    return "بعد " + m + " دقيقة";
  }
  // «7:00–9:30 ص» بدل تكرار اللاحقة
  const range = (x) => { if (!x.start) return ""; const a = t12(x.start), b = t12(x.end); if (!b) return a; const sa = a.slice(-1), sb = b.slice(-1); return sa === sb ? a.slice(0, -2) + "–" + b : a + " – " + b; };
  function render() {
    const box = $("#finBox"); box.textContent = ""; clearInterval(timer);
    if (!F || (!F.exams.length && !F.seat)) { box.hidden = true; return; }
    box.hidden = false;
    const now = Date.now();
    const upcoming = F.exams.filter((x) => endAt(x) > now);
    const next = upcoming[0];
    const done = !upcoming.length && F.exams.length;

    const head = el("div", { class: "fin-h" },
      el("span", { class: "fin-ic" }, svg('<path d="M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3z"/><path d="m9 13 2 2 4-4"/>')),
      el("div", {}, el("b", { text: "اختباراتي النهائية" }), F.title ? el("small", { text: F.title }) : null));
    box.append(head);

    // بطاقة الجلوس: أربع معلومات يحتاجها الطالب صباح الاختبار
    if (F.seat || F.committee) {
      const seat = el("button", { type: "button", class: "fin-seat", "aria-label": "رقم الجلوس " + F.seat + "، اضغط للنسخ" },
        el("small", { text: "رقم الجلوس" }), el("b", { dir: "ltr", text: F.seat || "—" }));
      seat.onclick = async () => { try { await navigator.clipboard.writeText(F.seat); BSH.toast("نُسخ رقم الجلوس."); } catch {} };
      const tile = (label, value, cls) => el("div", { class: "fin-t" + (cls ? " " + cls : "") }, el("small", { text: label }), el("b", { text: value || "—" }));
      box.append(el("div", { class: "fin-pass" }, seat,
        el("div", { class: "fin-tiles" }, tile("رقم اللجنة", F.committee), tile("مقر اللجنة", F.floor), tile("مقر الشعبة", F.room))));
    } else {
      box.append(el("p", { class: "fin-note", text: "لم يُسجَّل رقم جلوسك بعد. سيظهر هنا فور اعتماده من المدرسة." }));
    }

    if (next) {
      const isToday = next.date === today();
      const cd = el("b", { class: "fin-cd", text: left(next) });
      box.append(el("div", { class: "fin-next" + (isToday ? " today" : "") },
        el("small", { text: isToday ? "اختبار اليوم" : "الاختبار القادم" }),
        el("b", { class: "fin-subj", text: next.subject }),
        el("span", { text: dayName(next.date) + " " + hijri(next.date) + " · الفترة " + next.period + (next.start ? " · " + range(next) : "") }),
        cd));
      timer = setInterval(() => { if (endAt(next) <= Date.now()) render(); else cd.textContent = left(next); }, 30000);
    } else if (done) box.append(el("p", { class: "fin-note ok", text: "انتهت اختباراتك. بالتوفيق في النتائج!" }));

    if (F.exams.length) {
      const list = el("ol", { class: "fin-list" });
      F.exams.forEach((x) => {
        const past = endAt(x) <= now;
        list.append(el("li", { class: (past ? "past" : "") + (x === next ? " now" : "") },
          el("span", { class: "d" }, el("b", { text: dayName(x.date) }), el("small", { text: hijri(x.date) + " · " + greg(x.date) })),
          el("span", { class: "s" }, el("b", { text: x.subject }), el("small", { text: "الفترة " + x.period + (x.start ? " · " + range(x) : "") }))));
      });
      const det = el("details", { class: "fin-all" }, el("summary", { text: "جدول اختباراتي كاملًا (" + F.exams.length + ")" }), list);
      box.append(det);
    }
    const acts = el("div", { class: "fin-acts" });
    if (F.instructions) {
      const ins = el("details", { class: "fin-ins" }, el("summary", { text: "تعليمات مهمة" }), el("ul", {}, ...F.instructions.split(/\n+/).map((t) => t.replace(/^[\s•\-–·*]+/, "").trim()).filter(Boolean).map((t) => el("li", { text: t }))));
      box.append(ins);
    }
    if (F.fileUrl) acts.append(el("a", { class: "btn light sm", href: F.fileUrl, target: "_blank", rel: "noopener", text: "الجدول الرسمي" }));
    if (F.seat) { const sh = el("button", { class: "btn light sm", type: "button", text: "حفظ كصورة" }); sh.onclick = saveImage; acts.append(sh); }
    if (acts.childNodes.length) box.append(acts);
  }

  // صورة بطاقة الجلوس لحفظها في الجوال (تفيد صباح الاختبار دون إنترنت)
  async function saveImage() {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); await document.fonts.ready;
    const font = getComputedStyle(document.body).fontFamily;
    g.fillStyle = "#0B5A44"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect(60, 200, W - 120, H - 300, 48); g.fill();
    g.direction = "rtl"; g.textAlign = "center";
    g.fillStyle = "#fff"; g.font = "700 46px " + font; g.fillText("ثانوية بلاط الشهداء الثانوية", W / 2, 110);
    g.font = "500 32px " + font; g.fillStyle = "#BFE9D8"; g.fillText(F.title || "الاختبارات النهائية", W / 2, 160);
    const name = $("#whoName").textContent || "";
    g.fillStyle = "#0E1B2C"; g.font = "800 50px " + font; g.fillText(name, W / 2, 300);
    g.fillStyle = "#5B6B7F"; g.font = "500 34px " + font; g.fillText($("#whoMeta").textContent || "", W / 2, 350);
    g.fillStyle = "#E6F6EF"; g.beginPath(); g.roundRect(120, 400, W - 240, 220, 32); g.fill();
    g.fillStyle = "#0B7A5B"; g.font = "600 34px " + font; g.fillText("رقم الجلوس", W / 2, 460);
    g.fillStyle = "#0B5A44"; g.font = "800 92px " + font; g.direction = "ltr"; g.fillText(F.seat, W / 2, 575); g.direction = "rtl";
    const tiles = [["رقم اللجنة", F.committee], ["مقر اللجنة", F.floor], ["مقر الشعبة", F.room]];
    tiles.forEach(([l, v], i) => {
      const y = 660, w = 260, cx = W - 120 - w / 2 - i * (w + 30);
      g.fillStyle = "#F3F6FA"; g.beginPath(); g.roundRect(cx - w / 2, y, w, 170, 26); g.fill();
      g.fillStyle = "#5B6B7F"; g.font = "600 28px " + font; g.fillText(l, cx, y + 55);
      g.fillStyle = "#0E1B2C"; g.font = "800 " + (String(v || "").length > 10 ? 34 : 46) + "px " + font; g.fillText(v || "—", cx, y + 125);
    });
    let y = 900;
    g.textAlign = "right"; g.font = "700 30px " + font; g.fillStyle = "#0E1B2C";
    F.exams.slice(0, 8).forEach((x) => {
      g.fillStyle = "#0E1B2C"; g.font = "700 30px " + font; g.fillText(x.subject, W - 130, y);
      g.textAlign = "left"; g.fillStyle = "#5B6B7F"; g.font = "500 26px " + font; g.fillText(dayName(x.date) + " " + hijri(x.date) + " · " + t12(x.start), 130, y); g.textAlign = "right";
      y += 46;
    });
    const a = el("a", { href: c.toDataURL("image/png"), download: "بطاقة-الاختبارات.png" }); document.body.append(a); a.click(); a.remove();
    BSH.toast("حُفظت البطاقة في التنزيلات.");
  }

  BSH.on("lookup", (d) => { F = d.finals || null; render(); });
  $("#hideData") && $("#hideData").addEventListener("click", () => { F = null; render(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && F) render(); });
})();
