// تنظيم الواجهة الرئيسية: يومي، التنقل، المواسم، الحركة، «رتّب واجهتك»، وضع ولي الأمر، بطاقات المشاركة
(() => {
  "use strict";
  const BSH = window.BSH;
  if (!BSH) return;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c));
    return e;
  }
  const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = d; return s; };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TZ = "Asia/Riyadh";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const nowMin = () => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { min: (+p.hour % 24) * 60 + +p.minute, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), h: +p.hour % 24 }; };
  const toMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return h * 60 + (m || 0); };
  const dayDiff = (iso) => Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
  const t12 = (t) => { if (!t) return ""; let [h, m] = t.split(":").map(Number); const s = h < 12 ? "ص" : "م"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + " " + s; };
  const hijriParts = (d = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { timeZone: TZ, day: "numeric", month: "numeric" }).formatToParts(d).map((x) => [x.type, x.value])); return { m: +p.month, d: +p.day }; };
  const jump = (id) => { const n = document.getElementById(id); if (!n || n.hidden) return; n.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); };
  const ICON = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>',
    exam: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14l2 2 4-4"/>', bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0"/>',
    news: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2zM17 8h3v10a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>', seat: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    star: '<path d="M12 2l2.6 6.3 6.8.6-5.2 4.5 1.6 6.6L12 16.6 6.2 20l1.6-6.6L2.6 8.9l6.8-.6z"/>', pin: '<path d="M12 17v5M5 17h14l-2-4V5H7v8z"/>',
    home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.4-2.5 2.4M12 17h.01"/>', chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>', share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5"/>', chev: '<path d="m6 9 6 6 6-6"/>',
  };

  // =====================================================================
  // 1) شريط الوقت مضغوط على الجوال (يتوسع باللمس)
  // =====================================================================
  const clock = $("#clock");
  if (clock) {
    const tg = el("button", { class: "cb-tg", type: "button", "aria-label": "عرض التقويم كاملًا", "aria-expanded": "false" }, svg(ICON.chev));
    tg.onclick = () => { const o = clock.classList.toggle("open"); tg.setAttribute("aria-expanded", String(o)); };
    clock.append(tg);
  }

  // =====================================================================
  // 2) المواسم: لون الواجهة وشارة تتغير تلقائيًا مع التقويم
  // =====================================================================
  function season(content) {
    const t = today(), [y, gm, gd] = t.split("-").map(Number), h = hijriParts();
    let s = null;
    const fin = content && content.finals;
    if (fin && fin.from && dayDiff(fin.from) <= 7 && dayDiff(fin.to) >= 0) s = ["exams", "📝", "موسم الاختبارات — بالتوفيق"];
    else if (h.m === 9) s = ["ramadan", "🌙", "رمضان كريم"];
    else if ((h.m === 10 && h.d <= 4) || (h.m === 12 && h.d >= 9 && h.d <= 13)) s = ["eid", "✨", "عيدكم مبارك"];
    else if (gm === 9 && gd >= 20 && gd <= 24) s = ["national", "💚", "اليوم الوطني السعودي"];
    else if (gm === 2 && gd >= 20 && gd <= 23) s = ["founding", "🏛️", "يوم التأسيس"];
    else {
      const terms = (content && content.calendar && content.calendar.terms) || [];
      const st = terms.find((x) => x.start && dayDiff(x.start) <= 0 && dayDiff(x.start) >= -6);
      if (st) s = ["", "🎒", "بداية موفقة لـ" + (st.name || "الفصل الدراسي")];
    }
    const chip = $("#seasonChip");
    if (s && s[0]) document.documentElement.dataset.season = s[0]; else delete document.documentElement.dataset.season;
    if (chip) { chip.hidden = !s; if (s) { chip.textContent = ""; chip.append(el("i", { "aria-hidden": "true", text: s[1] }), s[2]); } }
  }

  // =====================================================================
  // 3) يومي: ملخص شخصي لما يهم الطالب الآن
  // =====================================================================
  const T = { sched: null, my: null, look: null, news: [], content: BSH.content || null };
  function tile(c, icon, small, big, sub, go, hot) {
    const b = el("button", { type: "button", class: "td" + (hot ? " hot" : ""), style: "--c:" + c }, el("span", { class: "ti" }, svg(icon)), el("div", {}, el("small", { text: small }), el("b", { text: big }), sub ? el("span", { text: sub }) : null));
    b.onclick = go; return b;
  }
  function classNow() {
    const s = T.sched; if (!s || !s.grid || !s.periods || !s.periods.length) return null;
    const n = nowMin(), weekday = n.dow >= 0 && n.dow <= 4;
    const ps = s.periods.map((p, i) => ({ i, st: toMin(p.start), en: p.end ? toMin(p.end) : s.periods[i + 1] ? toMin(s.periods[i + 1].start) : toMin(p.start) + 45, start: p.start }));
    if (weekday) {
      const row = s.grid[n.dow] || [];
      const cur = ps.find((p) => n.min >= p.st && n.min < p.en && row[p.i]);
      if (cur) return { label: "الآن · الحصة " + (cur.i + 1), subj: row[cur.i], sub: "تنتهي " + t12(String(Math.floor(cur.en / 60)).padStart(2, "0") + ":" + String(cur.en % 60).padStart(2, "0")), hot: true };
      const nx = ps.find((p) => p.st > n.min && row[p.i]);
      if (nx) return { label: "الحصة التالية · " + (nx.i + 1), subj: row[nx.i], sub: nx.start ? "تبدأ " + t12(nx.start) : "" };
    }
    // بعد انتهاء اليوم: أول حصة في اليوم الدراسي القادم
    const nd = n.dow >= 0 && n.dow < 4 ? n.dow + 1 : 0;
    const row = s.grid[nd] || []; const fi = ps.find((p) => row[p.i]);
    if (!fi) return null;
    return { label: (nd === n.dow + 1 ? "غدًا" : "الأحد") + " · أول حصة", subj: row[fi.i], sub: fi.start ? t12(fi.start) : "" };
  }
  function renderToday() {
    const box = $("#todayGrid"), sec = $("#today"); if (!box) return;
    box.textContent = "";
    const n = nowMin();
    const first = T.look && T.look.name ? T.look.name.split(" ")[0] : "";
    $("#today-title").textContent = (n.h < 12 ? "صباح الخير" : "مساء الخير") + (first ? " يا " + first : "") + " 👋";
    $("#todayDate").textContent = new Date().toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
    const tiles = [];
    const calls = (T.look && T.look.calls || []).filter((c) => !c.seen);
    if (calls.length) tiles.push(tile("#E5533F", ICON.bell, "استدعاء", calls[0].text, calls[0].place || "من " + calls[0].from, () => jump("mydata"), true));
    const cn = classNow();
    if (cn) tiles.push(tile("var(--s-sched)", ICON.clock, cn.label, cn.subj, cn.sub, () => jump("myschedule"), cn.hot));
    // أقرب اختبار: النهائي أولًا ثم اختبارات الشعبة
    const fin = T.look && T.look.finals;
    const fx = fin && (fin.exams || []).find((x) => dayDiff(x.date) >= 0);
    const sx = T.sched && (T.sched.exams || []).find((x) => dayDiff(x.date) >= 0);
    const ex = fx && (!sx || fx.date <= sx.date) ? { subject: fx.subject, date: fx.date, kind: "اختبار نهائي" } : sx ? { subject: sx.subject, date: sx.date, kind: sx.kind || "اختبار" } : null;
    if (ex) { const d = dayDiff(ex.date); tiles.push(tile(d <= 1 ? "#E5533F" : "#D68A00", ICON.exam, ex.kind, ex.subject, d === 0 ? "اليوم" : d === 1 ? "غدًا" : d === 2 ? "بعد يومين" : "بعد " + d + " أيام", () => jump(fx && ex.kind === "اختبار نهائي" ? "mydata" : "myschedule"), d <= 1)); }
    if (fin && fin.seat) tiles.push(tile("#10A36F", ICON.seat, "رقم الجلوس · لجنة " + (fin.committee || "—"), fin.seat, [fin.floor, fin.room].filter(Boolean).join(" · "), () => jump("mydata")));
    if (T.news.length) tiles.push(tile("var(--s-news)", ICON.news, "الإعلانات", T.news.length === 1 ? T.news[0].title : T.news.length + " إعلانات لك", T.news.length === 1 ? "" : T.news[0].title, () => jump("news")));
    const ev = T.content && (T.content.events || []).find((e) => dayDiff(e.deadline && dayDiff(e.deadline) >= 0 ? e.deadline : e.date) >= 0);
    if (ev && tiles.length < 4) { const dd = ev.deadline && dayDiff(ev.deadline) >= 0 ? ev.deadline : ev.date; const d = dayDiff(dd); tiles.push(tile("var(--s-events)", ICON.star, ev.deadline && dd === ev.deadline ? "آخر موعد" : ev.kind || "فعالية", ev.title, d === 0 ? "اليوم" : d === 1 ? "غدًا" : "بعد " + d + " يومًا", () => jump("events"))); }
    if (!T.my) {
      const cta = tile("var(--s-today)", ICON.pin, "اجعلها صفحتك", "اكتب رقم هويتك في «بياناتي»", "ويظهر جدولك واختباراتك تلقائيًا", () => toData());
      cta.classList.add("td-cta"); tiles.push(cta);
    }
    tiles.slice(0, 5).forEach((t) => box.append(t));
    sec.hidden = !tiles.length;
  }
  BSH.on("sched", (x) => { T.sched = x.sched; T.my = x.my; renderToday(); });
  BSH.on("my", (m) => { T.my = m; renderToday(); });
  BSH.on("lookup", (d) => { T.look = { name: d.name, calls: d.calls, finals: d.finals }; renderToday(); });
  BSH.on("news", (list) => { T.news = list || []; renderToday(); });
  BSH.on("content", (d) => { T.content = d; season(d); renderToday(); });
  $("#hideData") && $("#hideData").addEventListener("click", () => { T.look = null; renderToday(); });
  T.my = BSH.getMy ? BSH.getMy() : null;
  if (T.content) season(T.content); else season(null);
  renderToday();
  setInterval(() => { if (!document.hidden) renderToday(); }, 60000);

  // =====================================================================
  // 4) التنقل: شريط علوي ثابت (حاسوب) وشريط سفلي (جوال) مع تتبع القسم الحالي
  // =====================================================================
  const NAV = [
    ["today", "يومي", ICON.home, "var(--s-today)"], ["news", "الإعلانات", ICON.news, "var(--s-news)"], ["myschedule", "جدولي", ICON.cal, "var(--s-sched)"],
    ["events", "الفعاليات", ICON.star, "var(--s-events)"], ["platforms", "المنصات", ICON.grid, "var(--s-pf)"], ["faq", "الأسئلة", ICON.help, "var(--s-faq)"], ["ticket", "صوتك يصل", ICON.chat, "var(--s-ticket)"]];
  const BOT = ["top", "myschedule", "platforms", "faq", "ticket"];
  const top = el("nav", { class: "topnav", "aria-label": "أقسام الصفحة" });
  const tw = el("div", { class: "wrap" }, el("a", { class: "tn-brand", href: "#", text: "دليل الطالب الرقمي" }));
  const srch = el("button", { class: "tn-s", type: "button" }, svg(ICON.search), "ابحث");
  srch.onclick = () => { scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); setTimeout(() => { const i = document.querySelector("#searchForm input"); i && i.focus({ preventScroll: true }); }, 350); };
  NAV.forEach(([id, t, , c]) => { const a = el("a", { class: "tn", href: "#" + id, "data-sec": id, style: "--c:" + c, text: t }); a.onclick = (e) => { e.preventDefault(); jump(id); }; tw.append(a); });
  tw.append(srch); top.append(tw);
  tw.firstChild.onclick = (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); };
  const bot = el("nav", { class: "botnav", "aria-label": "التنقل السريع" });
  BOT.forEach((id) => {
    const n = id === "top" ? ["top", "الرئيسية", ICON.home, "var(--s-today)"] : NAV.find((x) => x[0] === id);
    const a = el("a", { href: id === "top" ? "#" : "#" + id, "data-sec": id, style: "--c:" + n[3] }, svg(n[2]), el("span", { text: n[1] }));
    a.onclick = (e) => { e.preventDefault(); if (id === "top") scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); else jump(id); };
    bot.append(a);
  });
  document.body.append(top, bot);
  const hero = document.querySelector(".hero");
  // إظهار الشريط العلوي بعد تجاوز الواجهة
  new IntersectionObserver(([e]) => { top.classList.toggle("show", !e.isIntersecting); }, { rootMargin: "-80px 0px 0px 0px" }).observe(hero);
  // القسم الظاهر الآن
  let cur = "";
  const setCur = (id) => {
    if (id === cur) return; cur = id;
    top.querySelectorAll("a.tn").forEach((a) => a.setAttribute("aria-current", a.dataset.sec === id ? "true" : "false"));
    const b = BOT.includes(id) ? id : id === "" || id === "today" || id === "news" ? "top" : id === "events" ? "myschedule" : "";
    bot.querySelectorAll("a").forEach((a) => a.setAttribute("aria-current", a.dataset.sec === b ? "true" : "false"));
  };
  const spy = () => {
    const y = innerHeight * 0.35; let best = "";
    if (hero.getBoundingClientRect().bottom > y) { setCur(""); return; }
    for (const [id] of NAV) { const n = document.getElementById(id); if (!n || n.hidden) continue; const r = n.getBoundingClientRect(); if (r.top <= y) best = id; }
    setCur(best);
  };
  let raf = 0; addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; spy(); }); }, { passive: true });
  spy();
  // إخفاء روابط الأقسام المخفية
  const syncNav = () => NAV.forEach(([id]) => { const n = document.getElementById(id); const a = top.querySelector(`a[data-sec="${id}"]`); if (a) a.hidden = !n || n.hidden; });
  new MutationObserver(syncNav).observe(document.querySelector("main"), { attributes: true, subtree: true, attributeFilter: ["hidden"] });
  syncNav();

  // =====================================================================
  // 5) أقسام مختصرة على الجوال مع «عرض الكل»
  // =====================================================================
  function clip(container, keep, label) {
    if (!container) return;
    const items = [...container.children];
    if (items.length <= keep) return;
    const mq = matchMedia("(max-width:760px)");
    const btn = el("button", { class: "more-btn", type: "button", "aria-expanded": "false" }, el("span", { text: label + " (" + items.length + ")" }), svg(ICON.chev));
    const wrap = el("div", { class: "more-wrap" }, btn);
    container.after(wrap); container.setAttribute("data-clip", "");
    let open = false;
    const apply = () => { const on = mq.matches && !open; items.forEach((x, i) => x.classList.toggle("clipped", on && i >= keep)); wrap.hidden = !mq.matches; btn.setAttribute("aria-expanded", String(open)); btn.firstChild.textContent = open ? "عرض أقل" : label + " (" + items.length + ")"; };
    btn.onclick = () => { open = !open; apply(); if (!open) container.scrollIntoView({ block: "nearest" }); };
    mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
    apply();
  }
  clip(document.querySelector("#platforms .pf-grid"), 2, "عرض كل المنصات");

  // =====================================================================
  // 6) الحركة: ظهور تدريجي للأقسام، وهياكل مؤقتة أثناء التحميل، وحالات فارغة واضحة
  // =====================================================================
  if (!reduced && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    $$("main > section, main > nav.apps").forEach((s) => { if (s.getBoundingClientRect().top > innerHeight) { s.classList.add("rv"); io.observe(s); } });
  }
  // =====================================================================
  // 6-ب) جدولي: يظهر تلقائيًا بعد إدخال رقم الهوية في «بياناتي» (ويُحفظ الصف والشعبة على الجهاز)
  // =====================================================================
  const msIdForm = $("#msIdForm"), msPick = $("#msPick"), msGrid = $("#msGrid");
  function syncMs() {
    const my = BSH.getMy ? BSH.getMy() : null;
    if (!msIdForm) return;
    msIdForm.hidden = !!my; msPick.hidden = true; msGrid.hidden = !my;
    if (!my) $("#msSub").textContent = "جدولك اليومي واختباراتك القادمة في مكان واحد";
  }
  const toData = () => { $("#mydata").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); setTimeout(() => $("#lookupId") && $("#lookupId").focus({ preventScroll: true }), 450); };
  $("#msToData") && $("#msToData").addEventListener("click", toData);
  BSH.on("my", syncMs);
  // أُدخلت الهوية لكن الشعبة غير مسجلة في ملف الطلاب: نوضح السبب بدل تكرار طلب الهوية
  BSH.on("lookup", (d) => {
    if (BSH.getMy && BSH.getMy()) return;
    if (d && d.id && (!d.grade || !d.section)) {
      msIdForm.querySelector(".ms-id-tx b").textContent = "لم نجد " + (d.grade ? "شعبتك" : "صفك وشعبتك") + " في ملف الطلاب";
      msIdForm.querySelector(".ms-id-tx small").textContent = "بياناتك ظهرت، لكن " + (d.grade ? "رقم الشعبة" : "الصف والشعبة") + " غير مسجل في ملف المدرسة. أرسل طلبًا من «صوتك يصل» لتصحيحه.";
      $("#msToData").hidden = true;
    }
  });
  // الجدول محفوظ دائمًا بعد إدخال الهوية
  try { localStorage.setItem("bsh_my_remember", "true"); } catch {}
  if ($("#msRemember")) $("#msRemember").checked = true;
  syncMs();
  // أيقونة «جدولي» تنقل إلى «بياناتي» إن لم يكن الجدول معروفًا بعد
  document.querySelectorAll('[data-jump="myschedule"], a[href="#myschedule"], .botnav a[data-sec="myschedule"], .topnav a[data-sec="myschedule"]').forEach((a) => a.addEventListener("click", (e) => { if (!BSH.getMy || !BSH.getMy()) { e.preventDefault(); e.stopImmediatePropagation(); toData(); } }, true));

  const skel = (n = 3) => el("div", { class: "skel", "aria-hidden": "true" }, ...Array.from({ length: n }, () => el("i")));
  if (T.my && $("#msToday") && $("#msToday .ms-empty")) { $("#msToday").textContent = ""; $("#msToday").append(skel(4)); $("#msExams").textContent = ""; $("#msExams").append(skel(2)); }
  if (!T.my && $("#msToday .ms-empty")) {
    const b = el("button", { class: "btn sm", type: "button", text: "اختر صفك وشعبتك" }); b.onclick = () => $("#msGrade").focus();
    $("#msToday .ms-empty").append(b);
  }

  // =====================================================================
  // 7) «رتّب واجهتك»: تثبيت الاختصارات المفضلة أولًا
  // =====================================================================
  const apps = document.querySelector("nav.apps");
  if (apps) {
    const key = (a) => a.dataset.jump || a.dataset.dlg || a.textContent.trim();
    const items = [...apps.querySelectorAll(".app")];
    const order = items.map(key);
    let pins = ls.get("bsh_pins", []).filter((k) => order.includes(k));
    const arrange = () => {
      const sorted = [...items].sort((a, b) => { const pa = pins.indexOf(key(a)), pb = pins.indexOf(key(b)); return (pa < 0 ? 99 + order.indexOf(key(a)) : pa) - (pb < 0 ? 99 + order.indexOf(key(b)) : pb); });
      sorted.forEach((a) => { a.classList.toggle("pinned", pins.includes(key(a))); apps.insertBefore(a, edit); });
    };
    const edit = el("button", { type: "button", class: "app app-edit", "aria-pressed": "false" }, el("span", { class: "ai" }, svg('<path d="M4 6h10M4 12h16M4 18h7"/><circle cx="17" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>')), el("span", { class: "at", text: "رتّب" }));
    const hint = el("p", { class: "apps-hint", text: "اضغط على الاختصار لتثبيته في البداية (★)، ثم «تم»." });
    hint.hidden = true;
    apps.append(edit, hint);
    edit.onclick = () => {
      const on = apps.classList.toggle("editing");
      edit.setAttribute("aria-pressed", String(on)); edit.querySelector(".at").textContent = on ? "تم" : "رتّب"; hint.hidden = !on;
      if (!on) BSH.toast(pins.length ? "ثُبّتت اختصاراتك المفضلة في البداية." : "أُعيد الترتيب الافتراضي.");
    };
    apps.addEventListener("click", (e) => {
      if (!apps.classList.contains("editing")) return;
      const a = e.target.closest(".app"); if (!a || a === edit) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const k = key(a); pins = pins.includes(k) ? pins.filter((x) => x !== k) : [...pins, k];
      ls.set("bsh_pins", pins); arrange();
    }, true);
    arrange();
  }

  // =====================================================================
  // 8) وضع ولي الأمر
  // =====================================================================
  ["#pollCol", "#ideasBox", "#focusBtn"].forEach((s) => { const n = $(s); if (n) n.classList.add("student-only"); });
  const TXT = { title: $("#mydata-title") && $("#mydata-title").textContent, ph: $("#lookupId") && $("#lookupId").placeholder };
  function parentMode(on, user) {
    document.documentElement.dataset.mode = on ? "parent" : "student";
    const b = $("#parentBtn"); if (b) { b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "إلغاء وضع ولي الأمر" : "وضع ولي الأمر"); }
    $("#parentBar").hidden = !on;
    if ($("#mydata-title")) $("#mydata-title").textContent = on ? "بيانات ابني" : TXT.title;
    if ($("#lookupId")) $("#lookupId").placeholder = on ? "رقم هوية ابنك (10 أرقام)" : TXT.ph;
    ls.set("bsh_parent", on);
    if (user) BSH.toast(on ? "وضع ولي الأمر: تظهر لك المعلومات التي تهمك." : "عدتَ إلى وضع الطالب.");
  }
  $("#parentBtn") && $("#parentBtn").addEventListener("click", () => parentMode(document.documentElement.dataset.mode !== "parent", true));
  $("#parentGo") && $("#parentGo").addEventListener("click", () => { $("#mydata").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" }); setTimeout(() => $("#lookupId").focus({ preventScroll: true }), 300); });
  if (ls.get("bsh_parent", false) || /[?&]parent\b/.test(location.search)) parentMode(true);

  // =====================================================================
  // 9) مشاركة الإعلان كصورة أنيقة
  // =====================================================================
  const TYPE_C = { urgent: "#E5533F", warn: "#D68A00", info: "#2D7BEA", congrats: "#0B8A63" };
  function wrapText(g, text, maxW) {
    const words = String(text || "").split(/\s+/), lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  async function shareCard(o) {
    const W = 1080, H = 1080, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); try { await document.fonts.ready; } catch {}
    const font = getComputedStyle(document.body).fontFamily;
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#00664A"); grd.addColorStop(.55, "#008C7A"); grd.addColorStop(1, "#1A4F9C");
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.08)"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(W * (i % 2 ? .1 : .9), 140 + i * 170, 90 + i * 12, 0, 7); g.fill(); }
    g.fillStyle = "#fff"; g.beginPath(); g.roundRect(70, 190, W - 140, H - 330, 44); g.fill();
    g.fillStyle = o.color; g.beginPath(); g.roundRect(W - 70 - 14, 230, 14, H - 410, 7); g.fill();
    g.direction = "rtl"; g.textAlign = "right";
    g.fillStyle = "#fff"; g.font = "800 44px " + font; g.fillText("ثانوية بلاط الشهداء الثانوية", W - 90, 110);
    g.font = "500 30px " + font; g.fillStyle = "#CFF3E5"; g.fillText("دليل الطالب الرقمي", W - 90, 156);
    let y = 300;
    g.fillStyle = o.color; g.font = "700 32px " + font; g.fillText(o.kicker, W - 130, y); y += 70;
    g.fillStyle = "#0E1B2C"; g.font = "800 54px " + font;
    wrapText(g, o.title, W - 280).slice(0, 4).forEach((l) => { g.fillText(l, W - 130, y); y += 72; });
    y += 14; g.fillStyle = "#3B4B5F"; g.font = "500 36px " + font;
    wrapText(g, o.body, W - 280).slice(0, 7).forEach((l) => { g.fillText(l, W - 130, y); y += 54; });
    g.fillStyle = "#5B6B7F"; g.font = "600 30px " + font; g.fillText(o.foot || "", W - 130, H - 180);
    g.textAlign = "center"; g.fillStyle = "#fff"; g.font = "600 30px " + font; g.fillText(location.host || "", W / 2, H - 60);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const file = new File([blob], "إعلان.png", { type: "image/png" });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: o.title }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    const a = el("a", { href: URL.createObjectURL(blob), download: "إعلان.png" }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    BSH.toast("حُفظت صورة الإعلان.");
  }
  BSH.shareCard = shareCard;
  BSH.on("news", (list) => {
    (list || []).forEach((a) => {
      const card = document.getElementById("ann-" + a.id); if (!card || card.querySelector(".n-share")) return;
      const b = el("button", { class: "n-share", type: "button", "aria-label": "مشاركة الإعلان كصورة", title: "مشاركة" }, svg(ICON.share));
      b.onclick = (e) => { e.stopPropagation(); shareCard({ kicker: (card.querySelector(".nk") || {}).textContent || "إعلان", title: a.title, body: a.body || "", color: TYPE_C[a.type] || "#2D7BEA", foot: new Date(a.from + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) }); };
      card.append(b);
    });
  });

  // =====================================================================
  // 10) السرعة: الصور خارج الشاشة تُحمَّل عند الحاجة
  // =====================================================================
  $$("main img, dialog img, footer img").forEach((i) => { if (!i.hasAttribute("loading")) i.loading = "lazy"; i.decoding = "async"; });
})();
