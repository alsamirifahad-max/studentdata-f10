// دليل الطالب: الإضافات الجديدة — الوضع الليلي، البحث، الإعلانات، جدولي واختباراتي، الأسئلة الشائعة، التقييم، تنبيه الرد الجديد، التثبيت كتطبيق
(() => {
  "use strict";
  const BSH = window.BSH;
  if (!BSH) return;
  const $ = (s) => document.querySelector(s);
  const TZ = "Asia/Riyadh";
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c));
    return e;
  }
  const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = d; return s; };
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const dayDiff = (iso) => Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
  const inDays = (n) => n <= 0 ? "اليوم" : n === 1 ? "غدًا" : n === 2 ? "بعد يومين" : n <= 10 ? "بعد " + n + " أيام" : "بعد " + n + " يومًا";
  const fmtDay = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" }); } catch { return iso; } };
  const nowParts = () => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), min: (+p.hour % 24) * 60 + +p.minute }; };
  const toMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return h * 60 + (m || 0); };
  async function getJSON(url) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "تعذر التحميل"); return r.json(); }
  // توحيد النص العربي للبحث (الهمزات، التاء المربوطة، الياء، التشكيل)
  const norm = (s) => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");

  // =====================================================================
  // الوضع الليلي
  // =====================================================================
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (document.documentElement.dataset.theme || (mq.matches ? "dark" : "light")) === "dark";
  const syncThemeColor = () => { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = isDark() ? "#0C1624" : "#00A774"; $("#themeBtn").setAttribute("aria-pressed", String(isDark())); $("#themeBtn").title = isDark() ? "الوضع النهاري" : "الوضع الليلي"; };
  $("#themeBtn").addEventListener("click", () => { const t = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = t; try { localStorage.setItem("bsh_theme", t); } catch {} syncThemeColor(); });
  mq.addEventListener?.("change", syncThemeColor); syncThemeColor();

  // =====================================================================
  // حالة الطالب: الصف والشعبة (من «بياناتي» أو من اختياره، ولا يُحفظ رقم الهوية أبدًا)
  // =====================================================================
  const SECTIONS = ["1","2","3","4","5","6","7","8","11","12","13","14","15","16","17","18","21","22","23","24","25","26","27","28"];
  SECTIONS.forEach((s) => $("#msSection").append(el("option", { value: s, text: "الشعبة " + s })));
  let my = ls.get("bsh_my", null);
  if (my && (!my.grade || !SECTIONS.includes(my.section))) my = null;
  $("#msRemember").checked = ls.get("bsh_my_remember", true);

  // =====================================================================
  // الإعلانات
  // =====================================================================
  const ANN = { urgent: "عاجل", warn: "تنبيه", info: "معلومة", congrats: "تهنئة" };
  const ANN_IC = { urgent: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0"/>' };
  let anns = [];
  const dismissed = () => ls.get("bsh_dismissed", {});
  function visibleAnns() {
    const dm = dismissed();
    return anns.filter((a) => {
      if (dm[a.id] && dm[a.id] === a.v) return false;
      const secs = a.sections || [];
      if (secs.length) return !!my && secs.includes(my.section);
      return !a.grade || (!!my && a.grade === my.grade);
    });
  }
  function annWhen(a) { const d = -dayDiff(a.from); return d <= 0 ? "اليوم" : d === 1 ? "أمس" : d === 2 ? "قبل يومين" : d <= 10 ? "قبل " + d + " أيام" : fmtDay(a.from); }
  function renderNews() {
    const list = visibleAnns(), track = $("#newsTrack"), dots = $("#newsDots");
    $("#news").hidden = !list.length; track.textContent = ""; dots.textContent = "";
    list.forEach((a) => {
      const x = el("button", { class: "nx", type: "button", "aria-label": "إخفاء هذا الإعلان", title: "إخفاء" }, "×");
      x.onclick = () => { const dm = dismissed(); dm[a.id] = a.v; ls.set("bsh_dismissed", dm); renderNews(); BSH.toast("أُخفي الإعلان من هذا الجهاز."); };
      const secs = a.sections || [];
      const aud = secs.length ? (secs.length === 1 ? "للشعبة " : "للشعب ") + secs.join("، ") : a.grade ? "لطلاب " + a.grade : "لكل الطلاب";
      track.append(el("article", { class: "ncard " + a.type, id: "ann-" + a.id },
        el("span", { class: "nk" }, ANN[a.type] + (a.pinned ? " · مثبّت" : "")), x,
        el("h3", { text: a.title }), a.body ? el("p", { text: a.body }) : el("p"), a.audio ? annAudio(a) : null,
        el("div", { class: "nf" }, el("span", { text: annWhen(a) + " · " + aud }), a.link ? el("a", { href: a.link, target: "_blank", rel: "noopener", text: "فتح الرابط ←" }) : null)));
    });
    const pages = Math.max(1, Math.ceil(list.length / perView()));
    if (pages > 1) for (let i = 0; i < pages; i++) dots.append(el("i", { class: i ? "" : "on" }));
    buildIndex(); BSH.emit("news", list);
  }
  // تسجيل صوتي بصوت الإدارة مرفق بالإعلان
  let playing = null;
  const mmss = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  function annAudio(a) {
    const bar = el("i"), lbl = el("span", { text: "استمع للإعلان" + (a.audioSec ? " · " + mmss(a.audioSec) : "") });
    const ic = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ic.setAttribute("viewBox", "0 0 24 24"); ic.setAttribute("aria-hidden", "true");
    const setIc = (p) => { ic.innerHTML = p ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M7 4.5v15l12-7.5z"/>'; };
    setIc(false);
    const b = el("button", { class: "n-audio", type: "button", "aria-label": "تشغيل التسجيل الصوتي للإعلان" }, ic, lbl, el("b", { class: "n-prog" }, bar));
    let au = null;
    b.onclick = (e) => {
      e.stopPropagation();
      if (!au) {
        au = new Audio(a.audio); au.preload = "auto";
        au.ontimeupdate = () => { if (au.duration) { bar.style.width = (au.currentTime / au.duration) * 100 + "%"; lbl.textContent = mmss(au.currentTime) + " / " + mmss(au.duration); } };
        au.onended = au.onpause = () => { setIc(false); b.classList.remove("on"); if (au.ended) { bar.style.width = "0"; lbl.textContent = "استمع مرة أخرى"; } };
        au.onplay = () => { setIc(true); b.classList.add("on"); };
        au.onerror = () => { BSH.toast("تعذر تشغيل التسجيل."); };
      }
      if (au.paused) { if (playing && playing !== au) playing.pause(); window.BSHVoice && BSHVoice.stop(); playing = au; au.play().catch(() => BSH.toast("تعذر تشغيل التسجيل.")); } else au.pause();
    };
    return b;
  }
  const perView = () => (innerWidth <= 600 ? 1 : innerWidth <= 900 ? 2 : 3);
  $("#newsTrack").addEventListener("scroll", () => {
    const t = $("#newsTrack"), d = [...$("#newsDots").children]; if (!d.length) return;
    const ratio = Math.abs(t.scrollLeft) / Math.max(1, t.scrollWidth - t.clientWidth);
    const i = Math.round(ratio * (d.length - 1)); d.forEach((x, j) => x.classList.toggle("on", j === i));
  }, { passive: true });
  getJSON("/api/announcements").then((d) => { anns = d.items || []; renderNews(); }).catch(() => {});

  // =====================================================================
  // المحتوى العام: الأسئلة الشائعة + التقويم + أوقات الحصص
  // =====================================================================
  let faqs = [], periods = [];
  getJSON("/api/content").then((d) => {
    faqs = d.faq || []; periods = d.periods || []; BSH.content = d; BSH.emit("content", d);
    if (d.calendar && window.BSH_setCalendar) window.BSH_setCalendar(d.calendar);
    renderFaqCats(); renderFaq(); buildIndex();
  }).catch(() => {});

  // =====================================================================
  // الأسئلة الشائعة
  // =====================================================================
  let faqCat = "", faqAll = false;
  const FAQ_LIMIT = 6;
  function renderFaqCats() {
    const box = $("#faqCats"); box.textContent = "";
    const cats = [...new Set(faqs.map((f) => f.cat).filter(Boolean))];
    if (cats.length < 2) return;
    ["", ...cats].forEach((c) => { const b = el("button", { type: "button", role: "tab", "aria-selected": String(c === faqCat), text: c || "الكل" }); b.onclick = () => { faqCat = c; faqAll = false; renderFaqCats(); renderFaq(); }; box.append(b); });
  }
  function faqNode(f, open) {
    const d = el("details", { class: "fq-item", id: "faq-" + f.id }, el("summary", {}, el("span", { class: "qm", "aria-hidden": "true", text: "؟" }), el("span", { class: "q", text: f.q })),
      el("div", { class: "fq-a" }, el("p", { text: f.a }), f.link ? el("a", { href: f.link, target: "_blank", rel: "noopener", text: "فتح الرابط ←" }) : null));
    if (open) d.open = true;
    return d;
  }
  function renderFaq() {
    $("#faq").hidden = !faqs.length;
    const q = norm($("#faqQ").value.trim()), box = $("#faqList"); box.textContent = "";
    const list = faqs.filter((f) => (!faqCat || f.cat === faqCat) && (!q || norm(f.q + " " + f.a).includes(q)));
    if (!list.length) box.append(el("p", { class: "faq-none", text: "لا توجد أسئلة مطابقة. جرّب كلمة أخرى، أو أرسل استفسارك." }));
    const shown = q || faqAll ? list : list.slice(0, FAQ_LIMIT);
    shown.forEach((f) => box.append(faqNode(f, !!q && list.length <= 2)));
    const more = $("#faqMore"); more.hidden = shown.length >= list.length;
    more.textContent = "عرض كل الأسئلة (" + list.length + ")"; more.onclick = () => { faqAll = true; renderFaq(); };
    BSH.emit("faqcat", faqCat);
  }
  $("#faqQ").addEventListener("input", renderFaq);
  function openFaq(id) {
    faqCat = ""; faqAll = true; $("#faqQ").value = ""; renderFaqCats(); renderFaq();
    const d = document.getElementById("faq-" + id); if (!d) return;
    d.open = true; d.classList.add("hl"); setTimeout(() => d.classList.remove("hl"), 2500);
    d.scrollIntoView({ behavior: "instant", block: "center" });
  }

  // اقتراح إجابات أثناء اختيار نوع الاستفسار
  const TYPE_HINTS = {
    "نسيان كلمة المرور": ["كلمة المرور", /كلم(ه|ة) المرور|استعاد/],
    "تعذر الدخول إلى منصة مدرستي": ["المنصات", /مدرستي|دخول|بريد/],
    "مشكلة في حساب Microsoft": ["تيمز", /تيمز|microsoft|مايكروسوفت|بريد/i],
    "تعذر الدخول إلى تيمز أو حضور الحصة": ["تيمز", /تيمز|حص/],
  };
  $("#f-type").addEventListener("change", () => {
    const box = $("#typeHelp"), h = TYPE_HINTS[$("#f-type").value]; box.textContent = "";
    const hits = h ? faqs.filter((f) => f.cat === h[0] || h[1].test(f.q)).slice(0, 3) : [];
    box.hidden = !hits.length; if (!hits.length) return;
    box.append(el("b", { text: "قد تجد الحل هنا قبل الإرسال:" }), ...hits.map((f) => el("details", {}, el("summary", { text: f.q }), el("p", { text: f.a }), f.link ? el("a", { href: f.link, target: "_blank", rel: "noopener", text: "فتح الرابط ←" }) : null)));
  });

  // =====================================================================
  // جدولي واختباراتي
  // =====================================================================
  const PALETTE = ["#2D7BEA", "#7051F0", "#E5533F", "#00A774", "#D68A00", "#009AA6", "#C2418A", "#5B6B7F", "#3F8F2F", "#B35C1E"];
  const subjColor = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
  let sched = null;
  function setMy(grade, section, source) {
    if (!grade || !SECTIONS.includes(section)) return;
    my = { grade, section };
    $("#msGrade").value = grade; $("#msSection").value = section;
    if ($("#msRemember").checked) ls.set("bsh_my", my);
    loadSchedule(); renderNews();
    if (source === "lookup") $("#toSchedule").hidden = false;
    BSH.emit("my", my);
  }
  $("#msGrade").addEventListener("change", () => { if ($("#msSection").value) setMy($("#msGrade").value, $("#msSection").value); });
  $("#msSection").addEventListener("change", () => { if ($("#msGrade").value) setMy($("#msGrade").value, $("#msSection").value); else $("#msGrade").focus(); });
  $("#msRemember").addEventListener("change", () => { const on = $("#msRemember").checked; ls.set("bsh_my_remember", on); if (on && my) ls.set("bsh_my", my); if (!on) ls.del("bsh_my"); });
  $("#toSchedule").addEventListener("click", () => document.getElementById("myschedule").scrollIntoView({ behavior: "smooth" }));
  BSH.setMy = (g, s2, src) => setMy(g, s2, src); BSH.getMy = () => my; BSH.getSched = () => sched;
  BSH.on("lookup", (off) => { if (off && off.grade && off.section) setMy(off.grade, off.section, "lookup"); });

  // اليوم الدراسي المعروض: اليوم (الأحد–الخميس)، أو الأحد القادم في نهاية الأسبوع
  function shownDay() { const n = nowParts(); return n.dow >= 0 && n.dow <= 4 ? { d: n.dow, isToday: true, min: n.min } : { d: 0, isToday: false, min: -1 }; }
  function periodState(i, min) {
    const ps = sched.periods; if (min < 0 || !ps[i]) return "";
    const st = toMin(ps[i].start), en = ps[i].end ? toMin(ps[i].end) : ps[i + 1] ? toMin(ps[i + 1].start) : st + 45;
    return min >= en ? "past" : min >= st ? "now" : "";
  }
  function renderToday() {
    const box = $("#msToday"); box.textContent = "";
    const sd = shownDay();
    $("#msDay").textContent = (sd.isToday ? "" : "جدول ") + DAYS[sd.d] + " · الشعبة " + my.section + (sched.timing ? " · " + sched.timing.label : "");
    if (!sched.grid) { box.append(el("p", { class: "ms-empty", text: "لم يُرفع جدول هذه الشعبة بعد." })); $("#msWeekBtn").hidden = true; return; }
    $("#msWeekBtn").hidden = false;
    const row = sched.grid[sd.d] || [];
    sched.periods.forEach((p, i) => {
      const st = sd.isToday ? periodState(i, sd.min) : "";
      box.append(el("div", { class: "per " + st + (row[i] ? "" : " empty"), ...(st === "now" ? { "aria-current": "true" } : {}) },
        el("small", { text: "الحصة " + (i + 1) }), el("b", { text: row[i] || "—" }), el("small", { text: p.start || "" })));
    });
  }
  function renderExams() {
    const box = $("#msExams"); box.textContent = "";
    const ex = sched.exams || [];
    $("#msExCount").textContent = ex.length ? ex.length + " خلال الشهرين القادمين" : "";

    if (!ex.length) { box.append(el("p", { class: "ms-empty", text: "لا توجد اختبارات قادمة لصفك أو شعبتك. 🎉" })); return; }
    ex.slice(0, 6).forEach((e) => {
      const n = dayDiff(e.date), c = n <= 3 ? "#E5533F" : n <= 10 ? "#D68A00" : "#2D7BEA";
      box.append(el("div", { class: "exr", style: "--c:" + c },
        el("span", { class: "ei" }, svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>')),
        el("div", { class: "tx" }, el("b", { text: e.subject }), el("small", { text: e.kind + " · " + fmtDay(e.date) + (e.period ? " · الحصة " + e.period : "") + (e.note ? " · " + e.note : "") })),
        el("span", { class: "dd", text: inDays(n) })));
    });
  }
  async function loadSchedule() {
    if (!my) return;
    $("#msSub").textContent = my.grade + " · الشعبة " + my.section;
    try {
      sched = await getJSON("/api/schedule?section=" + encodeURIComponent(my.section) + "&grade=" + encodeURIComponent(my.grade));
      renderToday(); renderExams(); BSH.emit("sched", { sched, my });
    } catch (e) { $("#msToday").textContent = ""; $("#msToday").append(el("p", { class: "ms-empty", text: "تعذر تحميل الجدول الآن." })); }
  }
  setInterval(() => { if (sched && !document.hidden) renderToday(); }, 60000);
  if (my) { $("#msGrade").value = my.grade; $("#msSection").value = my.section; loadSchedule(); }

  // الجدول الأسبوعي
  const ttDlg = $("#ttDlg");
  $("#msWeekBtn").addEventListener("click", () => {
    const box = $("#ttFull"); box.textContent = "";
    const sd = shownDay(), t = el("table");
    t.append(el("tr", {}, el("th"), ...sched.periods.map((p, i) => el("th", {}, "الحصة " + (i + 1), el("small", { text: p.start || "" })))));
    DAYS.forEach((d, di) => t.append(el("tr", {}, el("td", { class: "d" + (sd.isToday && sd.d === di ? " today" : ""), text: d }),
      ...sched.periods.map((_, pi) => { const v = (sched.grid[di] || [])[pi]; const now = sd.isToday && sd.d === di && periodState(pi, sd.min) === "now";
        return el("td", {}, el("span", { class: "sj" + (v ? "" : " e") + (now ? " now" : ""), style: v ? "--c:" + subjColor(v) : null, text: v || "—" })); }))));
    box.append(t);
    $("#ttDlgSub").textContent = my.grade + " · الشعبة " + my.section;
    if (typeof ttDlg.showModal === "function") ttDlg.showModal(); else ttDlg.setAttribute("open", "");
  });
  $("#ttDlgClose").addEventListener("click", () => ttDlg.close ? ttDlg.close() : ttDlg.removeAttribute("open"));
  ttDlg.addEventListener("click", (e) => { if (e.target === ttDlg) ttDlg.close(); });
  $("#ttSaveImg").addEventListener("click", async () => {
    const btn = $("#ttSaveImg"); BSH.busy(btn, true, "…");
    try {
      if (!window.html2canvas) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
      const node = $("#ttFull");
      const canvas = await window.html2canvas(node, { backgroundColor: getComputedStyle(node).backgroundColor, scale: 2 });
      const a = el("a", { href: canvas.toDataURL("image/png"), download: "جدول-الشعبة-" + my.section + ".png" }); document.body.append(a); a.click(); a.remove();
    } catch { window.print(); } finally { BSH.busy(btn, false); }
  });

  // =====================================================================
  // البحث في الدليل
  // =====================================================================
  const SECTIONS_IDX = [
    ["بياناتي", "mydata", "بريد المنصة رقم الهوية بياناتي ايميل"],
    ["جدولي واختباراتي", "myschedule", "جدول حصص اختبار اختبارات مواعيد شعبة"],
    ["المنصات التعليمية", "platforms", "منصات روابط"],
    ["الأسئلة الشائعة والمكتبة", "faq", "اسئله شائعه مساعده مكتبه ملفات ادله فيديو مقاطع قياس قبول موهبه تطوع اولمبياد"],
    ["صوتك يصل: استفسار جديد", "ticket", "استفسار شكوى ملاحظه دعم مشكله طلب"],
    ["متابعة الاستفسار", "ticket", "متابعه رقم الطلب رد", "track"],
    ["الإعلانات والتعاميم", "news", "اعلانات تعاميم اخبار"],
    ["الفعاليات والمواعيد", "events", "فعاليات مسابقات تسجيل مواعيد انشطه"],
    ["لوحة الشرف", "honor", "شرف متميزين متفوقين تكريم"],
    ["صوتك في القرار: الاستطلاعات والمبادرات", "pollCol", "استطلاع تصويت مبادره اقتراح فكره"],
  ];
  let index = [];
  function buildIndex() {
    index = [];
    SECTIONS_IDX.forEach(([t, id, kw, tab]) => index.push({ k: "sec", kl: "قسم", t, s: norm(t + " " + kw), go: () => { if (tab) BSH.openTab(tab); jump(id); } }));
    document.querySelectorAll("#platforms .pf-btn, #madrasatiDlg a.tile").forEach((a) => {
      const t = (a.querySelector("b")?.textContent || a.textContent).trim(), sub = a.querySelector("small")?.textContent || "";
      if (!t) return;
      index.push({ k: "pf", kl: "منصة", t: t + (sub ? " — " + sub : ""), s: norm(t + " " + sub + " " + (a.href || "")), go: () => (a.tagName === "A" ? window.open(a.href, "_blank", "noopener") : a.click()) });
    });
    faqs.forEach((f) => index.push({ k: "faq", kl: "سؤال", t: f.q, s: norm(f.q + " " + f.a), go: () => openFaq(f.id) }));
    (BSH.searchExtra || []).forEach((x) => index.push(x));
    visibleAnns().forEach((a) => index.push({ k: "news", kl: "إعلان", t: a.title, s: norm(a.title + " " + (a.body || "")), go: () => { const c = document.getElementById("ann-" + a.id); c && c.scrollIntoView({ behavior: "smooth", block: "center" }); } }));
  }
  function jump(id) { const t = document.getElementById(id); if (!t || t.hidden) return; t.scrollIntoView({ behavior: "instant", block: "start" }); t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash"); }
  BSH.jump = jump; BSH.rebuildIndex = () => buildIndex();
  const q = $("#q"), res = $("#searchRes");
  let hits = [], sel = -1;
  function mark(text, words) {
    const span = el("span", { class: "t" });
    if (!words.length) { span.textContent = text; return span; }
    // تمييز أول كلمة مطابقة فقط بطريقة آمنة (بدون HTML)
    const nt = norm(text); let at = -1, len = 0;
    for (const w of words) { const i = nt.indexOf(w); if (i > -1) { at = i; len = w.length; break; } }
    if (at < 0) { span.textContent = text; return span; }
    span.append(text.slice(0, at), el("mark", { text: text.slice(at, at + len) }), text.slice(at + len));
    return span;
  }
  function search() {
    const raw = q.value.trim(); const words = norm(raw).split(/\s+/).filter(Boolean);
    res.textContent = ""; sel = -1;
    if (!words.length) {
      // اقتراحات فورية عند الضغط على خانة البحث قبل الكتابة
      if (!index.length) buildIndex();
      hits = index.filter((x) => x.k === "sec" || x.quick).slice(0, 9);
      res.append(el("div", { class: "hs-cap", text: "انتقل مباشرة إلى" }));
      const wrap = el("div", { class: "hs-quick" });
      hits.forEach((h, i) => { const b = el("button", { class: "hs-chip", type: "button", id: "hs-" + i }, h.t); b.onmousedown = (e) => e.preventDefault(); b.onclick = () => choose(i); wrap.append(b); });
      res.append(wrap); res.hidden = false; q.setAttribute("aria-expanded", "true"); return;
    }
    if (!index.length) buildIndex();
    hits = index.map((x) => ({ x, sc: words.every((w) => x.s.includes(w)) ? (norm(x.t).includes(words[0]) ? 2 : 1) : 0 })).filter((h) => h.sc).sort((a, b) => b.sc - a.sc).slice(0, 8).map((h) => h.x);
    if (!hits.length) res.append(el("div", { class: "hs-empty" }, "لا نتائج. ", el("a", { href: "#ticket", text: "أرسل استفسارك" })));
    hits.forEach((h, i) => { const b = el("button", { class: "hs-item", type: "button", role: "option", "aria-selected": "false", id: "hs-" + i }, el("span", { class: "k " + h.k, text: h.kl }), mark(h.t, words)); b.onmousedown = (e) => e.preventDefault(); b.onclick = () => choose(i); res.append(b); });
    res.hidden = false; q.setAttribute("aria-expanded", "true");
  }
  function choose(i) { const h = hits[i]; if (!h) return; res.hidden = true; q.setAttribute("aria-expanded", "false"); q.blur(); h.go(); }
  q.addEventListener("input", search);
  q.addEventListener("focus", search);
  q.addEventListener("click", () => { if (res.hidden) search(); });
  q.addEventListener("blur", () => setTimeout(() => { res.hidden = true; q.setAttribute("aria-expanded", "false"); }, 120));
  q.addEventListener("keydown", (e) => {
    const items = [...res.querySelectorAll(".hs-item, .hs-chip")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!items.length) return; sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; items.forEach((b, i) => b.setAttribute("aria-selected", String(i === sel))); q.setAttribute("aria-activedescendant", "hs-" + sel); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel < 0 ? 0 : sel); }
    else if (e.key === "Escape") { res.hidden = true; }
  });
  $("#searchForm").addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });

  // =====================================================================
  // التقييم بعد حل الاستفسار + تنبيه الرد الجديد
  // =====================================================================
  const TAGS = ["رد سريع", "حل المشكلة", "واضح", "يحتاج تحسين"];
  const seen = () => ls.get("bsh_seen", {});
  const lastAdmin = (c) => ((c.messages || []).filter((m) => m.from === "admin").pop() || {}).at || null;
  BSH.on("track", (c) => {
    const s = seen(); const la = lastAdmin(c); if (la) { s[c.ticket] = la; ls.set("bsh_seen", s); }
    if (alertTicket === c.ticket) hideAlert();
    const box = $("#rateBox"); box.textContent = "";
    if (c.rating) { box.hidden = false; box.append(el("p", { class: "done" }, el("span", { class: "stars-show", text: "★".repeat(c.rating.stars) + "☆".repeat(5 - c.rating.stars) }), "شكرًا لتقييمك! يساعدنا على تحسين الخدمة.")); return; }
    if (!c.canRate) { box.hidden = true; return; }
    box.hidden = false;
    let stars = 0; const picked = new Set();
    const sw = el("div", { class: "stars-in", role: "radiogroup", "aria-label": "عدد النجوم" });
    const btns = [1, 2, 3, 4, 5].map((n) => { const b = el("button", { type: "button", role: "radio", "aria-checked": "false", "aria-label": n + " من 5", text: "★" }); b.onclick = () => { stars = n; btns.forEach((x, i) => { x.classList.toggle("on", i < n); x.setAttribute("aria-checked", String(i === n - 1)); }); }; sw.append(b); return b; });
    const tg = el("div", { class: "rate-tags" }, ...TAGS.map((t) => { const b = el("button", { type: "button", "aria-pressed": "false", text: t }); b.onclick = () => { picked.has(t) ? picked.delete(t) : picked.add(t); b.setAttribute("aria-pressed", String(picked.has(t))); }; return b; }));
    const note = el("input", { type: "text", maxlength: "300", placeholder: "ملاحظة إضافية (اختياري)", "aria-label": "ملاحظة إضافية" });
    const err = el("p", { class: "err", role: "alert" });
    const send = el("button", { class: "btn", type: "button", text: "إرسال التقييم" });
    send.onclick = async () => {
      err.textContent = ""; if (!stars) { err.textContent = "اختر عدد النجوم أولًا."; return; }
      BSH.busy(send, true, "جارٍ الإرسال…");
      try { await BSH.track({ action: "rate", stars, tags: [...picked], note: note.value }); BSH.toast("شكرًا لتقييمك!"); }
      catch (ex) { err.textContent = ex.message; BSH.busy(send, false); }
    };
    box.append(el("h4", { text: "كيف كانت الخدمة؟" }), el("p", { class: "sub", text: "تقييمك يساعدنا على التحسين، ولا يظهر اسمك." }), sw, tg, note, err, send);
  });

  let alertTicket = null;
  function hideAlert() { $("#replyAlert").hidden = true; alertTicket = null; }
  $("#raClose").addEventListener("click", () => { const s = seen(); if (alertTicket && alertAt) { s[alertTicket] = alertAt; ls.set("bsh_seen", s); } hideAlert(); });
  let alertAt = null;
  $("#raOpen").addEventListener("click", () => {
    const t = alertTicket; BSH.openTab("track");
    document.getElementById("ticket").scrollIntoView({ behavior: "smooth" });
    if ($("#trackForm").hidden) $("#trOther").click();
    $("#t-ticket").value = t; setTimeout(() => $("#t-id").focus({ preventScroll: true }), 400);
    BSH.toast("اكتب رقم هويتك لعرض الرد.");
  });
  (async () => {
    const saved = BSH.getSaved(); if (!saved.length) return;
    try {
      const r = await fetch("/api/peek", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tickets: saved }) });
      const d = await r.json(); const s = seen();
      const fresh = (d.items || []).filter((x) => x.lastReplyAt && (!s[x.ticket] || s[x.ticket] < x.lastReplyAt)).sort((a, b) => (a.lastReplyAt < b.lastReplyAt ? 1 : -1))[0];
      if (!fresh || BSH.isTracking()) return;
      alertTicket = fresh.ticket; alertAt = fresh.lastReplyAt;
      const m = (Date.now() - Date.parse(fresh.lastReplyAt)) / 6e4;
      $("#raTicket").textContent = fresh.ticket;
      $("#raWhen").textContent = " · وصل " + (m < 60 ? "قبل " + Math.max(1, Math.round(m)) + " دقيقة" : m < 1440 ? "قبل " + Math.round(m / 60) + " ساعة" : "قبل " + Math.round(m / 1440) + " يوم");
      $("#replyAlert").hidden = false;
    } catch {}
  })();

  // =====================================================================
  // التثبيت كتطبيق (PWA)
  // =====================================================================
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; if (!standalone) $("#installBtn").hidden = false; });
  if (isIOS && !standalone) $("#installBtn").hidden = false;
  $("#installBtn").addEventListener("click", async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r && r.outcome === "accepted") $("#installBtn").hidden = true; return; }
    const d = $("#iosDlg"); if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  });
  window.addEventListener("appinstalled", () => { $("#installBtn").hidden = true; BSH.toast("تم تثبيت دليل الطالب على جهازك."); });
  $("#iosClose").addEventListener("click", () => $("#iosDlg").close());
  $("#iosDlg").addEventListener("click", (e) => { if (e.target.id === "iosDlg") $("#iosDlg").close(); });
})();
