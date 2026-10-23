// دليل الطالب: الاستدعاءات، الفعاليات، الاستطلاعات والمبادرات، لوحة الشرف، المكتبة، مساعد حل المشكلات،
// وضع التركيز، خيارات الإتاحة، بوابة الخريج، رحلة المستجد، روابط QR للفصول
(() => {
  "use strict";
  const BSH = window.BSH;
  if (!BSH) return;
  const $ = (s) => document.querySelector(s);
  const TZ = "Asia/Riyadh";
  const GRADES = ["الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"];
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v); }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c));
    return e;
  }
  const svg = (d) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = d; return s; };
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const dayDiff = (iso) => Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
  const inDays = (n) => n < 0 ? "انتهى" : n === 0 ? "اليوم" : n === 1 ? "غدًا" : n === 2 ? "بعد يومين" : n <= 10 ? "بعد " + n + " أيام" : "بعد " + n + " يومًا";
  const dParts = (iso) => { const d = new Date(iso + "T12:00:00Z"); return { day: d.getUTCDate(), mon: d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "short", timeZone: "UTC" }), wd: d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", timeZone: "UTC" }) }; };
  const fmtDay = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); } catch { return iso; } };
  const digits = (v) => String(v || "").replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/\D/g, "");
  async function post(path, body) {
    let r; try { r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); } catch { throw new Error("تعذر الاتصال. تحقق من الإنترنت."); }
    const d = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(d.error || "حدث خطأ غير متوقع."); e.data = d; e.status = r.status; throw e; } return d;
  }
  const openDlg = (d) => { if (!d) return; if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", ""); };
  document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  document.querySelectorAll("dialog.mdlg").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  document.querySelectorAll("[data-dlg]").forEach((b) => b.addEventListener("click", () => openDlg(document.getElementById(b.dataset.dlg))));

  // رقم الهوية يبقى في الذاكرة فقط أثناء فتح الصفحة (لا يُحفظ في الجهاز)
  let myId = null;
  let my = BSH.getMy ? BSH.getMy() : null;
  BSH.on("my", (m) => { my = m; renderEvents(); renderPolls(); highlightApps(); });

  // =====================================================================
  // الاستدعاءات (تظهر داخل «بياناتي» للطالب نفسه فقط)
  // =====================================================================
  function renderCalls(calls) {
    const box = $("#callsBox"); box.textContent = "";
    box.hidden = !calls.length;
    calls.forEach((c) => {
      const ack = el("button", { class: "btn sm", type: "button", text: c.seen ? "✓ تم الاطّلاع" : "اطّلعت" });
      ack.disabled = c.seen;
      ack.onclick = async () => {
        BSH.busy(ack, true, "…");
        try { const d = await post("/api/lookup", { id: myId, action: "ack", callId: c.id }); renderCalls(d.calls || []); BSH.toast("شكرًا، أُبلغت الإدارة بأنك اطّلعت."); }
        catch (e) { BSH.toast(e.message); BSH.busy(ack, false); }
      };
      box.append(el("div", { class: "call" + (c.seen ? " seen" : "") },
        el("span", { class: "call-ic" }, svg('<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0"/>')),
        el("div", { class: "call-tx" }, el("small", { text: "استدعاء من " + c.from }), el("b", { text: c.text }),
          (c.place || c.when) ? el("span", { text: [c.place, c.when].filter(Boolean).join(" · ") }) : null), ack));
    });
  }
  BSH.on("lookup", (d) => { myId = d.id; renderCalls(d.calls || []); renderPolls(); });
  $("#hideData").addEventListener("click", () => { myId = null; $("#callsBox").hidden = true; });

  // =====================================================================
  // المحتوى العام
  // =====================================================================
  let C = { events: [], polls: [], honor: [], videos: [], files: [] };
  function onContent(d) {
    C = d;
    renderEvents(); renderPolls(); renderHonor(); renderLibrary(); renderGrad();
    if (d.guideImage) { const g = $("#guideImg"); if (g) g.src = d.guideImage; }
    BSH.searchExtra = [...(BSH.searchStatic || []),
      ...(d.events || []).map((e) => ({ k: "news", kl: "فعالية", t: e.title, s: norm(e.title + " " + e.kind + " " + (e.note || "")), go: () => BSH.jump("events") })),
      ...(d.files || []).map((f) => ({ k: "faq", kl: "ملف", t: f.title, s: norm(f.title + " " + (f.cat || "")), go: () => window.open(f.url, "_blank", "noopener") })),
      ...(d.videos || []).map((v) => ({ k: "pf", kl: "مقطع", t: v.title, s: norm(v.title + " " + (v.cat || "")), go: () => window.open("https://www.youtube.com/watch?v=" + v.yt, "_blank", "noopener") })),
      { k: "sec", kl: "أداة", t: "بوابة الخريج", s: norm("بوابة الخريج قياس قبول نسبة موزونة الثالث الجامعة"), go: () => openDlg($("#gradDlg")), quick: true },
      { k: "sec", kl: "أداة", t: "رحلة الطالب المستجد", s: norm("رحلة الطالب المستجد الاول الثانوي البداية"), go: () => openDlg($("#journeyDlg")) },
      { k: "sec", kl: "أداة", t: "وضع التركيز للمذاكرة", s: norm("وضع التركيز مذاكره مؤقت بومودورو"), go: () => openFocus() },
    ];
    BSH.rebuildIndex && BSH.rebuildIndex();
  }
  const norm = (s) => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  BSH.on("content", onContent);
  if (BSH.content) onContent(BSH.content);

  // =====================================================================
  // الفعاليات والمواعيد
  // =====================================================================
  const KIND_C = { "تسجيل": "#E5533F", "مسابقة": "#7051F0", "اختبار وطني": "#2D7BEA", "الخريجين": "#2D7BEA", "نشاط مدرسي": "#00A774", "فعالية": "#D68A00" };
  function ics(e) {
    const d = (x) => x.replace(/-/g, "");
    const end = e.end ? new Date(e.end + "T12:00:00Z") : new Date(e.date + "T12:00:00Z"); end.setUTCDate(end.getUTCDate() + 1);
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BSH//Student Guide//AR", "BEGIN:VEVENT", "UID:" + e.id + "@bsh", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;VALUE=DATE:" + d(e.date), "DTEND;VALUE=DATE:" + end.toISOString().slice(0, 10).replace(/-/g, ""), "SUMMARY:" + e.title.replace(/[,;]/g, " "),
      ...(e.link ? ["URL:" + e.link] : []), "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + e.title.replace(/[,;]/g, " "), "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
  }
  function renderEvents() {
    const list = (C.events || []).filter((e) => !e.grade || !my || e.grade === my.grade).filter((e) => e.kind !== "الخريجين" || !my || my.grade === "الثالث الثانوي");
    const box = $("#evList"); box.textContent = "";
    $("#evCol").hidden = !list.length; updateEvSection();
    list.slice(0, 6).forEach((e) => {
      const p = dParts(e.date), n = dayDiff(e.date), dl = e.deadline ? dayDiff(e.deadline) : null;
      const urgent = dl != null && dl >= 0 && dl <= 3;
      box.append(el("article", { class: "ev", style: "--c:" + (KIND_C[e.kind] || "#2D7BEA") },
        el("div", { class: "ev-date", "aria-hidden": "true" }, el("b", { text: String(p.day) }), el("small", { text: p.mon })),
        el("div", { class: "ev-tx" },
          el("div", { class: "ev-top" }, el("span", { class: "ev-kind", text: e.kind }), el("span", { class: "ev-when", text: n <= 0 && e.end && dayDiff(e.end) >= 0 ? "جارية الآن" : inDays(n) })),
          el("h3", { text: e.title }),
          e.note ? el("p", { text: e.note }) : null,
          dl != null && dl >= 0 ? el("p", { class: "ev-dl" + (urgent ? " urgent" : ""), text: "آخر موعد للتسجيل " + fmtDay(e.deadline) + " (" + inDays(dl) + ")" }) : null,
          el("div", { class: "ev-act" }, e.link ? el("a", { href: e.link, target: "_blank", rel: "noopener", text: e.kind === "تسجيل" || e.deadline ? "سجّل الآن ←" : "التفاصيل ←" }) : null,
            el("a", { href: ics(e), download: "event.ics", class: "ev-cal", text: "أضف إلى التقويم" })))));
    });
  }
  function updateEvSection() { $("#events").hidden = $("#evCol").hidden && $("#pollCol").hidden; $("#events").classList.toggle("one", $("#evCol").hidden || $("#pollCol").hidden); }

  // =====================================================================
  // الاستطلاعات
  // =====================================================================
  const voted = () => ls.get("bsh_voted", {});
  function idInput(id) { return el("input", { type: "text", id, inputmode: "numeric", maxlength: "10", dir: "ltr", placeholder: "رقم هويتك (10 أرقام)", class: "id-in", "aria-label": "رقم الهوية" }); }
  function resultsView(p, res, mine) {
    const total = res.reduce((a, b) => a + b, 0) || 1;
    return el("div", { class: "pl-res" }, ...p.options.map((o, i) => el("div", { class: "pl-bar" + (i === mine ? " mine" : "") },
      el("span", { class: "pl-fill", style: `width:${Math.round(res[i] / total * 100)}%` }), el("span", { class: "pl-o", text: o + (i === mine ? " ✓" : "") }), el("b", { text: Math.round(res[i] / total * 100) + "%" }))));
  }
  function renderPolls() {
    const box = $("#pollBox"); box.textContent = "";
    const list = (C.polls || []).filter((p) => {
      const secs = p.sections || [];
      if (secs.length) return !!my && secs.includes(my.section);
      return !p.grade || !my || p.grade === my.grade;
    });
    list.forEach((p) => {
      const v = voted()[p.id];
      const card = el("div", { class: "poll" }, el("small", { class: "pl-meta", text: p.open ? "استطلاع · حتى " + fmtDay(p.until) : "انتهى التصويت" }), el("h3", { text: p.q }));
      if (v != null || !p.open) {
        if (p.results) card.append(resultsView(p, p.results, v));
        else card.append(el("p", { class: "pl-done", text: v != null ? "✓ تم تسجيل صوتك. شكرًا لمشاركتك." : "انتهى التصويت." }));
      } else {
        const opts = el("div", { class: "pl-opts", role: "radiogroup", "aria-label": p.q });
        let pick = -1;
        p.options.forEach((o, i) => { const b = el("button", { type: "button", role: "radio", "aria-checked": "false", text: o }); b.onclick = () => { pick = i; opts.querySelectorAll("button").forEach((x, j) => x.setAttribute("aria-checked", String(j === i))); }; opts.append(b); });
        const idIn = myId ? null : idInput("pid-" + p.id);
        const err = el("p", { class: "err", role: "alert" });
        const send = el("button", { class: "btn sm violet", type: "button", text: "صوّت" });
        send.onclick = async () => {
          err.textContent = "";
          if (pick < 0) { err.textContent = "اختر أحد الخيارات."; return; }
          const sid = myId || digits(idIn.value);
          if (sid.length !== 10) { err.textContent = "اكتب رقم هويتك (10 أرقام) للتحقق من أنك من طلاب المدرسة."; idIn && idIn.focus(); return; }
          BSH.busy(send, true, "…");
          try { const d = await post("/api/vote", { pollId: p.id, studentId: sid, option: pick }); const vv = voted(); vv[p.id] = pick; ls.set("bsh_voted", vv); if (d.results) p.results = d.results; renderPolls(); BSH.toast("تم تسجيل صوتك."); }
          catch (e) { if (e.data && e.data.already) { const vv = voted(); vv[p.id] = -1; ls.set("bsh_voted", vv); if (e.data.results) p.results = e.data.results; renderPolls(); } err.textContent = e.message; BSH.busy(send, false); }
        };
        card.append(opts, el("div", { class: "pl-send" }, idIn, send), err);
      }
      box.append(card);
    });
    loadIdeas();
  }

  // =====================================================================
  // صندوق المبادرات
  // =====================================================================
  let ideas = [];
  const supported = () => ls.get("bsh_supported", {});
  async function loadIdeas() {
    if (loadIdeas.busy) return; loadIdeas.busy = true;
    try { const r = await fetch("/api/ideas"); const d = await r.json(); ideas = d.items || []; } catch { ideas = []; }
    loadIdeas.busy = false; renderIdeas();
  }
  const IDEA_C = { "منشورة للتصويت": "#2D7BEA", "قيد التنفيذ": "#7051F0", "نُفذت": "#00A774" };
  function renderIdeas() {
    const box = $("#ideasList"); box.textContent = "";
    const open = ideas.filter((x) => x.status !== "نُفذت").slice(0, 4), done = ideas.filter((x) => x.status === "نُفذت").slice(0, 3);
    if (!open.length && !done.length) box.append(el("p", { class: "ideas-empty", text: "لديك فكرة تجعل مدرستنا أفضل؟ اقترحها، وتُعرض هنا للتصويت بعد مراجعتها." }));
    open.forEach((x) => {
      const sup = supported()[x.id];
      const b = el("button", { class: "idea-vote" + (sup ? " on" : ""), type: "button", "aria-pressed": String(!!sup), title: x.status === "منشورة للتصويت" ? "أؤيد هذه المبادرة" : "" }, svg('<path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4.3-7.4A1.9 1.9 0 0 1 15 5.9z"/>'), el("b", { text: String(x.votes) }));
      b.disabled = x.status !== "منشورة للتصويت" || !!sup;
      b.onclick = async () => {
        let sid = myId;
        if (!sid) { sid = digits(prompt2()); }
        if (!sid || sid.length !== 10) { BSH.toast("اكتب رقم هويتك في «بياناتي» أولًا، ثم أيّد المبادرة."); BSH.jump("mydata"); $("#lookupId").focus(); return; }
        try { const d = await post("/api/ideas", { action: "vote", id: x.id, studentId: sid }); x.votes = d.votes; const s = supported(); s[x.id] = 1; ls.set("bsh_supported", s); renderIdeas(); BSH.toast("شكرًا لدعمك المبادرة."); }
        catch (e) { if (e.data && e.data.already) { const s = supported(); s[x.id] = 1; ls.set("bsh_supported", s); renderIdeas(); } BSH.toast(e.message); }
      };
      box.append(el("div", { class: "idea", style: "--c:" + (IDEA_C[x.status] || "#2D7BEA") }, b,
        el("div", { class: "idea-tx" }, el("b", { text: x.title }), el("p", { text: x.body }), el("small", {}, el("span", { class: "idea-st", text: x.status }), x.grade ? " · من طالب في " + x.grade : "", x.reply ? el("span", { class: "idea-rp", text: " · رد الإدارة: " + x.reply }) : null))));
    });
    if (done.length) {
      box.append(el("h4", { class: "ideas-done-h", text: "اقترحتموها فنفذناها ✓" }));
      done.forEach((x) => box.append(el("div", { class: "idea done" }, el("span", { class: "idea-ok" }, "✓"), el("div", { class: "idea-tx" }, el("b", { text: x.title }), x.reply ? el("small", { text: x.reply }) : null))));
    }
    $("#pollCol").hidden = false; updateEvSection();
  }
  const prompt2 = () => ""; // لا نوافذ منبثقة: يُطلب الرقم من «بياناتي»
  $("#ideaNew").addEventListener("click", () => { if (myId) $("#iId").value = myId; $("#iErr").textContent = ""; openDlg($("#ideaDlg")); });
  $("#ideaForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#iErr").textContent = "";
    const sid = digits($("#iId").value);
    if (sid.length !== 10) { $("#iErr").textContent = "رقم الهوية 10 أرقام."; return; }
    const btn = $("#iSend"); BSH.busy(btn, true, "جارٍ الإرسال…");
    try { await post("/api/ideas", { action: "submit", studentId: sid, title: $("#iTitle").value, body: $("#iBody").value }); $("#ideaForm").reset(); $("#ideaDlg").close(); BSH.toast("وصلت مبادرتك! ستظهر للتصويت بعد مراجعة الإدارة."); }
    catch (ex) { $("#iErr").textContent = ex.message; } finally { BSH.busy(btn, false); }
  });

  // =====================================================================
  // لوحة الشرف
  // =====================================================================
  let hoCat = "";
  const HO_C = { "التفوق الدراسي": "#00A774", "المسابقات": "#7051F0", "المواظبة": "#2D7BEA", "السلوك المتميز": "#D68A00", "التطوع": "#009AA6", "مبادرة": "#E5533F" };
  function renderHonor() {
    const all = C.honor || [];
    $("#honor").hidden = !all.length; if (!all.length) return;
    const cats = [...new Set(all.map((h) => h.cat))];
    const cb = $("#hoCats"); cb.textContent = "";
    if (cats.length > 1) ["", ...cats].forEach((c) => { const b = el("button", { type: "button", role: "tab", "aria-selected": String(c === hoCat), text: c || "الكل" }); b.onclick = () => { hoCat = c; renderHonor(); }; cb.append(b); });
    const tr = $("#hoTrack"); tr.textContent = "";
    all.filter((h) => !hoCat || h.cat === hoCat).forEach((h) => {
      const initial = (h.name.trim()[0] || "★");
      tr.append(el("article", { class: "ho", style: "--c:" + (HO_C[h.cat] || "#D68A00") },
        el("div", { class: "ho-medal", "aria-hidden": "true" }, initial),
        el("b", { class: "ho-name", text: h.name }), el("p", { text: h.title }),
        el("small", { text: [h.cat, h.grade ? h.grade.replace(" الثانوي", "") + (h.section ? " · " + h.section : "") : "", h.period].filter(Boolean).join(" · ") })));
    });
  }

  // =====================================================================
  // المكتبة: ملفات ومقاطع
  // =====================================================================
  const fSize = (n) => !n ? "" : n > 1048576 ? (n / 1048576).toFixed(1) + " م.ب" : Math.round(n / 1024) + " ك.ب";
  const fileCard = (f) => el("a", { class: "fcard", href: f.url, target: "_blank", rel: "noopener" },
    el("span", { class: "fc-ic" + (/^image/.test(f.type || "") ? " img" : "") }, /^image/.test(f.type || "") ? "صورة" : "PDF"),
    el("span", { class: "fc-tx" }, el("b", { text: f.title }), el("small", { text: [f.cat, fSize(f.size)].filter(Boolean).join(" · ") || "فتح الملف" })),
    el("span", { class: "fc-go", "aria-hidden": "true" }, "↗"));
  function fill(id, list) { const box = $(id); if (!box) return; box.textContent = ""; box.hidden = !list.length; list.forEach((f) => box.append(fileCard(f))); }
  let faqCat = "";
  BSH.on("faqcat", (c) => { faqCat = c; fillFaqFiles(); });
  function fillFaqFiles() { const fs = (C.files || []).filter((f) => f.section === "faq" && (!faqCat || f.cat === faqCat)); fill("#faqFiles", fs); }
  function renderLibrary() {
    fillFaqFiles();
    fill("#pfFiles", (C.files || []).filter((f) => f.section === "platforms"));
    fill("#gradFiles", (C.files || []).filter((f) => f.section === "grad"));
    fill("#newFiles", (C.files || []).filter((f) => f.section === "new"));
    const gen = (C.files || []).filter((f) => f.section === "general");
    fill("#libFiles", gen); $("#libFileCol").hidden = !gen.length;
    const vids = C.videos || [], vb = $("#libVideos"); vb.textContent = "";
    vids.forEach((v) => {
      const img = el("img", { alt: "", loading: "lazy", src: "https://i.ytimg.com/vi/" + v.yt + "/mqdefault.jpg" });
      img.onerror = () => img.remove();
      vb.append(el("a", { class: "vcard", href: "https://www.youtube.com/watch?v=" + v.yt, target: "_blank", rel: "noopener" },
        el("span", { class: "vc-th" }, img, el("span", { class: "vc-play", "aria-hidden": "true" }, "▶")), el("b", { text: v.title }), v.cat ? el("small", { text: v.cat }) : null));
    });
    $("#libVidCol").hidden = !vids.length;
    $("#libBox").hidden = !vids.length && !gen.length;
  }

  // =====================================================================
  // مساعد حل المشكلات قبل إرسال الاستفسار
  // =====================================================================
  const MADRASATI_RESET = "https://schools.madrasati.sa/ChangePassword?Language=1";
  const WIZ = [
    { t: "لا أستطيع الدخول إلى منصة مدرستي", type: "تعذر الدخول إلى منصة مدرستي", ic: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      steps: ["تأكد أنك تكتب بريد المنصة الصحيح كما يظهر في «بياناتي» أعلى الصفحة.", "إن كنت لا تتذكر كلمة المرور فاستعدها من الرابط الرسمي.", "جرّب متصفحًا آخر، أو امسح بيانات التصفح ثم حاول مجددًا."],
      links: [["بريدي من «بياناتي»", "#mydata"], ["استعادة كلمة المرور", MADRASATI_RESET]] },
    { t: "نسيت كلمة المرور", type: "نسيان كلمة المرور", ic: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2"/>',
      steps: ["افتح رابط استعادة كلمة المرور واكتب رقم هويتك.", "يصل رمز التحقق إلى جوال ولي الأمر المسجّل لدى المدرسة.", "اختر كلمة مرور جديدة وادخل بها مباشرة، ولا تشاركها مع أحد."],
      links: [["استعادة كلمة المرور", MADRASATI_RESET]] },
    { t: "لا أستطيع دخول تيمز أو الحصة", type: "تعذر الدخول إلى تيمز أو حضور الحصة", ic: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
      steps: ["سجّل الدخول إلى تيمز ببريد المنصة نفسه (من «بياناتي») وكلمة مرور مدرستي.", "حدّث تطبيق تيمز، أو افتح الحصة من المتصفح.", "ادخل الحصة من جدول الحصص داخل منصة مدرستي بدل الروابط القديمة."],
      links: [["الدليل المصور", "#guide"]] },
    { t: "مشكلة في حساب Microsoft", type: "مشكلة في حساب Microsoft", ic: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/>',
      steps: ["استخدم بريد المنصة الظاهر في «بياناتي» وليس بريدك الشخصي.", "سجّل الخروج من حسابات Microsoft الأخرى في جهازك ثم أعد الدخول."],
      links: [["بريدي من «بياناتي»", "#mydata"]] },
    { t: "استفسار عام أو ملاحظة", type: "", ic: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', direct: true },
  ];
  function wizHome() {
    const w = $("#wizard"); w.hidden = false; w.textContent = ""; $("#ticketForm").hidden = true;
    w.append(el("p", { class: "wiz-q", text: "ما مشكلتك؟ اختر الأقرب، وقد نحلها معك فورًا." }));
    const g = el("div", { class: "wiz-grid" });
    WIZ.forEach((x) => { const b = el("button", { class: "wiz-opt", type: "button" }, el("span", { class: "wo-ic" }, svg(x.ic)), el("b", { text: x.t })); b.onclick = () => (x.direct ? toForm(x) : wizSteps(x)); g.append(b); });
    w.append(g);
  }
  function wizSteps(x) {
    const w = $("#wizard"); w.textContent = "";
    const links = (x.links || []).map(([t, u]) => {
      if (u === "#guide") { const b = el("button", { class: "btn light sm", type: "button", text: t }); b.onclick = () => $("#openMadrasati").click(); return b; }
      if (u.startsWith("#")) { const b = el("button", { class: "btn light sm", type: "button", text: t }); b.onclick = () => { BSH.jump(u.slice(1)); }; return b; }
      return el("a", { class: "btn light sm", href: u, target: "_blank", rel: "noopener", text: t + " ↗" });
    });
    const yes = el("button", { class: "btn sm", type: "button", text: "حُلّت مشكلتي" }); yes.onclick = () => { w.textContent = ""; w.append(el("div", { class: "wiz-ok" }, el("b", { text: "رائع! سعدنا بمساعدتك 🌱" }), el("p", { text: "إذا احتجت شيئًا آخر فنحن هنا." }), backBtn())); };
    const no = el("button", { class: "btn outline sm", type: "button", text: "لم تُحل، أرسل استفسارًا" }); no.onclick = () => toForm(x);
    w.append(el("div", { class: "wiz-head" }, backBtn(), el("b", { text: x.t })),
      el("ol", { class: "wiz-steps" }, ...x.steps.map((s) => el("li", { text: s }))),
      links.length ? el("div", { class: "wiz-links" }, ...links) : null,
      el("div", { class: "wiz-ans" }, el("span", { text: "هل حُلّت مشكلتك؟" }), yes, no));
  }
  const backBtn = () => { const b = el("button", { class: "wiz-back", type: "button", text: "→ رجوع" }); b.onclick = wizHome; return b; };
  function toForm(x) {
    const w = $("#wizard"); w.textContent = "";
    const ch = el("button", { class: "link-btn", type: "button", text: "تغيير" }); ch.onclick = wizHome;
    w.append(el("div", { class: "wiz-sum" }, el("span", { text: x.type ? "المشكلة: " + x.t : "استفسار عام أو ملاحظة" }), ch));
    $("#ticketForm").hidden = false;
    if (x.type) { $("#f-type").value = x.type; $("#f-type").dispatchEvent(new Event("change")); $("#typeHelp").hidden = true; }
    setTimeout(() => $("#f-id").focus({ preventScroll: true }), 50);
  }
  wizHome();

  // =====================================================================
  // وضع التركيز
  // =====================================================================
  const QUOTES = ["﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾", "﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾", "«مَن سلك طريقًا يلتمس فيه علمًا سهّل الله له به طريقًا إلى الجنة»", "قليلٌ دائم خيرٌ من كثيرٍ منقطع.", "ابدأ بالأصعب وأنت في كامل تركيزك.", "أبعد الجوال عن متناول يدك حتى تنتهي الجلسة."];
  let fm = [25, 5], phase = "focus", left = 25 * 60, timer = null, endAt = 0, wake = null;
  const weekKey = () => { const d = new Date(today() + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
  const weekMin = () => (ls.get("bsh_focus", {})[weekKey()] || 0);
  function fDraw() {
    const total = (phase === "focus" ? fm[0] : fm[1]) * 60;
    $("#fTime").textContent = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
    $("#fPhase").textContent = phase === "focus" ? "تركيز" : "استراحة";
    const c = 2 * Math.PI * 52; $("#fArc").style.strokeDasharray = c; $("#fArc").style.strokeDashoffset = c * (1 - left / total);
    $("#fArc").classList.toggle("rest", phase !== "focus");
    const m = weekMin(); $("#focusWeek").textContent = m ? "ذاكرت هذا الأسبوع " + (m >= 60 ? Math.floor(m / 60) + " ساعة و" + (m % 60) + " دقيقة" : m + " دقيقة") : "ركّز الآن، وخذ استراحة قصيرة بعدها";
  }
  function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 660; g.gain.setValueAtTime(.15, a.currentTime); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + 1.2); o.start(); o.stop(a.currentTime + 1.2); } catch {} }
  function fTick() {
    left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    if (left <= 0) {
      if (phase === "focus") { const f = ls.get("bsh_focus", {}); f[weekKey()] = (f[weekKey()] || 0) + fm[0]; ls.set("bsh_focus", f); }
      beep(); phase = phase === "focus" ? "rest" : "focus"; left = (phase === "focus" ? fm[0] : fm[1]) * 60; endAt = Date.now() + left * 1000;
      $("#fQuote").textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
      BSH.toast(phase === "rest" ? "أحسنت! خذ استراحة " + fm[1] + " دقائق." : "انتهت الاستراحة، لنبدأ من جديد.");
    }
    fDraw();
  }
  function fStop() { clearInterval(timer); timer = null; $("#fStart").textContent = "ابدأ"; try { wake && wake.release(); } catch {} wake = null; }
  $("#fStart").addEventListener("click", async () => {
    if (timer) { fStop(); return; }
    endAt = Date.now() + left * 1000; timer = setInterval(fTick, 500); $("#fStart").textContent = "إيقاف مؤقت";
    try { wake = await navigator.wakeLock?.request("screen"); } catch {}
  });
  $("#fReset").addEventListener("click", () => { fStop(); phase = "focus"; left = fm[0] * 60; fDraw(); });
  document.querySelectorAll("#fModes button").forEach((b) => b.addEventListener("click", () => { document.querySelectorAll("#fModes button").forEach((x) => x.classList.toggle("on", x === b)); fm = b.dataset.m.split(",").map(Number); fStop(); phase = "focus"; left = fm[0] * 60; fDraw(); }));
  function openFocus() { $("#fQuote").textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)]; fDraw(); openDlg($("#focusDlg")); }
  $("#focusBtn").addEventListener("click", openFocus);

  // =====================================================================
  // خيارات الإتاحة
  // =====================================================================
  const A11Y = ls.get("bsh_a11y", { z: 1, contrast: false, read: false });
  function applyA11y() {
    document.body.style.zoom = A11Y.z === 1 ? "" : String(A11Y.z);
    document.documentElement.toggleAttribute("data-contrast", !!A11Y.contrast);
    $("#a11yContrast").checked = !!A11Y.contrast; $("#a11yRead").checked = !!A11Y.read;
    document.querySelectorAll("#a11yFont button").forEach((b) => b.classList.toggle("on", +b.dataset.z === A11Y.z));
    document.documentElement.toggleAttribute("data-read", !!A11Y.read);
    addSpeak();
  }
  $("#a11yBtn").addEventListener("click", (e) => { e.stopPropagation(); const p = $("#a11yPop"); p.hidden = !p.hidden; $("#a11yBtn").setAttribute("aria-expanded", String(!p.hidden)); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#a11yPop") && !e.target.closest("#a11yBtn")) { $("#a11yPop").hidden = true; $("#a11yBtn").setAttribute("aria-expanded", "false"); } });
  document.querySelectorAll("#a11yFont button").forEach((b) => b.addEventListener("click", () => { A11Y.z = +b.dataset.z; ls.set("bsh_a11y", A11Y); applyA11y(); }));
  $("#a11yContrast").addEventListener("change", (e) => { A11Y.contrast = e.target.checked; ls.set("bsh_a11y", A11Y); applyA11y(); });
  $("#a11yRead").addEventListener("change", (e) => { A11Y.read = e.target.checked; ls.set("bsh_a11y", A11Y); applyA11y(); if (!e.target.checked) window.BSHVoice && BSHVoice.stop(); });
  let speakingBtn = null;
  function speak(text, btn) {
    const V = window.BSHVoice;
    if (!V || !V.supported) { BSH.toast("القراءة الصوتية غير مدعومة في هذا المتصفح."); return; }
    if (btn && speakingBtn === btn) { V.stop(); return; } // ضغطة ثانية = إيقاف
    V.stop();
    speakingBtn = btn || null; if (btn) btn.classList.add("on");
    V.speak(text, { onend: () => { if (btn) btn.classList.remove("on"); if (speakingBtn === btn) speakingBtn = null; } });
  }
  BSH.speak = speak;
  function addSpeak() {
    if (!A11Y.read) { document.querySelectorAll(".spk").forEach((b) => b.remove()); return; }
    document.querySelectorAll(".ncard, .fq-a, .ev-tx, .call-tx").forEach((n) => {
      if (n.querySelector(":scope > .spk")) return;
      const b = el("button", { class: "spk", type: "button", "aria-label": "استمع", title: "استمع" }, svg('<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'));
      b.onclick = (e) => { e.stopPropagation(); e.preventDefault(); const c = n.cloneNode(true); c.querySelectorAll(".spk,button,a.ev-cal").forEach((x) => x.remove()); speak(c.textContent.replace(/\s+/g, " ").trim(), b); };
      n.append(b);
    });
  }
  new MutationObserver(() => { if (A11Y.read) addSpeak(); }).observe(document.querySelector("main"), { childList: true, subtree: true });
  applyA11y();

  // =====================================================================
  // بوابة الخريج
  // =====================================================================
  const GRAD_CHECK = ["أنشئ حسابك في منصة قياس وتأكد من صحة بياناتك", "سجّل في اختبار القدرات العامة", "سجّل في الاختبار التحصيلي", "جهّز هويتك الوطنية سارية المفعول ليوم الاختبار", "تابع إعلان مواعيد التقديم في منصة قبول", "اختر 7 رغبات على الأقل (حتى 25) ورتّبها بعناية", "راجع الأوزان المطلوبة للتخصصات التي تريدها"];
  function renderGrad() {
    const box = $("#gDates"); box.textContent = "";
    const list = (C.events || []).filter((e) => e.kind === "اختبار وطني" || e.kind === "الخريجين" || (e.grade === "الثالث الثانوي" && e.deadline));
    if (!list.length) box.append(el("p", { class: "sub", style: "margin:0", text: "ستضيف المدرسة مواعيد القدرات والتحصيلي والقبول هنا فور إعلانها." }));
    list.forEach((e) => { const n = dayDiff(e.deadline && dayDiff(e.deadline) >= 0 ? e.deadline : e.date); box.append(el("div", { class: "g-date" }, el("b", { class: "g-n", text: n <= 0 ? "اليوم" : String(n) }), el("small", { text: n <= 0 ? "" : n <= 10 ? "أيام" : "يومًا" }), el("span", { text: e.title }), el("small", { class: "g-d", text: fmtDay(e.deadline && dayDiff(e.deadline) >= 0 ? e.deadline : e.date) }), e.link ? el("a", { href: e.link, target: "_blank", rel: "noopener", text: "الرابط ↗" }) : null)); });
    checklist("#gCheck", "bsh_grad", GRAD_CHECK.map((t) => ({ t })));
  }
  const pct = (n) => (Math.round(n * 100) / 100).toFixed(2);
  function calc() {
    const v = (id) => parseFloat($(id).value), hs = v("#cHs"), qd = v("#cQd"), th = v("#cTh"), w = [v("#wHs"), v("#wQd"), v("#wTh")].map((x) => (isNaN(x) ? 0 : x));
    const out = $("#calcOut");
    if ([hs, qd, th].some((x) => isNaN(x))) { out.textContent = "اكتب درجاتك لتظهر نسبتك الموزونة."; out.className = "calc-out"; return; }
    if ([hs, qd, th].some((x) => x < 0 || x > 100)) { out.textContent = "الدرجات بين 0 و100."; out.className = "calc-out warn"; return; }
    const sw = w.reduce((a, b) => a + b, 0);
    if (Math.round(sw) !== 100) { out.textContent = "مجموع الأوزان " + sw + "%، ويجب أن يكون 100%."; out.className = "calc-out warn"; return; }
    out.textContent = ""; out.className = "calc-out ok";
    out.append(el("small", { text: "نسبتك الموزونة" }), el("b", { text: pct((hs * w[0] + qd * w[1] + th * w[2]) / 100) + "%" }));
  }
  ["#cHs", "#cQd", "#cTh", "#wHs", "#wQd", "#wTh"].forEach((id) => $(id).addEventListener("input", calc));

  // =====================================================================
  // رحلة الطالب المستجد
  // =====================================================================
  const JOURNEY = [
    { t: "اعرف بريدك للمنصة من «بياناتي»", go: () => { $("#journeyDlg").close(); BSH.jump("mydata"); $("#lookupId").focus(); } },
    { t: "سجّل الدخول إلى منصة مدرستي", go: () => { $("#journeyDlg").close(); $("#openMadrasati").click(); } },
    { t: "ثبّت تطبيق تيمز وادخل ببريد المنصة", go: () => { $("#journeyDlg").close(); $("#openMadrasati").click(); } },
    { t: "اعرض جدولك وفعّل «تذكّر شعبتي»", go: () => { $("#journeyDlg").close(); BSH.jump("myschedule"); } },
    { t: "تصفّح الأسئلة الشائعة", go: () => { $("#journeyDlg").close(); BSH.jump("faq"); } },
    { t: "تعرّف على «صوتك يصل» للتواصل مع المسؤولين", go: () => { $("#journeyDlg").close(); BSH.jump("ticket"); } },
    { t: "ثبّت دليل الطالب على جوالك", go: () => { $("#journeyDlg").close(); const b = $("#installBtn"); if (!b.hidden) b.click(); else openDlg($("#iosDlg")); } },
  ];
  function checklist(sel, key, items, onChange) {
    const done = ls.get(key, {}), box = $(sel); box.textContent = "";
    items.forEach((it, i) => {
      const c = el("input", { type: "checkbox", id: key + i }); c.checked = !!done[i];
      c.onchange = () => { const d = ls.get(key, {}); d[i] = c.checked; ls.set(key, d); onChange && onChange(); };
      box.append(el("li", {}, c, el("label", { for: key + i, text: it.t }), it.go ? (() => { const b = el("button", { class: "link-btn", type: "button", text: "افتح ←" }); b.onclick = it.go; return b; })() : null));
    });
  }
  function jrUpdate() {
    const d = ls.get("bsh_journey", {}), n = JOURNEY.filter((_, i) => d[i]).length, p = Math.round(n / JOURNEY.length * 100);
    $("#jrBar").style.width = p + "%"; $("#jrPct").textContent = p + "%";
    if (p === 100 && !jrUpdate.done) { jrUpdate.done = true; BSH.toast("أحسنت! أكملت رحلة البداية، وفقك الله في عامك الدراسي 🎉"); }
  }
  checklist("#jrList", "bsh_journey", JOURNEY, jrUpdate); jrUpdate();

  // تمييز الأداة المناسبة لصف الطالب
  function highlightApps() {
    const g = my && my.grade;
    document.querySelector('.app[data-dlg="gradDlg"]')?.classList.toggle("dot", g === "الثالث الثانوي");
    document.querySelector('.app[data-dlg="journeyDlg"]')?.classList.toggle("dot", g === "الأول الثانوي");
  }
  highlightApps();

  // =====================================================================
  // رابط QR على باب الفصل: ‎#s2-14 = الثاني الثانوي، الشعبة 14
  // =====================================================================
  const m = location.hash.match(/^#s([123])-(\d{1,2})$/);
  if (m && BSH.setMy) {
    BSH.setMy(GRADES[+m[1] - 1], m[2]);
    setTimeout(() => BSH.jump("myschedule"), 300);
  }
})();
