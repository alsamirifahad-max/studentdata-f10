// استيراد الجداول الدراسية والتقويم الدراسي من ملفات Excel و CSV و PDF
(() => {
  "use strict";
  const A = window.ADM;
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const XLSXJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const loaded = {};
  const loadScript = (src) => (loaded[src] ||= new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("تعذر تحميل قارئ الملفات. تحقق من الإنترنت.")); document.head.append(s); }));
  const SECTIONS = A.SECTIONS;
  const digits = (v) => String(v ?? "").replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x06f0);
  const norm = (s) => digits(s).normalize("NFKC").replace(/[ً-ْـ‎‏‪-‮⁦-⁩]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // =====================================================================
  // قراءة الملف إلى «كتل» من الصفوف (ورقة Excel أو صفحة PDF)
  // كل خلية: { t: النص, l/r: حدودها الأفقية في PDF فقط }
  // =====================================================================
  async function readFile(file, opt = {}) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (file.size > 25 * 1024 * 1024) throw new Error("حجم الملف أكبر من 25 ميجابايت.");
    const buf = await file.arrayBuffer();
    if (ext === "pdf") return readPdf(buf, opt);
    if (["xlsx", "xls", "csv"].includes(ext)) return readSheet(buf, ext === "csv");
    if (opt.ocr && /^(png|jpe?g|webp)$/.test(ext)) return ocrImages([file], opt);
    throw new Error("صيغة غير مدعومة. استخدم Excel أو CSV أو PDF.");
  }
  async function readSheet(buf, isCsv) {
    await loadScript(XLSXJS);
    const wb = isCsv ? XLSX.read(new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, ""), { type: "string", raw: true }) : XLSX.read(buf, { type: "array" });
    // خلايا التاريخ في Excel تُقرأ من رقمها التسلسلي مباشرة (دون فروق المنطقة الزمنية)
    const serialIso = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      if (!ws["!ref"]) return { title: name, rows: [] };
      const rg = XLSX.utils.decode_range(ws["!ref"]), rows = [];
      for (let r = rg.s.r; r <= rg.e.r; r++) {
        const row = [];
        for (let c = rg.s.c; c <= rg.e.c; c++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          let t = "";
          if (cell) {
            if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) t = serialIso(cell.v);
            else if (cell.t === "d" && cell.v instanceof Date) t = cell.v.toISOString().slice(0, 10);
            else t = String(cell.w ?? cell.v ?? "").trim();
          }
          row.push({ t });
        }
        if (row.some((x) => x.t)) { row.y = -r; rows.push(row); }
      }
      return { title: name, rows };
    });
  }
  async function pdfDoc(buf) {
    await loadScript(PDFJS);
    const lib = window.pdfjsLib || window["pdfjs-dist/build/pdf"];
    lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return lib.getDocument({ data: buf }).promise;
  }
  async function readPdf(buf, opt = {}) {
    const doc = await pdfDoc(buf);
    const blocks = [], scanned = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const its = tc.items.map((it) => ({ s: String(it.str || "").normalize("NFKC").replace(/\s+/g, " ").trim(), x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.height || it.transform[3] || 10) })).filter((i) => i.s);
      its.sort((a, b) => b.y - a.y);
      const lines = [];
      for (const it of its) { const ln = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2.5, it.h * 0.35)); if (ln) ln.items.push(it); else lines.push({ y: it.y, h: it.h, items: [it] }); }
      const rows = lines.map((ln) => { const r = cells(ln.items); r.y = ln.y; r.h = ln.h; return r; }).filter((r) => r.length);
      // صفحة بلا نص تقريبًا = صورة ممسوحة ضوئيًا
      if (rows.length < 3) { scanned.push(p); if (!rows.length) continue; }
      blocks.push({ title: "صفحة " + p, page: p, rows, pdf: true });
    }
    if (opt.ocr && scanned.length) {
      for (const [i, p] of scanned.entries()) {
        opt.onProgress && opt.onProgress({ stage: "ocr", done: i, total: scanned.length, page: p });
        const page = await doc.getPage(p);
        const vp = page.getViewport({ scale: 3 });
        const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        const lines = await ocr(cv);
        page.cleanup();
        const k = blocks.findIndex((b) => b.page === p); if (k >= 0) blocks.splice(k, 1);
        blocks.push({ title: "صفحة " + p + " (صورة)", page: p, ocr: true, rows: lines.map((t) => [{ t }]) });
        if (opt.cancelled && opt.cancelled()) throw new Error("أُلغيت القراءة.");
      }
      opt.onProgress && opt.onProgress({ stage: "ocr", done: scanned.length, total: scanned.length });
      await ocrEnd();
      blocks.sort((a, b) => a.page - b.page);
    }
    if (!blocks.length) throw new Error(opt.ocr ? "تعذرت قراءة الملف." : "ملف PDF لا يحتوي نصًا قابلًا للقراءة. إن كان صورة ممسوحة ضوئيًا فصدّره بصيغة Excel.");
    if (!opt.ocr && scanned.length && blocks.every((b) => b.rows.length < 3)) throw new Error("الملف صور ممسوحة ضوئيًا. صدّره بصيغة Excel أو CSV.");
    blocks.scanned = scanned;
    return blocks;
  }

  // =====================================================================
  // قراءة النص من الصور (OCR) — تُحمَّل عند الحاجة فقط (~10 ميجابايت مرة واحدة ثم تُخزَّن في المتصفح)
  // =====================================================================
  const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const TESS_LANG = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/ara@1.0.0/4.0.0_best_int";
  let tw = null;
  async function ocr(canvas) {
    if (!tw) {
      await loadScript(TESS);
      tw = await window.Tesseract.createWorker("ara", 1, { langPath: TESS_LANG, gzip: true });
      await tw.setParameters({ preserve_interword_spaces: "1" });
    }
    const { data } = await tw.recognize(canvas);
    return String(data.text || "").split("\n").map((l) => l.replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim()).filter(Boolean);
  }
  async function ocrEnd() { if (tw) { try { await tw.terminate(); } catch {} tw = null; } }
  async function ocrImages(files, opt) {
    const blocks = [];
    for (const [i, f] of files.entries()) {
      opt.onProgress && opt.onProgress({ stage: "ocr", done: i, total: files.length });
      const img = await createImageBitmap(f);
      const sc = Math.min(3, 3000 / Math.max(img.width, img.height) * 1.6);
      const cv = document.createElement("canvas"); cv.width = img.width * sc; cv.height = img.height * sc;
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      blocks.push({ title: f.name, page: i + 1, ocr: true, rows: (await ocr(cv)).map((t) => [{ t }]) });
    }
    await ocrEnd();
    return blocks;
  }
  // تجميع العناصر المتجاورة في خلايا، مرتبة من اليمين إلى اليسار (مثل الجداول العربية)
  function cells(items) {
    const sorted = [...items].sort((a, b) => (b.x + b.w) - (a.x + a.w));
    const out = [];
    for (const it of sorted) {
      const c = out[out.length - 1];
      const gap = c ? c.l - (it.x + it.w) : Infinity;
      if (c && gap < Math.max(4, it.h * 0.9)) { c.parts.push({ ...it, gap }); c.l = Math.min(c.l, it.x); }
      else out.push({ parts: [{ ...it, gap: 0 }], l: it.x, r: it.x + it.w });
    }
    return out.map((c) => {
      // الأجزاء اللاتينية/الرقمية المتتالية تُقرأ من اليسار إلى اليمين
      const res = []; let run = [];
      const flush = () => { if (run.length) { res.push(...run.reverse()); run = []; } };
      for (const p of c.parts) { if (/^[0-9A-Za-z@._\-/:+]+$/.test(p.s)) run.push(p); else { flush(); res.push(p); } }
      flush();
      // مسافة بين الأجزاء فقط إذا كانت الفجوة بينها واضحة (بعض ملفات PDF تكتب كل حرف منفصلًا)
      let t = ""; res.forEach((p, i) => { t += (i && p.gap > p.h * 0.22 ? " " : "") + p.s; });
      return { t: t.replace(/\s+/g, " ").trim(), l: c.l, r: c.r };
    });
  }
  // محاذاة خلايا صف PDF مع أعمدة سطر العناوين حسب التداخل الأفقي
  function align(row, header) {
    if (!header.some((h) => h.l != null) || !row.some((c) => c.l != null)) return row.map((c) => c.t);
    const out = new Array(header.length).fill("");
    for (const c of row) {
      let best = -1, ov = 0;
      header.forEach((h, i) => { const o = Math.min(c.r, h.r) - Math.max(c.l, h.l); if (o > ov) { ov = o; best = i; } });
      if (best < 0) { let d = Infinity; header.forEach((h, i) => { const dd = Math.abs((h.l + h.r) / 2 - (c.l + c.r) / 2); if (dd < d) { d = dd; best = i; } }); }
      out[best] = out[best] ? out[best] + " " + c.t : c.t;
    }
    return out;
  }

  // =====================================================================
  // الجدول الدراسي
  // يقبل صيغتين: (1) صفوف «الشعبة، اليوم، 1، 2، 3…» (2) جدول لكل شعبة: عنوان فيه رقم الشعبة ثم الأيام والحصص
  // =====================================================================
  const DAY_RE = [/احد/, /اثنين|اتنين/, /ثلاثاء|ثلاثا/, /اربعاء|اربعا/, /خميس/];
  const dayOf = (t) => { const n = norm(t); if (!n || n.length > 14) return -1; return DAY_RE.findIndex((r) => r.test(n)); };
  const ORD = { "الاولي": 1, "الاولى": 1, "الثانيه": 2, "الثالثه": 3, "الرابعه": 4, "الخامسه": 5, "السادسه": 6, "السابعه": 7, "الثامنه": 8 };
  function periodNum(t) {
    const n = norm(t).replace(/\b\d{1,2}\s*[:.]\s*\d{2}\b/g, " ");
    if (!n || dayOf(n) >= 0 || /يوم|شعب|فصل/.test(n)) return null;
    const m = n.match(/(?:^|\D)([1-8])(?:\D|$)/);
    if (m && (/حص/.test(n) || /^\s*[1-8]\s*$/.test(n) || n.length <= 12)) return +m[1];
    for (const [w, k] of Object.entries(ORD)) if (n.includes(w)) return k;
    return null;
  }
  const timeOf = (t) => { const m = digits(t).match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\b/); if (!m) return ""; let h = +m[1]; if (h >= 1 && h <= 5) h += 12; return String(h).padStart(2, "0") + ":" + m[2]; };
  const SEC_RE = /(?:الشعب[هة]?|شعب[هة]|الفصل|فصل|(?:^|\s)ش)\s*[:\-–]?\s*(\d{1,2})(?!\d)/;
  // جداول مثل تصدير aSc Timetables: صفحة لكل شعبة («ش١»)، المادة قد تمتد على أكثر من سطر، واسم المعلم بخط أصغر تحتها
  const SEC_ONLY = /^(?:ش|شعب[هة]|الشعب[هة]|فصل|الفصل)\s*[:\-–]?\s*(\d{1,2})$/;
  const tidy = (t) => digits(t).replace(/([ء-ي])(\d)/g, "$1 $2").replace(/\s+/g, " ").trim().slice(0, 30);
  function parseBands(b) {
    if (!b.pdf) return null;
    const rows = b.rows.filter((r) => r.y != null);
    // سطر أرقام الحصص
    const hi = rows.findIndex((r) => r.filter((c) => /^\s*[1-8]\s*$/.test(digits(c.t))).length >= 3 && !r.some((c) => dayOf(c.t) >= 0));
    if (hi < 0) return null;
    const head = rows[hi].filter((c) => /^\s*[1-8]\s*$/.test(digits(c.t))).map((c) => ({ p: +digits(c.t).trim(), cx: (c.l + c.r) / 2 }));
    const colOf = (c) => { const x = (c.l + c.r) / 2; let best = null, d = Infinity; for (const h of head) { const dd = Math.abs(h.cx - x); if (dd < d) { d = dd; best = h; } } return best; };
    const dayRows = rows.filter((r) => r.some((c) => dayOf(c.t) >= 0));
    if (dayRows.length < 3) return null;
    let sec = "";
    for (const r of rows) for (const c of r) { const m = norm(c.t).match(SEC_ONLY) || norm(c.t).match(SEC_RE); if (m && !sec) sec = String(+m[1]); }
    if (!sec) { const m = norm(b.title).match(SEC_RE); if (m) sec = String(+m[1]); }
    const times = {};
    for (const r of rows.slice(hi + 1, hi + 3)) for (const c of r) { const tt = digits(c.t).match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})/); if (tt) { const h = colOf(c); const f = (H, M) => { H = +H; if (H >= 1 && H <= 5) H += 12; return String(H).padStart(2, "0") + ":" + M; }; if (h) times[h.p] = { start: f(tt[1], tt[2]), end: f(tt[3], tt[4]) }; } }
    const dayH = dayRows.map((r) => r.h || 10).sort((a, x) => a - x)[Math.floor(dayRows.length / 2)];
    const grid = [0, 1, 2, 3, 4].map(() => []);
    const bands = dayRows.map((r) => ({ y: r.y, d: dayOf(r.find((c) => dayOf(c.t) >= 0).t), lines: [] }));
    const yHead = rows[hi].y;
    for (const r of rows) {
      if (r.y >= yHead - 1) continue; // ما فوق سطر الحصص (العنوان والأوقات)
      if (r.some((c) => /^\s*\d{1,2}\s*[:.]\s*\d{2}\s*[-–—]/.test(digits(c.t)))) continue;
      let band = null, dist = Infinity;
      for (const bd of bands) { const dd = Math.abs(bd.y - r.y); if (dd < dist) { dist = dd; band = bd; } }
      if (!band || dist > dayH * 4) continue;
      // اسم المعلم: سطر بخط أصغر بوضوح من خط المواد (يُتجاهل)
      if ((r.h || dayH) < dayH * 0.65) continue;
      band.lines.push(r);
    }
    for (const bd of bands) {
      if (bd.d < 0) continue;
      const cells = {};
      bd.lines.sort((a, x) => x.y - a.y).forEach((r) => r.forEach((c) => { if (dayOf(c.t) >= 0) return; const h = colOf(c); if (!h) return; (cells[h.p] = cells[h.p] || []).push(c.t); }));
      for (const [p, parts] of Object.entries(cells)) grid[bd.d][+p - 1] = tidy(parts.join(" "));
    }
    const filled = grid.flat().filter(Boolean).length;
    if (!filled) return null;
    return { sec, grid, times, maxP: Math.max(...head.map((h) => h.p)) };
  }
  function parseTimetable(blocks) {
    const sections = {}, times = {}, timesG1 = {}, warn = new Set();
    let maxP = 0;
    // أولًا: جداول الصفحات (صفحة لكل شعبة) بأسطر متعددة للمادة
    const rest = [];
    for (const b of blocks) {
      const r = parseBands(b);
      if (!r) { rest.push(b); continue; }
      if (!SECTIONS.includes(r.sec)) { warn.add(r.sec ? "الشعبة " + r.sec + " غير موجودة في قائمة الشعب" : "صفحة بلا رقم شعبة (" + b.title + ")"); continue; }
      sections[r.sec] = r.grid; maxP = Math.max(maxP, r.maxP);
      const tgt = +r.sec < 10 ? timesG1 : times; // أوقات الأول الثانوي (الشعب 1–8) قد تختلف
      for (const [p, t] of Object.entries(r.times)) if (!tgt[p]) tgt[p] = t;
    }
    blocks = rest;
    for (const b of blocks) {
      let header = null, map = null, sec = (norm(b.title).match(SEC_RE) || [])[1] || "";
      for (const row of b.rows) {
        const texts = row.map((c) => c.t);
        const joined = norm(texts.join(" "));
        const pc = texts.map(periodNum);
        if (pc.filter((x) => x).length >= 3 && !texts.some((t) => dayOf(t) >= 0)) {
          header = row;
          map = { periods: pc, day: texts.findIndex((t) => /يوم/.test(norm(t))), sec: texts.findIndex((t) => /شعب|فصل/.test(norm(t)) && !SEC_RE.test(norm(t))) };
          pc.forEach((p, i) => { if (p) { const tm = timeOf(texts[i]); if (tm && !times[p]) times[p] = tm; } });
          continue;
        }
        // سطر أوقات الحصص أسفل العناوين (شائع في ملفات PDF)
        if (header && !texts.some((t) => dayOf(t) >= 0) && texts.filter((t) => timeOf(t)).length >= 3) {
          align(row, header).forEach((t, i) => { const p = map.periods[i], tm = timeOf(t); if (p && tm && !times[p]) times[p] = tm; });
          continue;
        }
        // عنوان من سطرين (مثل «اليوم» تحت أرقام الحصص في PDF): نضيف خلاياه التي لا تتداخل مع أعمدة الحصص
        if (header && b.pdf && !texts.some((t) => dayOf(t) >= 0) && !SEC_RE.test(joined) && row.every((c) => c.l != null)) {
          let added = false;
          for (const c of row) if (!header.some((h) => Math.min(c.r, h.r) - Math.max(c.l, h.l) > 0)) { header = [...header, c]; map.periods.push(null); if (/يوم/.test(norm(c.t))) map.day = header.length - 1; added = true; }
          if (added) continue;
        }
        const ts = joined.match(SEC_RE);
        if (ts && !texts.some((t) => dayOf(t) >= 0)) { sec = String(+ts[1]); continue; }
        if (!header) continue;
        const cellsA = align(row, header);
        let di = map.day >= 0 ? dayOf(cellsA[map.day]) : -1;
        if (di < 0) { for (const t of cellsA) { di = dayOf(t); if (di >= 0) break; } }
        if (di < 0) continue;
        const s = map.sec >= 0 ? String(+digits(cellsA[map.sec]).replace(/\D/g, "") || "") : sec;
        if (!SECTIONS.includes(s)) { warn.add(s ? "الشعبة " + s + " غير موجودة في قائمة الشعب" : "صفوف بلا رقم شعبة (أضف «الشعبة 14» أعلى الجدول أو عمود «الشعبة»)"); continue; }
        sections[s] = sections[s] || [0, 1, 2, 3, 4].map(() => []);
        map.periods.forEach((p, i) => { if (p) { sections[s][di][p - 1] = String(cellsA[i] || "").replace(/\s+/g, " ").trim().slice(0, 30); maxP = Math.max(maxP, p); } });
      }
    }
    Object.values(sections).forEach((g) => g.forEach((r) => { for (let i = 0; i < maxP; i++) r[i] = r[i] || ""; }));
    const periods = maxP ? Array.from({ length: maxP }, (_, i) => times[i + 1] || "") : [];
    const ends = periods.map((t) => (t && typeof t === "object" ? t.end : ""));
    // صفحات الأول الثانوي فقط بأوقات: تُعتمد أساسًا إذا لم توجد أوقات لغيرها
    if (!periods.some(Boolean) && Object.keys(timesG1).length) for (let i = 0; i < maxP; i++) { const t = timesG1[i + 1]; if (t) { periods[i] = t.start; ends[i] = t.end; } }
    const g1 = maxP && Object.keys(timesG1).length ? Array.from({ length: maxP }, (_, i) => timesG1[i + 1] || null) : null;
    const g1Differs = !!g1 && g1.some((t, i) => t && (t.start !== (periods[i] && typeof periods[i] === "object" ? periods[i].start : periods[i])));
    return { sections, periods: periods.map((t) => (t && typeof t === "object" ? t.start : t)), ends, periodsG1: g1Differs ? g1.map((t) => ({ start: t ? t.start : "", end: t ? t.end : "" })) : null, warnings: [...warn], count: Object.keys(sections).length };
  }

  // =====================================================================
  // التقويم الدراسي: تواريخ ميلادية أو هجرية (أم القرى)، أرقامًا أو بأسماء الشهور
  // =====================================================================
  let H2G = null;
  function hijriToIso(y, m, d) {
    if (!H2G) {
      H2G = new Map();
      const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" });
      for (let t = Date.UTC(2023, 0, 1); t <= Date.UTC(2033, 11, 31); t += 864e5) {
        const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]));
        H2G.set(`${parseInt(p.year)}-${+p.month}-${+p.day}`, new Date(t).toISOString().slice(0, 10));
      }
    }
    return H2G.get(`${y}-${m}-${d}`) || "";
  }
  const GM = { "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "مايو": 5, "يونيو": 6, "يونيه": 6, "يوليو": 7, "يوليه": 7, "اغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
    "كانون الثاني": 1, "شباط": 2, "اذار": 3, "نيسان": 4, "ايار": 5, "حزيران": 6, "تموز": 7, "اب": 8, "ايلول": 9, "تشرين الاول": 10, "تشرين الثاني": 11, "كانون الاول": 12 };
  const HM = { "محرم": 1, "صفر": 2, "ربيع الاول": 3, "ربيع الاخر": 4, "ربيع الثاني": 4, "جمادي الاولي": 5, "جمادي الاخره": 6, "جمادي الثانيه": 6, "رجب": 7, "شعبان": 8, "رمضان": 9, "شوال": 10, "ذو القعده": 11, "ذي القعده": 11, "ذو الحجه": 12, "ذي الحجه": 12 };
  const valid = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  function toIso(y, m, d) {
    if (!valid(y, m, d)) return "";
    if (y >= 1400 && y <= 1500) return hijriToIso(y, m, d);
    if (y >= 1900 && y <= 2100) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 ? iso(y, m, d) : ""; }
    return "";
  }
  /** كل التواريخ في النص (يُفضّل الميلادي إذا ذُكر الهجري والميلادي معًا لنفس اليوم) */
  function datesIn(text) {
    let s = norm(text); const out = [];
    if (/^\d{5}$/.test(s) && +s > 40000 && +s < 60000) { const t = new Date(Date.UTC(1899, 11, 30) + +s * 864e5); return [t.toISOString().slice(0, 10)]; } // رقم تاريخ Excel
    const found = [];
    const push = (i, d, hij) => d && found.push({ i, d, hij });
    s.replace(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/g, (m, y, mo, d, i) => { push(i, toIso(+y, +mo, +d), +y < 1600); return " ".repeat(m.length); });
    s = s.replace(/(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/g, (m) => " ".repeat(m.length));
    s.replace(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/g, (m, d, mo, y, i) => { push(i, toIso(+y, +mo, +d), +y < 1600); });
    s = s.replace(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/g, (m) => " ".repeat(m.length));
    const names = [...Object.entries(GM).map(([k, v]) => [k, v, false]), ...Object.entries(HM).map(([k, v]) => [k, v, true])].sort((a, b) => b[0].length - a[0].length);
    for (const [k, mo, hij] of names) {
      const re = new RegExp("(\\d{1,2})\\s+" + k.replace(/ /g, "\\s+") + "\\s*(\\d{4})", "g");
      s = s.replace(re, (m, d, y, i) => { push(i, toIso(+y, mo, +d), hij); return " ".repeat(m.length); });
    }
    found.sort((a, b) => a.i - b.i);
    // هجري وميلادي متجاوران لنفس اليوم: نُبقي واحدًا
    for (const f of found) { const last = out[out.length - 1]; if (last && last.d === f.d) { continue; } out.push(f); }
    return out.map((f) => f.d);
  }
  const TERM_ORD = [/اول|الاول/, /ثاني|الثاني/, /ثالث|الثالث/];
  function parseCalendar(blocks) {
    const terms = [], breaks = [], skipped = [];
    const termAt = (name) => { const n = norm(name); let i = TERM_ORD.findIndex((r) => r.test(n.replace(/الاسبوع.*$/, ""))); if (i < 0) i = terms.length; terms[i] = terms[i] || { name: ["الفصل الأول", "الفصل الثاني", "الفصل الثالث"][i], start: "", end: "" }; return terms[i]; };
    for (const b of blocks) for (const row of b.rows) {
      const texts = row.map((c) => c.t).filter(Boolean);
      const ds = [...new Set(texts.flatMap(datesIn))]; // الهجري والميلادي لليوم نفسه = تاريخ واحد
      if (!ds.length) continue;
      const nameCell = texts.filter((t) => /[؀-ۿ]/.test(t) && !datesIn(t).length && dayOf(t) < 0 && !/^(فصل|اجازه|إجازة|النوع|من|الى|إلى)$/.test(norm(t).replace(/ /g, "")))
        .sort((a, b) => b.length - a.length)[0] || "";
      const type = norm(texts.find((t) => /^(فصل|اجازه|إجازة)$/.test(norm(t))) || "");
      const n = norm(nameCell + " " + type);
      if (/^(ال)?(عوده|استئناف|بدء الدراسه بعد)/.test(norm(nameCell))) continue; // يوم العودة يُحسب تلقائيًا
      if (/اجازه|عطله/.test(n)) { breaks.push({ name: nameCell.replace(/^(من|بداية)\s+/, "").trim() || "إجازة", from: ds[0], to: ds[1] && ds[1] >= ds[0] ? ds[1] : ds[0] }); continue; }
      if (/فصل|دراس/.test(n)) {
        if (/بدايه|بدء|يبدا|انطلاق|بداية/.test(n) && ds.length === 1) { termAt(nameCell).start = ds[0]; continue; }
        if (/نهايه|اخر|ختام|انتهاء|نهاية/.test(n) && ds.length === 1) { termAt(nameCell).end = ds[0]; continue; }
        if (ds.length >= 2) { const t = termAt(nameCell || type); t.start = ds[0]; t.end = ds[1]; continue; }
      }
      skipped.push(nameCell || texts.join(" "));
    }
    breaks.sort((a, b) => (a.from < b.from ? -1 : 1));
    return { terms: terms.filter(Boolean), breaks, skipped };
  }


  // =====================================================================
  // الاختبارات النهائية: الجدول، ومقرات اللجان، وكشوف الجلوس
  // =====================================================================
  const GR = ["الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"];
  const gradeOf = (t) => { const n = norm(t); if (/ثالث|تالث|ثلث/.test(n)) return GR[2]; if (/ثاني|تاني|ثاتي|تاتي/.test(n)) return GR[1]; if (/اول/.test(n)) return GR[0]; const d = digits(n).trim(); return d === "1" || d === "10" ? GR[0] : d === "2" || d === "11" ? GR[1] : d === "3" || d === "12" ? GR[2] : ""; };
  const PER = ["الأولى", "الثانية", "الثالثة"];
  const periodOf = (t) => { const n = norm(t); if (/الثالث/.test(n)) return PER[2]; if (/الثاني/.test(n)) return PER[1]; if (/الاول|الاولي/.test(n)) return PER[0]; return ""; };
  /** «٧ – ٩:٣٠» أو «7:00-9:30» ← {start, end} */
  function timesIn(t) {
    const s = digits(t);
    if (datesIn(s).length || /\d{4}/.test(s)) return null;
    const ms = [...s.matchAll(/(?<![\d/])(\d{1,2})(?:\s*[:.]\s*(\d{2}))?(?![\d/])/g)].map((m) => { let h = +m[1]; if (h >= 1 && h <= 5) h += 12; return h <= 23 ? String(h).padStart(2, "0") + ":" + (m[2] || "00") : ""; }).filter(Boolean);
    if (ms.length < 2 || !/[:.\-–—]|الى|إلى/.test(s)) return null;
    ms.sort();
    return { start: ms[0], end: ms[ms.length - 1] };
  }
  function parseFinalsSchedule(blocks) {
    const rows = [], warn = [];
    for (const b of blocks) {
      let header = null, map = null;
      for (const row of b.rows) {
        const texts = row.map((c) => c.t);
        const gcols = texts.map((t) => (/صف|ثانوي|الاول|الثاني|الثالث/.test(norm(t)) && norm(t).length < 30 && !datesIn(t).length ? gradeOf(t) : ""));
        if (new Set(gcols.filter(Boolean)).size >= 2) {
          header = row; map = { g: gcols, date: texts.findIndex((t) => /تاريخ|يوم|ايام/.test(norm(t))), per: texts.findIndex((t) => /فتر/.test(norm(t))), from: texts.findIndex((t) => /^(من|البدايه|بدايه|وقت البدء)$/.test(norm(t))), to: texts.findIndex((t) => /^(الى|إلى|النهايه|نهايه|وقت الانتهاء)$/.test(norm(t))), time: texts.findIndex((t) => /وقت|زمن|الساعه/.test(norm(t))) };
          continue;
        }
        if (!header) continue;
        const a = align(row, header);
        const ds = a.flatMap(datesIn); if (!ds.length) continue;
        const r = { date: ds[0], period: "", start: "", end: "", subjects: {} };
        r.period = periodOf(map.per >= 0 ? a[map.per] : "") || a.map(periodOf).find(Boolean) || PER[0];
        if (map.from >= 0 && map.to >= 0) { r.start = timeOf(a[map.from]) || (/^\s*\d{1,2}\s*$/.test(digits(a[map.from])) ? String(+digits(a[map.from])).padStart(2, "0") + ":00" : ""); r.end = timeOf(a[map.to]) || ""; }
        if (!r.start) { const tt = (map.time >= 0 && timesIn(a[map.time])) || a.map(timesIn).find(Boolean); if (tt) Object.assign(r, tt); }
        map.g.forEach((g, i) => { if (g && a[i]) { const v = String(a[i]).replace(/\s+/g, " ").trim(); if (v && v !== "-" && !/^(لا يوجد|—|–)$/.test(v)) r.subjects[g] = v.slice(0, 60); } });
        if (Object.keys(r.subjects).length) rows.push(r); else warn.push("يوم " + r.date + " بلا مواد");
      }
    }
    if (!rows.length) warn.unshift("لم أجد جدولًا فيه أعمدة الصفوف (الأول/الثاني/الثالث الثانوي) وتواريخ. استخدم النموذج الفارغ.");
    return { schedule: rows, warnings: warn };
  }

  /** اسم المقر بصيغة موحّدة (يصحح أخطاء استخراج النص من PDF) */
  function cleanFloor(t) {
    const raw = String(t || "");
    const n = norm(raw.replace(/^.*?(?:مقر\s*اللجن[هة]|المقر)\s*[:：]?/, ""));
    // أول عبارة مكان فقط (ما بعدها قد يكون نصًا آخر من السطر نفسه)
    const m = n.match(/(?:الدور|الطابق|دور)\s*(\S+)|(الصال[هة]|صاله|صالة)\s*\S*|(المختبر|المكتب[هة]|المسرح|المصلي)\S*/);
    if (m) {
      if (m[2] || /صال|رياض/.test(m[0])) return "الصالة الرياضية";
      if (m[3]) return raw.match(/المختبر|المكتبة|المسرح|المصلى/)?.[0] || m[3];
      const w = m[1] || "";
      if (/ارضي/.test(w)) return "الدور الأرضي";
      if (/ثالث|تالث/.test(w)) return "الدور الثالث";
      if (/رابع/.test(w)) return "الدور الرابع";
      if (/ثاني|تاني/.test(w)) return "الدور الثاني";
      if (/اول|االول/.test(w)) return "الدور الأول";
      return ("الدور " + w).trim();
    }
    if (/صال|رياض/.test(n)) return "الصالة الرياضية";
    return raw.replace(/^.*?[:：]\s*/, "").replace(/\s+/g, " ").trim().slice(0, 40);
  }
  /** خلايا مدمجة في PDF: النص يظهر في منتصف المجموعة، فنوزعه على صفوفها */
  function spreadMerged(rows, labels) {
    // rows: [{y}] من الأعلى للأسفل، labels: [{y, t}]
    // نختار تقسيمًا متصلًا للصفوف يجعل كل عنوان أقرب ما يكون لمنتصف مجموعته (برمجة ديناميكية)
    const n = rows.length, out = new Array(n).fill("");
    if (!labels.length || !n) return out;
    labels = [...labels].sort((a, b) => b.y - a.y);
    const L = Math.min(labels.length, n);
    const cost = (k, s, e) => { const c = (rows[s].y + rows[e].y) / 2 - labels[k].y; return c * c; };
    const D = Array.from({ length: L + 1 }, () => new Array(n + 1).fill(Infinity)), W = Array.from({ length: L + 1 }, () => new Array(n + 1).fill(-1));
    D[0][0] = 0;
    for (let k = 1; k <= L; k++) for (let e = k; e <= n; e++) for (let s = k - 1; s < e; s++) {
      if (D[k - 1][s] === Infinity) continue;
      const v = D[k - 1][s] + cost(k - 1, s, e - 1);
      if (v < D[k][e]) { D[k][e] = v; W[k][e] = s; }
    }
    for (let k = L, e = n; k > 0; k--) { const s = W[k][e]; for (let j = s; j < e; j++) out[j] = labels[k - 1].t; e = s; }
    return out;
  }
  function parseCommittees(blocks) {
    const out = {}; const warn = [];
    for (const b of blocks) {
      let header = null, cols = null; const recs = [], extra = [];
      for (const row of b.rows) {
        const texts = row.map((c) => norm(c.t));
        if (!header) {
          const ci = texts.findIndex((t) => /رقم\s*اللجن|^اللجن[هة]$|^اللجنه$/.test(t));
          if (ci >= 0) {
            const fi = texts.findIndex((t, i) => i !== ci && /مقر\s*اللجن|الدور|الطابق|الموقع/.test(t));
            const ri = texts.findIndex((t, i) => i !== ci && i !== fi && /شعب|قاع|فصل|^المقر|غرف/.test(t));
            header = row; cols = { c: ci, f: fi, r: ri }; continue;
          }
          continue;
        }
        const a = align(row, header);
        const num = +digits(a[cols.c]).replace(/[^\d]/g, "").slice(0, 3);
        const rec = { y: row.y ?? 0, f: cols.f >= 0 ? a[cols.f] : "", r: cols.r >= 0 ? a[cols.r] : "" };
        if (num > 0 && num < 500 && /^\s*\d{1,3}\s*$/.test(digits(a[cols.c]))) { rec.n = num; recs.push(rec); } else if (rec.f || rec.r) extra.push(rec);
      }
      if (!header || !recs.length) continue;
      const fill = (key) => {
        const direct = recs.filter((r) => r[key]).length;
        if (!b.pdf) { let last = ""; return recs.map((r) => (last = r[key] || last)); } // Excel: الخلية المدمجة قيمتها في أول صف
        const merged = direct < recs.length * 0.5;
        const labels = extra.filter((x) => x[key]).map((x) => ({ y: x.y, t: x[key] }));
        const res = recs.map((r) => (merged ? "" : r[key]));
        if (merged) recs.forEach((r) => { if (r[key]) labels.push({ y: r.y, t: r[key] }); });
        // مجموعات الصفوف الخالية من القيمة
        let i = 0;
        while (i < recs.length) {
          if (res[i]) { i++; continue; }
          let j = i; while (j + 1 < recs.length && !res[j + 1]) j++;
          const gapT = i > 0 ? (recs[i - 1].y - recs[i].y) / 2 : 1e9, gapB = j < recs.length - 1 ? (recs[j].y - recs[j + 1].y) / 2 : 1e9;
          const inRun = labels.filter((l) => l.y <= recs[i].y + gapT && l.y >= recs[j].y - gapB);
          const vals = spreadMerged(recs.slice(i, j + 1), inRun);
          vals.forEach((v, k) => { res[i + k] = v; });
          i = j + 1;
        }
        return res;
      };
      const fl = fill("f"), rm = fill("r");
      recs.forEach((r, k) => { out[r.n] = { floor: cleanFloor(fl[k]), room: /^\s*\d{1,2}\s*$/.test(digits(rm[k])) ? "الشعبة " + (+digits(rm[k])) : cleanFloor(rm[k]) }; });
    }
    if (!Object.keys(out).length) warn.push("لم أجد جدولًا فيه عمود «رقم اللجنة». استخدم النموذج الفارغ.");
    return { committees: out, warnings: warn };
  }

  // كشوف الجلوس: من جدول (Excel/CSV/PDF نصي) أو من صور ممسوحة (OCR)
  const SEAT = /(?<!\d)(\d{6,12})(?!\d)/;
  const COM_RE = /(?:رقم|قم|رقر)?\s*اللجن[هة]\s*[:：.]?\s*(\d{1,3})(?!\d)/;
  const GRADE_W = /(?:^|\s)((?:ال)?(?:اول|اولي|ثاني|ثاتي|تاني|تاتي|ثالث|تالث|ثلث))(?=\s|$|\d|ال|ثان|تان)/g;
  function lineRow(text) {
    const s = norm(text).replace(/[|[\]{}()«»"'،,؛;_!.]/g, " ").replace(/\s+/g, " ");
    const m = s.match(SEAT); if (!m) return null;
    const idx = +((s.slice(0, m.index).match(/(\d{1,3})\s*$/) || [])[1] || 0);
    const before = s.slice(0, m.index), after = s.slice(m.index + m[1].length);
    // الترتيب المعتاد: م، رقم الجلوس، الاسم، الصف، الشعبة — وأحيانًا تنقلب القراءة فيأتي رقم الجلوس آخر السطر
    let zone = after, gm = [...after.matchAll(GRADE_W)].pop();
    if (!gm || after.slice(0, gm.index).replace(/[^ء-ي ]/g, "").trim().split(" ").length < 2) { const g2 = [...before.matchAll(GRADE_W)].pop(); if (g2) { zone = before; gm = g2; } }
    if (!gm) return null;
    const name = zone.slice(0, gm.index).replace(/^\s*\d{1,3}\s/, " ").replace(/[^ء-ي\s]/g, " ").replace(/\s+/g, " ").trim().replace(/^\S\s+/, "").replace(/\s+\S$/, "");
    const rest = zone.slice(gm.index + gm[0].length) + (zone === before ? " " + after : "");
    const sec = (rest.match(/(?<!\d)(\d{1,2})(?!\d)/) || [])[1] || "";
    if (name.split(" ").length < 2) return null;
    return { seat: m[1], name, grade: gradeOf(gm[1]), section: sec ? String(+sec) : "", idx };
  }
  function parseSeating(blocks) {
    const rows = [], pages = [];
    for (const b of blocks) {
      let header = null, cols = null, committee = "", floor = "", count = 0;
      const pg = { page: b.page || 0, title: b.title, committee: "", floor: "", count: 0, ocr: !!b.ocr };
      for (const row of b.rows) {
        const texts = row.map((c) => c.t), joined = norm(texts.join(" "));
        if (/مقر\s*اللجن/.test(joined) || (/^مقر/.test(joined) && /الدور|الصال/.test(joined))) { floor = cleanFloor(joined.slice(joined.search(/مقر/))); if (!pg.floor) pg.floor = floor; }
        if (!/مقر/.test(joined) && !SEAT.test(digits(joined))) { const cm = digits(joined).match(COM_RE); if (cm) { committee = String(+cm[1]); if (!pg.committee) pg.committee = committee; continue; } }
        if (!b.ocr && !header) {
          const nt = texts.map(norm);
          const si = nt.findIndex((t) => /جلوس/.test(t));
          if (si >= 0) {
            cols = { seat: si, name: nt.findIndex((t) => /اسم/.test(t)), grade: nt.findIndex((t) => /^(ال)?صف$|الصف\b|المرحله|السنه/.test(t) && !/شعب/.test(t)), sec: nt.findIndex((t) => /شعب|فصل/.test(t)), com: nt.findIndex((t) => /لجن/.test(t)), id: nt.findIndex((t) => /هويه|سجل|اقامه/.test(t)) };
            header = row; continue;
          }
        }
        let r = null;
        if (header) {
          const a = align(row, header).map((x) => digits(x));
          const seat = (a[cols.seat] || "").replace(/\D/g, "");
          if (seat.length >= 4) {
            let grade = cols.grade >= 0 ? gradeOf(a[cols.grade]) : "", sec = cols.sec >= 0 ? (a[cols.sec].match(/\d{1,2}/) || [""])[0] : "";
            if (cols.grade >= 0 && !sec) { const mm = a[cols.grade].match(/(?<!\d)(\d{1,2})(?!\d)/); if (mm) sec = mm[1]; } // «الأول الثانوي 4» في عمود واحد
            r = { seat, name: cols.name >= 0 ? a[cols.name] : "", grade, section: sec ? String(+sec) : "", committee: cols.com >= 0 ? String(+(a[cols.com].replace(/\D/g, "")) || "") : "", studentId: cols.id >= 0 ? a[cols.id].replace(/\D/g, "") : "" };
          }
        }
        if (!r) r = lineRow(texts.join(" "));
        if (!r) continue;
        if (pg.first == null) pg.first = r.idx || 0;
        r.committee = r.committee || committee; r.floor = floor; r.page = b.page || 0;
        rows.push(r); count++;
      }
      pg.count = count;
      if (count || pg.committee) pages.push(pg);
    }
    // الصفحات المصوّرة: الأرقام الهندية في رأس الكشف لا تُقرأ آليًا بدقة، فنستنتج رقم اللجنة من ترتيب الصفحات:
    // صفحة يبدأ ترقيمها من 1 = لجنة جديدة، وإلا فهي تكملة للجنة السابقة
    if (pages.some((p) => p.ocr)) {
      let n = 0;
      const firstRead = pages.find((p) => p.ocr && p.count && /^\d+$/.test(p.committee));
      for (const p of pages) {
        if (!p.ocr) { if (+p.committee) n = +p.committee; continue; }
        if (!p.count) continue;
        if (!n) n = firstRead && firstRead === p ? +p.committee || 1 : 1; else if (!(p.first > 10)) n++;
        p.read = p.committee; p.committee = String(n); p.inferred = true;
      }
      for (const r of rows) { const p = pages.find((x) => x.page === r.page); if (p && p.inferred) r.committee = p.committee; }
    }
    return { rows, pages };
  }
  const extract = { lineRow, cleanFloor, spreadMerged, timesIn, gradeOf };

  A.importer = { readFile, parseTimetable, parseCalendar, datesIn, parseFinalsSchedule, parseCommittees, parseSeating, extract, ocrEnd };
})();
