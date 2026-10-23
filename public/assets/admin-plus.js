// لوحة التحكم: الإعلانات، المسؤولون، الإعدادات (الحفظ والتقويم)، الأسئلة الشائعة، الجداول والاختبارات، المؤشرات، التقرير الشهري
(() => {
  "use strict";
  const A = window.ADM;
  const { el, toast, busy, fmtDate, $, SECTIONS } = A;
  const api = (b) => A.api(b);
  const me = () => A.me();
  const GRADES = ["الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"];
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const TZ = "Asia/Riyadh";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
  const fmtDay = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" }); } catch { return iso; } };
  const fmtHijri = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch { return ""; } };
  const onTab = (name, f) => { (A.onTab[name] = A.onTab[name] || []).push(f); };
  const fillSections = (sel, first) => { sel.textContent = ""; if (first != null) sel.append(el("option", { value: "", text: first })); SECTIONS.forEach((s) => sel.append(el("option", { value: s, text: "الشعبة " + s }))); };
  const download = (name, blob) => { const a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const hrs = (h) => h == null ? "—" : h < 1 ? Math.max(1, Math.round(h * 60)) + " د" : h < 48 ? (Math.round(h * 10) / 10) + " س" : Math.round(h / 24) + " يوم";
  const ago = (iso) => { const m = (Date.now() - Date.parse(iso)) / 6e4; return m < 60 ? "منذ " + Math.max(1, Math.round(m)) + " د" : m < 2880 ? "منذ " + Math.round(m / 60) + " س" : "منذ " + Math.round(m / 1440) + " يوم"; };
  const monthName = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric", timeZone: "UTC" }); };

  // =====================================================================
  // الإعلانات
  // =====================================================================
  const ANN_TYPES = { urgent: "عاجل", warn: "تنبيه", info: "معلومة", congrats: "تهنئة" };
  let anns = [];
  // اختيار شعب محددة (أكثر من شعبة) للإعلان
  const secPicker = (box, onChange) => {
    box.textContent = "";
    const groups = [["الشعب 1–8", SECTIONS.filter((x) => +x < 10)], ["الشعب 11–18", SECTIONS.filter((x) => +x > 10 && +x < 20)], ["الشعب 21–28", SECTIONS.filter((x) => +x > 20)]];
    groups.forEach(([g, list]) => { box.append(el("span", { class: "g", text: g })); list.forEach((x) => { const c = el("input", { type: "checkbox", value: x }); c.onchange = onChange; box.append(el("label", {}, c, x)); }); });
  };
  const pickedSecs = (box) => [...box.querySelectorAll("input:checked")].map((c) => c.value);
  const setSecs = (box, list) => box.querySelectorAll("input").forEach((c) => { c.checked = (list || []).includes(c.value); });
  const secBtnText = () => { const n = pickedSecs($("#aSecs")).length; $("#aSecBtn").firstChild.textContent = n ? n + " شعبة محددة " : "كل شعب الصف "; $("#aGrade").disabled = n > 0; if (n) $("#aGrade").value = ""; };
  secPicker($("#aSecs"), secBtnText);
  $("#aSecBtn").addEventListener("click", () => { $("#aSecs").hidden = !$("#aSecs").hidden; });
  // ===== التسجيل الصوتي للإعلان =====
  let rec = { blob: null, type: "", sec: 0, remove: false, mr: null, timer: 0, t0: 0 };
  const mmss = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  function recShow(url) {
    const p = $("#recPrev");
    if (p.dataset.url && p.dataset.url.startsWith("blob:")) URL.revokeObjectURL(p.dataset.url);
    p.hidden = !url; p.dataset.url = url || ""; if (url) p.src = url; else p.removeAttribute("src");
    $("#recDel").hidden = !url;
  }
  function recClear() { recStop(true); rec.blob = null; rec.type = ""; rec.sec = 0; rec.remove = false; recShow(""); $("#recTime").hidden = true; }
  function recStop(discard) {
    if (rec.mr && rec.mr.state !== "inactive") { rec.discard = !!discard; rec.mr.stop(); }
    clearInterval(rec.timer); $("#recBtn").classList.remove("on"); $("#recBtn").lastChild.textContent = "تسجيل";
  }
  $("#recBtn").addEventListener("click", async () => {
    if (rec.mr && rec.mr.state === "recording") { recStop(false); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast("التسجيل غير مدعوم في هذا المتصفح. ارفع ملفًا صوتيًا بدلًا منه."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch { toast("اسمح للمتصفح باستخدام الميكروفون ثم أعد المحاولة."); return; }
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
    const chunks = [];
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    rec.mr = mr; rec.discard = false;
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (rec.discard) return;
      const type = (mr.mimeType || mime || "audio/webm").split(";")[0];
      rec.blob = new Blob(chunks, { type }); rec.type = type; rec.sec = Math.round((Date.now() - rec.t0) / 1000); rec.remove = false;
      recShow(URL.createObjectURL(rec.blob)); toast("استمع للتسجيل؛ إن أعجبك فاضغط «نشر الإعلان».");
    };
    mr.start(); rec.t0 = Date.now();
    $("#recBtn").classList.add("on"); $("#recBtn").lastChild.textContent = "إيقاف"; $("#recTime").hidden = false; $("#recTime").textContent = "0:00";
    rec.timer = setInterval(() => { const s = (Date.now() - rec.t0) / 1000; $("#recTime").textContent = mmss(s); if (s >= 120) { recStop(false); toast("بلغ التسجيل دقيقتين."); } }, 250);
  });
  $("#recFile").addEventListener("change", (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast("الملف أكبر من 4 ميجابايت. اختر تسجيلًا أقصر."); return; }
    const type = f.type || ({ mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm" })[f.name.split(".").pop().toLowerCase()] || "";
    if (!/^audio\//.test(type)) { toast("اختر ملفًا صوتيًا (MP3 أو M4A أو WAV)."); return; }
    recStop(true); rec.blob = f; rec.type = type === "audio/x-m4a" ? "audio/mp4" : type; rec.remove = false;
    const url = URL.createObjectURL(f); recShow(url);
    const probe = new Audio(url); probe.onloadedmetadata = () => { rec.sec = Math.round(probe.duration) || 0; };
    $("#recTime").hidden = true;
  });
  $("#recDel").addEventListener("click", () => { const had = !!$("#aId").value; recClear(); rec.remove = had; toast("سيُحذف التسجيل عند الحفظ."); });
  const blobB64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });

  function annReset() {
    recClear();
    $("#annForm").reset(); $("#aId").value = ""; setSecs($("#aSecs"), []); $("#aSecs").hidden = true; secBtnText();
    $("#aFrom").value = today(); $("#aTo").value = addDays(today(), 7);
    $("#annFormTitle").textContent = "إعلان جديد"; $("#annSave").textContent = "نشر الإعلان"; $("#annErr").textContent = "";
  }
  function annState(a) {
    const t = today();
    if (a.hidden) return ["مخفي", "st-hidden"];
    if (a.from > t) return ["مجدول", "st-sched"];
    if (a.to < t) return ["منتهٍ", "st-ended"];
    return ["نشط", "st-active"];
  }
  function annRender() {
    const box = $("#annList"); box.textContent = "";
    if (!anns.length) { box.append(el("p", { class: "empty", text: "لا توجد إعلانات بعد." })); return; }
    const order = { "نشط": 0, "مجدول": 1, "مخفي": 2, "منتهٍ": 3 };
    [...anns].sort((a, b) => order[annState(a)[0]] - order[annState(b)[0]] || (a.from < b.from ? 1 : -1)).forEach((a) => {
      const [stTx, stCl] = annState(a);
      const edit = el("button", { class: "btn light sm", type: "button", text: "تعديل" });
      const hide = el("button", { class: "btn light sm", type: "button", text: a.hidden ? "إظهار" : "إخفاء" });
      const del = el("button", { class: "btn light sm", type: "button", text: "حذف", style: "color:var(--danger)" });
      edit.onclick = () => {
        $("#aId").value = a.id; $("#aTitle").value = a.title; $("#aBody").value = a.body || ""; $("#aLink").value = a.link || "";
        document.querySelector(`input[name=aType][value=${a.type}]`).checked = true;
        $("#aGrade").value = a.grade || ""; setSecs($("#aSecs"), a.sections && a.sections.length ? a.sections : a.section ? [a.section] : []); $("#aSecs").hidden = !pickedSecs($("#aSecs")).length; secBtnText();
        $("#aFrom").value = a.from; $("#aTo").value = a.to; $("#aPinned").checked = !!a.pinned; $("#aNotify").checked = a.notify !== false;
        recClear(); if (a.audioType) recShow("/api/file?ann=" + a.id + "&v=" + a.audioV);
        $("#annFormTitle").textContent = "تعديل إعلان"; $("#annSave").textContent = "حفظ التعديل"; $("#aTitle").focus();
      };
      hide.onclick = async () => { try { await api({ action: "ann-save", ...a, hidden: !a.hidden }); toast(a.hidden ? "ظهر الإعلان للطلاب." : "أُخفي الإعلان."); annLoad(); } catch (e) { toast(e.message); } };
      del.onclick = async () => { if (!(await A.ask("حذف الإعلان «" + a.title + "»؟"))) return; try { await api({ action: "ann-delete", id: a.id }); toast("تم حذف الإعلان."); annLoad(); } catch (e) { toast(e.message); } };
      const secs = a.sections && a.sections.length ? a.sections : a.section ? [a.section] : [];
      const aud = secs.length ? (secs.length === 1 ? "الشعبة " : "الشعب ") + secs.join("، ") : a.grade || "كل الطلاب";
      box.append(el("div", { class: "row-item t-" + a.type },
        el("span", { class: "bar" }),
        el("div", { class: "tx" }, el("b", {}, (a.pinned ? "📌 " : "") + (a.audioType ? "🎙 " : "") + a.title), el("small", { text: ANN_TYPES[a.type] + " · " + aud + " · " + fmtDay(a.from) + " ← " + fmtDay(a.to) })),
        el("span", { class: "st-chip " + stCl, text: stTx }),
        el("div", { class: "row-actions" }, edit, hide, del)));
    });
  }
  async function annLoad() { try { anns = (await api({ action: "ann-list" })).items || []; annRender(); } catch (e) { toast(e.message); } }
  $("#annReset").addEventListener("click", annReset);
  $("#annForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("#annErr"); err.textContent = "";
    const btn = $("#annSave"); busy(btn, true, "جارٍ الحفظ…");
    const cur = anns.find((x) => x.id === $("#aId").value);
    try {
      await api({ action: "ann-save", id: $("#aId").value || undefined, title: $("#aTitle").value, body: $("#aBody").value, link: $("#aLink").value.trim(),
        type: document.querySelector("input[name=aType]:checked").value, grade: $("#aGrade").value, sections: pickedSecs($("#aSecs")),
        from: $("#aFrom").value, to: $("#aTo").value, pinned: $("#aPinned").checked, hidden: cur ? !!cur.hidden : false, notify: $("#aNotify").checked,
        audio: rec.blob ? { data: await blobB64(rec.blob), type: rec.type, sec: rec.sec } : undefined, audioRemove: rec.remove || undefined });
      toast($("#aId").value ? "تم حفظ التعديل." : "تم نشر الإعلان."); annReset(); annLoad();
    } catch (ex) { err.textContent = ex.message; } finally { busy(btn, false); }
  });

  // =====================================================================
  // المسؤولون
  // =====================================================================
  let users = [], roles = [], types = [];
  function permTypes(sel) {
    const box = $("#pTypes"); box.textContent = "";
    types.forEach((t) => { const c = el("input", { type: "checkbox", value: t }); c.checked = sel === "all" || (Array.isArray(sel) && sel.includes(t)); box.append(el("label", {}, c, " " + t)); });
    $("#pInq").checked = sel === "all" || (Array.isArray(sel) && sel.length > 0);
    box.hidden = !$("#pInq").checked;
  }
  $("#pInq").addEventListener("change", () => { const on = $("#pInq").checked; $("#pTypes").hidden = !on; $("#pTypes").querySelectorAll("input").forEach((c) => c.checked = on); });
  const PERM_IDS = { announcements: "#pAnn", students: "#pStu", faq: "#pFaq", schedule: "#pSched", calls: "#pCalls", events: "#pEvents", honor: "#pHonor", polls: "#pPolls" };
  function setPermBoxes(p) { Object.entries(PERM_IDS).forEach(([k, id]) => { $(id).checked = !!p[k]; }); }
  // صلاحيات مقترحة لكل دور (تُعدّل قبل الحفظ)
  const TECH = ["تعذر الدخول إلى منصة مدرستي", "نسيان كلمة المرور", "مشكلة في حساب Microsoft", "تعذر الدخول إلى تيمز أو حضور الحصة"];
  const PRESETS = {
    "الموجه الطلابي": { inquiries: ["شكوى أو ملاحظة", "استفسار عام", "مشكلة أخرى"], calls: true, polls: true },
    "وكيل الشؤون التعليمية": { inquiries: "all", announcements: true, schedule: true, calls: true, events: true, polls: true },
    "مدير المدرسة": { inquiries: "all", announcements: true, students: true, faq: true, schedule: true, calls: true, events: true, honor: true, polls: true },
    "منسق موهبة": { events: true, honor: true, faq: true },
    "المنسق الصحي": { announcements: true, calls: true, faq: true },
    "رائد النشاط": { announcements: true, events: true, honor: true, polls: true, faq: true },
    "وكيل شؤون الطلاب": { inquiries: "all", announcements: true, calls: true, students: true },
    "مسؤول التقنية": { inquiries: TECH, faq: true },
    "معلم": { announcements: false },
    "أخرى": {},
  };
  function applyPreset(role) { const p = PRESETS[role] || {}; permTypes(p.inquiries || []); setPermBoxes(p); $("#uTitleF").hidden = role !== "أخرى"; }
  $("#uRole").addEventListener("change", () => applyPreset($("#uRole").value));
  let slotsDef = {};
  function slotsRender() {
    const box = $("#slots"); box.textContent = "";
    Object.entries(slotsDef).forEach(([role, n]) => {
      const holders = users.filter((u) => u.role === role);
      for (let i = 0; i < Math.max(n, holders.length); i++) {
        const u = holders[i];
        const b = el("button", { class: "slot" + (u ? "" : " empty"), type: "button" }, el("small", { text: role + (n > 1 ? " " + (i + 1) : "") }), el("b", { text: u ? u.name : "+ إضافة" }), u && !u.active ? el("small", { text: "موقوف" }) : null);
        b.onclick = () => {
          if (u) { const row = [...$("#userList").children].find((r) => r.dataset.id === u.id); row && row.querySelector(".btn").click(); return; }
          userReset(); $("#uRole").value = role; applyPreset(role); $("#uName").focus(); $("#userForm").scrollIntoView({ behavior: "smooth", block: "start" });
        };
        box.append(b);
      }
    });
  }
  function userReset() {
    $("#userForm").reset(); $("#uId").value = ""; $("#userErr").textContent = "";
    $("#userFormTitle").textContent = "إضافة مسؤول"; $("#userSave").textContent = "إضافة المسؤول"; $("#uUser").disabled = false;
    permTypes([]); setPermBoxes({}); $("#uTitleF").hidden = true; if (roles.length) applyPreset($("#uRole").value);
  }
  function showSecret(name, username, pw) {
    $("#secretFor").textContent = "الرقم السري المؤقت لـ " + name; $("#secretUser").textContent = username; $("#secretPw").textContent = pw;
    $("#secretBox").hidden = false; $("#secretBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#secretCopy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#secretPw").textContent); toast("تم النسخ."); } catch { toast("انسخ الرقم يدويًا."); } });
  function permText(p) {
    const out = [];
    if (p.inquiries === "all") out.push("كل الاستفسارات"); else if (p.inquiries?.length) out.push(p.inquiries.length === 1 ? p.inquiries[0] : p.inquiries.length + " أنواع استفسارات");
    const L = { announcements: "الإعلانات", calls: "الاستدعاء", events: "الفعاليات", honor: "لوحة الشرف", polls: "الاستطلاعات", faq: "المكتبة", schedule: "الجداول", students: "بيانات الطلاب" };
    Object.entries(L).forEach(([k, v]) => { if (p[k]) out.push(v); });
    return out.join(" · ") || "بدون صلاحيات";
  }
  function usersRender() {
    const box = $("#userList"); box.textContent = "";
    box.append(el("div", { class: "row-item" }, el("span", { class: "who-av", text: "م", style: "background:#7C5CFF" }), el("div", { class: "tx" }, el("b", { text: "مدير النظام" }), el("small", { text: "كل الصلاحيات · يدخل بالرقم السري الأساسي" }))));
    if (!users.length) box.append(el("p", { class: "hint", text: "لم تُضف أي مسؤول بعد. أضف الموجه الطلابي أو رائد النشاط من النموذج." }));
    const colors = ["#00A774", "#2D8CFF", "#FF6B5B", "#F5A700", "#00A8B5", "#7C5CFF"];
    users.forEach((u, i) => {
      const edit = el("button", { class: "btn light sm", type: "button", text: "تعديل" });
      const reset = el("button", { class: "btn light sm", type: "button", text: "رقم جديد" });
      const tog = el("button", { class: "btn light sm", type: "button", text: u.active ? "إيقاف" : "تفعيل" });
      const del = el("button", { class: "btn light sm", type: "button", text: "حذف", style: "color:var(--danger)" });
      edit.onclick = () => {
        $("#uId").value = u.id; $("#uName").value = u.name; $("#uUser").value = u.username; $("#uRole").value = u.role;
        permTypes(u.perms.inquiries); setPermBoxes(u.perms); $("#uTitle").value = u.title || ""; $("#uTitleF").hidden = u.role !== "أخرى";
        $("#userFormTitle").textContent = "تعديل " + u.name; $("#userSave").textContent = "حفظ التعديل"; $("#secretBox").hidden = true; $("#uName").focus();
      };
      reset.onclick = async () => { if (!(await A.ask("إنشاء رقم سري مؤقت جديد لـ " + u.name + "؟ سيتوقف رقمه الحالي."))) return; try { const d = await api({ action: "users-reset", id: u.id }); showSecret(u.name, d.username, d.tempPassword); usersLoad(); } catch (e) { toast(e.message); } };
      tog.onclick = async () => { try { const d = await api({ action: "users-toggle", id: u.id }); toast(d.active ? "تم تفعيل الحساب." : "تم إيقاف الحساب، وخرج من اللوحة فورًا."); usersLoad(); } catch (e) { toast(e.message); } };
      del.onclick = async () => { if (!(await A.ask("حذف حساب " + u.name + " نهائيًا؟"))) return; try { await api({ action: "users-delete", id: u.id }); toast("تم حذف الحساب."); usersLoad(); } catch (e) { toast(e.message); } };
      box.append(el("div", { class: "row-item", "data-id": u.id },
        el("span", { class: "who-av", text: (u.name.replace(/^أ\.\s*/, "").trim()[0]) || "؟", style: "background:" + colors[i % colors.length] }),
        el("div", { class: "tx" }, el("b", {}, u.name + " ", el("span", { class: "st-chip " + (u.active ? "st-active" : "badge-off"), text: u.active ? (u.mustChange ? "بانتظار أول دخول" : "نشط") : "موقوف" })),
          el("small", { text: (u.role === "أخرى" && u.title ? u.title : u.role) + " · " + u.username + " · " + permText(u.perms) + (u.lastLogin ? " · آخر دخول " + fmtDate(u.lastLogin) : "") })),
        el("div", { class: "row-actions" }, edit, reset, tog, del)));
    });
  }
  async function usersLoad() {
    try {
      const d = await api({ action: "users-list" }); users = d.items || [];
      if (!roles.length) { roles = d.roles; types = d.types; const r = $("#uRole"); roles.forEach((x) => r.append(el("option", { text: x }))); applyPreset(r.value); }
      slotsDef = d.slots || {};
      usersRender(); slotsRender();
    } catch (e) { toast(e.message); }
  }
  $("#userReset").addEventListener("click", userReset);
  $("#userForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const err = $("#userErr"); err.textContent = "";
    const checked = [...$("#pTypes").querySelectorAll("input:checked")].map((c) => c.value);
    const perms = { inquiries: checked.length === types.length ? "all" : checked, ...Object.fromEntries(Object.entries(PERM_IDS).map(([k, id]) => [k, $(id).checked])) };
    const btn = $("#userSave"); busy(btn, true, "جارٍ الحفظ…");
    try {
      const id = $("#uId").value;
      const d = await api({ action: "users-save", id: id || undefined, name: $("#uName").value, username: $("#uUser").value, role: $("#uRole").value, title: $("#uTitle").value, perms });
      if (d.tempPassword) showSecret($("#uName").value, d.username, d.tempPassword); else toast("تم حفظ التعديل.");
      userReset(); usersLoad();
    } catch (ex) { err.textContent = ex.message; } finally { busy(btn, false); }
  });

  // =====================================================================
  // الإعدادات: حفظ البيانات + التقويم الدراسي
  // =====================================================================
  async function settingsLoad() {
    try { const d = await api({ action: "settings-get" }); $("#retDays").value = String(d.settings.archiveDays); $("#retMask").checked = !!d.settings.maskPhones; } catch {}
  }
  $("#retForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const btn = $("#retSave"); busy(btn, true, "…");
    try { const d = await api({ action: "settings-save", archiveDays: +$("#retDays").value, maskPhones: $("#retMask").checked }); A.setSettings(d.settings); A.reloadInquiries(); toast("تم حفظ الإعدادات."); }
    catch (ex) { toast(ex.message); } finally { busy(btn, false); }
  });
  $("#purgeBtn").addEventListener("click", async () => {
    const n = A.items().filter((i) => i.archived).length;
    if (!n) { toast("لا توجد استفسارات مؤرشفة للحذف."); return; }
    if (!(await A.ask(`سيتم تنزيل نسخة احتياطية ثم حذف ${n} استفسارًا مؤرشفًا نهائيًا. متابعة؟`))) return;
    const btn = $("#purgeBtn"); busy(btn, true, "جارٍ التنفيذ…");
    try { await A.downloadBackup(); const d = await api({ action: "purge-archive", confirm: "حذف" }); toast(`تم حذف ${d.deleted} استفسارًا، ونُزّلت نسخة احتياطية قبل الحذف.`); A.reloadInquiries(); }
    catch (ex) { toast(ex.message); } finally { busy(btn, false); }
  });

  // التقويم المعتمد 1448هـ (مكة – المدينة – جدة – الطائف) — نفس بيانات الساعة في صفحة الطلاب
  const DEFAULT_CAL = {
    terms: [{ name: "الفصل الأول", start: "2026-08-30", end: "2027-01-07" }, { name: "الفصل الثاني", start: "2027-01-17", end: "2027-07-01" }],
    breaks: [
      { name: "إجازة اليوم الوطني", from: "2026-09-23", to: "2026-09-24" },
      { name: "إجازة إضافية", from: "2026-10-25", to: "2026-10-25" },
      { name: "إجازة الخريف", from: "2026-11-20", to: "2026-11-28" },
      { name: "إجازة منتصف العام الدراسي", from: "2027-01-08", to: "2027-01-16" },
      { name: "إجازة يوم التأسيس", from: "2027-02-21", to: "2027-02-22" },
      { name: "إجازة عيد الفطر", from: "2027-02-26", to: "2027-03-13" },
      { name: "إجازة عيد الأضحى", from: "2027-04-30", to: "2027-05-22" },
      { name: "إجازة نهاية العام الدراسي", from: "2027-07-02", to: "2027-08-28", startNote: "بنهاية دوام الخميس", shownFrom: "2027-07-01" },
    ],
  };
  const backDay = (to) => { let d = addDays(to, 1); while (dow(d) === 5 || dow(d) === 6) d = addDays(d, 1); return d; };
  // أسابيع الفصل: كل أحد من البداية حتى النهاية، ما لم يكن الأسبوع كله إجازة
  function termWeeks(t, breaks) {
    const inBreak = (d) => breaks.some((b) => b.from && b.to && d >= b.from && d <= b.to);
    const out = [];
    for (let s = t.start; s <= t.end; s = addDays(s, 7)) {
      let school = false; for (let i = 0; i < 5; i++) { const d = addDays(s, i); if (d <= t.end && !inBreak(d)) school = true; }
      if (school) out.push(s);
    }
    return out;
  }
  let cal = null, calIsDefault = true;
  function calRender() {
    $("#calState").textContent = calIsDefault ? "يعمل الموقع حاليًا بالتقويم المعتمد 1448هـ المدمج. أي تعديل تحفظه هنا يحلّ محله." : "يعمل الموقع بالتقويم الذي حفظته من هنا.";
    const tb = $("#calTerms"); tb.textContent = "";
    cal.terms.forEach((t, i) => {
      const s = el("input", { type: "date", value: t.start }), e = el("input", { type: "date", value: t.end }), n = el("input", { type: "text", value: t.name, maxlength: "40" });
      const wk = el("span", { class: "wk" });
      const upd = () => { t.name = n.value; t.start = s.value; t.end = e.value; wk.textContent = t.start && t.end ? (dow(t.start) !== 0 ? "⚠ البداية يجب أن تكون يوم أحد" : termWeeks(t, cal.breaks).length + " أسبوعًا دراسيًا") : ""; };
      [s, e, n].forEach((x) => x.addEventListener("input", upd)); upd();
      tb.append(el("div", { class: "ct" }, n, el("label", { text: "بداية الفصل (يوم أحد)" }), s, el("label", { text: "آخر يوم دراسي" }), e, wk));
    });
    const body = $("#calBreaks"); body.textContent = "";
    cal.breaks.forEach((b, i) => {
      const n = el("input", { type: "text", value: b.name, maxlength: "60" }), f = el("input", { type: "date", value: b.from }), t = el("input", { type: "date", value: b.to });
      const bk = el("td", { class: "bk" }); const x = el("button", { class: "ib del", type: "button", "aria-label": "حذف الإجازة", text: "×" });
      const upd = () => { b.name = n.value; b.from = f.value; b.to = t.value; bk.textContent = b.to ? fmtDay(backDay(b.to)) : "—"; };
      [n, f, t].forEach((y) => y.addEventListener("input", () => { upd(); if (y !== n) calRenderWeeks(); })); upd();
      x.onclick = () => { cal.breaks.splice(i, 1); calRender(); };
      body.append(el("tr", {}, el("td", {}, n), el("td", {}, f), el("td", {}, t), bk, el("td", {}, x)));
    });
  }
  const calRenderWeeks = () => $("#calTerms").querySelectorAll(".ct input[type=text]").forEach((i) => i.dispatchEvent(new Event("input")));
  async function calLoad() {
    try { const d = await api({ action: "cal-get" }); calIsDefault = !d.calendar; cal = JSON.parse(JSON.stringify(d.calendar || DEFAULT_CAL)); calRender(); } catch (e) { toast(e.message); }
  }
  // استيراد التقويم من Excel أو CSV أو PDF
  $("#calTemplate").addEventListener("click", () => {
    const rows = [["النوع", "الاسم", "من", "إلى"], ...cal.terms.map((t) => ["فصل", t.name, t.start, t.end]), ...cal.breaks.map((b) => ["إجازة", b.name, b.from, b.to])];
    download("نموذج-التقويم.csv", new Blob(["\ufeff" + rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  });
  $("#calFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; const info = $("#calImpInfo"); $("#calErr").textContent = ""; info.textContent = ""; if (!f) return;
    info.textContent = "⏳ جارٍ قراءة الملف…";
    try {
      const r = A.importer.parseCalendar(await A.importer.readFile(f));
      if (!r.breaks.length && !r.terms.length) throw new Error("لم أجد تواريخ إجازات أو فصول في الملف. استخدم «تنزيل نموذج» أو ملفًا فيه اسم الإجازة وتاريخ بدايتها ونهايتها (ميلادي أو هجري).");
      if (r.terms.length) r.terms.forEach((t, i) => { cal.terms[i] = { name: t.name, start: t.start || cal.terms[i]?.start || "", end: t.end || cal.terms[i]?.end || "" }; });
      if (r.breaks.length) cal.breaks = r.breaks.map((b) => ({ name: b.name, from: b.from, to: b.to }));
      calRender();
      const nb = r.breaks.length, nt = r.terms.length;
      info.textContent = "✓ قُرئ من الملف: " + nb + (nb >= 3 && nb <= 10 ? " إجازات" : " إجازة") + (nt ? " و" + nt + (nt === 2 ? " فصلان" : nt >= 3 ? " فصول" : " فصل") : "") + ". راجع التواريخ في الجدول ثم اضغط «حفظ التقويم»." + (r.skipped.length ? " (تجاهلت " + r.skipped.length + " سطرًا لم أفهمه)" : "");
    } catch (ex) { info.textContent = ""; $("#calErr").textContent = ex.message; } finally { e.target.value = ""; }
  });
  $("#calAdd").addEventListener("click", () => { cal.breaks.push({ name: "", from: "", to: "" }); calRender(); const r = $("#calBreaks").lastElementChild; r && r.querySelector("input").focus(); });
  $("#calReset").addEventListener("click", async () => {
    if (!(await A.ask("الرجوع إلى التقويم المعتمد 1448هـ المدمج في الموقع؟"))) return;
    try { await api({ action: "cal-save", reset: true }); toast("عاد الموقع إلى التقويم المعتمد."); calLoad(); } catch (e) { toast(e.message); }
  });
  $("#calSave").addEventListener("click", async () => {
    $("#calErr").textContent = ""; const btn = $("#calSave"); busy(btn, true, "جارٍ الحفظ…");
    try { await api({ action: "cal-save", calendar: cal }); toast("تم حفظ التقويم، وتتحدث الساعة في صفحة الطلاب خلال دقيقة."); calLoad(); }
    catch (ex) { $("#calErr").textContent = ex.message; } finally { busy(btn, false); }
  });

  // =====================================================================
  // الأسئلة الشائعة
  // =====================================================================
  let FAQ_CATS = ["المنصات", "كلمة المرور", "تيمز", "عام"];
  let faqs = [];
  function faqRender() {
    const box = $("#faqList"); box.textContent = "";
    if (!faqs.length) box.append(el("p", { class: "card empty", text: "لا توجد أسئلة. اضغط «+ سؤال جديد»." }));
    const fq = $("#faqAdmQ").value.trim(), fc = $("#faqAdmCat").value;
    const cats = [...new Set([...FAQ_CATS, ...faqs.map((f) => f.cat).filter(Boolean)])];
    const sel = $("#faqAdmCat"), cur = sel.value; sel.textContent = ""; sel.append(el("option", { value: "", text: "كل التصنيفات (" + faqs.length + ")" }));
    cats.forEach((c) => sel.append(el("option", { value: c, text: c + " (" + faqs.filter((f) => f.cat === c).length + ")" }))); sel.value = cur;
    const dl = $("#faqCatsList"); dl.textContent = ""; cats.forEach((c) => dl.append(el("option", { value: c })));
    let shown = 0;
    faqs.forEach((f, i) => {
      if ((fc && f.cat !== fc) || (fq && !(f.q + " " + f.a).includes(fq))) return;
      shown++;
      const cat = el("input", { type: "text", value: f.cat || "عام", list: "faqCatsList", maxlength: "30", "aria-label": "التصنيف", title: "اختر تصنيفًا أو اكتب تصنيفًا جديدًا" });
      const q = el("input", { type: "text", value: f.q, maxlength: "200", placeholder: "السؤال" });
      const a = el("textarea", { maxlength: "1500", placeholder: "الإجابة" }); a.value = f.a;
      const link = el("input", { type: "text", value: f.link || "", maxlength: "400", placeholder: "رابط مفيد (اختياري) https://", dir: "ltr", class: "fq-link", style: "text-align:right" });
      cat.oninput = () => f.cat = cat.value; q.oninput = () => f.q = q.value; a.oninput = () => f.a = a.value; link.oninput = () => f.link = link.value.trim();
      const up = el("button", { class: "ib", type: "button", title: "للأعلى", text: "↑" }), dn = el("button", { class: "ib", type: "button", title: "للأسفل", text: "↓" });
      const hide = el("button", { class: "ib txt", type: "button", title: f.hidden ? "السؤال مخفي عن الطلاب، اضغط لإظهاره" : "إخفاء عن الطلاب", text: f.hidden ? "إظهار" : "إخفاء" });
      const del = el("button", { class: "ib del", type: "button", title: "حذف", text: "×" });
      up.onclick = () => { if (i) { [faqs[i - 1], faqs[i]] = [faqs[i], faqs[i - 1]]; faqRender(); } };
      dn.onclick = () => { if (i < faqs.length - 1) { [faqs[i + 1], faqs[i]] = [faqs[i], faqs[i + 1]]; faqRender(); } };
      hide.onclick = () => { f.hidden = !f.hidden; faqRender(); };
      del.onclick = async () => { if (await A.ask("حذف هذا السؤال؟ (يُحذف نهائيًا بعد «حفظ ونشر»)")) { faqs.splice(i, 1); faqRender(); } };
      box.append(el("div", { class: "fq" + (f.hidden ? " off" : "") }, el("div", { class: "fq-main" }, cat, q, a, link), el("div", { class: "fq-tools" }, up, dn, hide, del)));
    });
    $("#faqCount").textContent = shown === faqs.length ? "" : "يظهر " + shown + " من " + faqs.length;
  }
  $("#faqAdmQ").addEventListener("input", () => faqRender()); $("#faqAdmCat").addEventListener("change", () => faqRender());
  async function faqLoad() { try { const d = await api({ action: "faq-list" }); faqs = d.items; if (d.cats) FAQ_CATS = d.cats; $("#faqDefaultNote").hidden = !d.isDefault; faqRender(); } catch (e) { toast(e.message); } }
  $("#faqAdd").addEventListener("click", () => { faqs.unshift({ cat: $("#faqAdmCat").value || "عام", q: "", a: "", link: "" }); $("#faqAdmQ").value = ""; faqRender(); $("#faqList input[type=text]:nth-child(2)")?.focus(); });
  $("#faqSave").addEventListener("click", async () => {
    $("#faqErr").textContent = ""; const btn = $("#faqSave"); busy(btn, true, "جارٍ الحفظ…");
    try { const d = await api({ action: "faq-save", items: faqs }); faqs = d.items; $("#faqDefaultNote").hidden = true; faqRender(); toast("تم نشر الأسئلة الشائعة."); }
    catch (ex) { $("#faqErr").textContent = ex.message; } finally { busy(btn, false); }
  });

  // =====================================================================
  // الجداول الدراسية والاختبارات
  // =====================================================================
  const DEF_TIMES = ["07:00", "07:50", "08:40", "09:45", "10:35", "11:25", "12:15", "13:00"];
  const SUBJECTS = ["القرآن الكريم", "التفسير", "الحديث", "الفقه", "التوحيد", "لغتي", "الكفايات اللغوية", "الأدب", "النحو", "الرياضيات", "الفيزياء", "الكيمياء", "الأحياء", "علم البيئة", "علوم الأرض والفضاء",
    "اللغة الإنجليزية", "التاريخ", "الجغرافيا", "الدراسات الاجتماعية", "التقنية الرقمية", "علوم الحاسب", "الذكاء الاصطناعي", "التربية البدنية", "التربية المهنية", "المهارات الحياتية", "التفكير الناقد", "التربية الصحية", "الإدارة المالية", "التصميم", "القانون", "النشاط"];
  SUBJECTS.forEach((s) => $("#subjects").append(el("option", { value: s })));
  let tt = { periods: [], sections: {} };
  fillSections($("#ttSection")); fillSections($("#exSection"), "كل شعب الصف");
  function periodsRender() {
    const n = +$("#pCount").value; const box = $("#periodsEd"); box.textContent = "";
    while (tt.periods.length < n) tt.periods.push({ start: DEF_TIMES[tt.periods.length] || "", end: "" });
    tt.periods.length = n;
    tt.periods.forEach((p, i) => {
      const s = el("input", { type: "time", value: p.start }), e = el("input", { type: "time", value: p.end, title: "نهاية الحصة (اختياري)" });
      s.oninput = () => { p.start = s.value; ttGrid(); }; e.oninput = () => p.end = e.value;
      box.append(el("div", {}, el("small", { text: "الحصة " + (i + 1) }), s, e));
    });
    const ex = $("#exPeriod"); ex.textContent = ""; ex.append(el("option", { value: "", text: "—" }));
    tt.periods.forEach((_, i) => ex.append(el("option", { value: String(i + 1), text: "الحصة " + (i + 1) })));
    ttGrid();
  }
  let grid = [];
  function ttGrid() {
    const sec = $("#ttSection").value, n = tt.periods.length;
    const src = tt.sections[sec] || [];
    grid = DAYS.map((_, d) => Array.from({ length: n }, (_, p) => (grid.sec === sec && grid[d]?.[p] != null ? grid[d][p] : src[d]?.[p] || "")));
    grid.sec = sec;
    const t = $("#ttGrid"); t.textContent = "";
    t.append(el("tr", {}, el("th", {}), ...tt.periods.map((p, i) => el("th", {}, "الحصة " + (i + 1), el("small", { text: p.start || "" })))));
    DAYS.forEach((d, di) => t.append(el("tr", {}, el("td", { class: "day", text: d }), ...grid[di].map((v, pi) => {
      const inp = el("input", { type: "text", value: v, list: "subjects", maxlength: "30", placeholder: " ", "aria-label": d + " الحصة " + (pi + 1) });
      inp.oninput = () => { grid[di][pi] = inp.value; };
      return el("td", {}, inp);
    }))));
    const filled = Object.keys(tt.sections).length;
    $("#ttInfo").textContent = (tt.sections[sec] ? "محفوظ" : "لا يوجد جدول محفوظ لهذه الشعبة") + " · " + filled + " من " + SECTIONS.length + " شعبة لها جدول" + (tt.updatedAt ? " · آخر تحديث " + fmtDate(tt.updatedAt) : "");
    const cp = $("#ttCopy"); cp.textContent = ""; cp.append(el("option", { value: "", text: "نسخ من شعبة…" }));
    Object.keys(tt.sections).filter((s) => s !== sec).forEach((s) => cp.append(el("option", { value: s, text: "الشعبة " + s })));
  }
  async function ttLoad() {
    try {
      tt = (await api({ action: "tt-get" })).timetable; tt.sections = tt.sections || {};
      if (!tt.periods?.length) tt.periods = DEF_TIMES.slice(0, 7).map((s) => ({ start: s, end: "" }));
      $("#pCount").value = String(Math.min(8, Math.max(5, tt.periods.length)));
      grid = []; periodsRender();
    } catch (e) { toast(e.message); }
  }
  $("#pCount").addEventListener("change", periodsRender);
  $("#ttSection").addEventListener("change", () => { grid = []; ttGrid(); });
  $("#ttCopy").addEventListener("change", () => { const s = $("#ttCopy").value; if (!s) return; grid = JSON.parse(JSON.stringify(tt.sections[s])); grid.sec = $("#ttSection").value; ttGrid(); toast("نُسخ جدول الشعبة " + s + ". راجعه ثم اضغط حفظ."); });
  $("#ttClear").addEventListener("click", () => { grid = DAYS.map(() => tt.periods.map(() => "")); grid.sec = $("#ttSection").value; ttGrid(); });
  $("#ttSave").addEventListener("click", async () => {
    const btn = $("#ttSave"); busy(btn, true, "جارٍ الحفظ…");
    try { const d = await api({ action: "tt-save", periods: tt.periods, section: $("#ttSection").value, grid }); tt = d.timetable; grid = []; ttGrid(); toast("تم حفظ جدول الشعبة " + $("#ttSection").value + "."); }
    catch (ex) { toast(ex.message); } finally { busy(btn, false); }
  });
  $("#ttTemplate").addEventListener("click", () => {
    const n = tt.periods.length || 7;
    const rows = [["الشعبة", "اليوم", ...Array.from({ length: n }, (_, i) => String(i + 1))]];
    SECTIONS.forEach((s) => DAYS.forEach((d) => rows.push([s, d, ...Array(n).fill("")])));
    download("نموذج-الجداول.csv", new Blob(["﻿" + rows.map((r) => r.join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  });
  // استيراد الجداول من Excel أو CSV أو PDF (صفوف «الشعبة، اليوم، الحصص» أو جدول مستقل لكل شعبة)
  $("#ttFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; $("#ttErr").textContent = ""; $("#ttImpPreview").textContent = ""; if (!f) return;
    const box = $("#ttImpPreview"); box.append(el("p", { class: "hint", text: "⏳ جارٍ قراءة الملف…" }));
    try {
      const r = A.importer.parseTimetable(await A.importer.readFile(f));
      box.textContent = "";
      if (!r.count) throw new Error("لم أجد جداول في الملف. يلزم سطر عناوين فيه أرقام الحصص (1، 2، 3…) وأسماء الأيام، مع عمود «الشعبة» أو عنوان مثل «الشعبة 14» فوق كل جدول." + (r.warnings.length ? " (" + r.warnings.join("، ") + ")" : ""));
      const secs = Object.keys(r.sections).sort((x, y) => +x - +y);
      const n = r.periods.length;
      const timesFound = r.periods.filter(Boolean).length;
      const tbl = el("table", { class: "imp-tbl" }, el("tr", {}, el("th", { text: "الشعبة" }), el("th", { text: "الحصص المعبأة" }), el("th", { text: "مثال (الأحد)" })),
        ...secs.map((s) => { const g = r.sections[s]; const filled = g.flat().filter(Boolean).length; return el("tr", {}, el("td", { text: s }), el("td", { text: filled + " من " + g.length * n }), el("td", { text: g[0].filter(Boolean).slice(0, 4).join(" · ") || "—" })); }));
      const go = el("button", { class: "btn sm", type: "button", text: `اعتماد جداول ${secs.length} شعبة` });
      box.append(el("p", { class: "notice info", style: "margin:10px 0" }, `وُجدت جداول ${secs.length} شعبة بعدد ${n} حصص` + (timesFound ? ` (مع أوقات ${timesFound} حصص)` : "") + ". الشعب غير الموجودة في الملف لن تتغير." + (r.warnings.length ? " تنبيه: " + r.warnings.join("، ") : "")),
        el("div", { class: "table-wrap", style: "max-height:260px;margin-bottom:10px" }, tbl), go);
      go.onclick = async () => {
        busy(go, true, "جارٍ الحفظ…");
        try {
          const periods = Array.from({ length: Math.max(n, tt.periods.length) }, (_, i) => ({ start: r.periods[i] || tt.periods[i]?.start || DEF_TIMES[i] || "", end: tt.periods[i]?.end || "" }));
          const d = await api({ action: "tt-save", periods, bulk: r.sections }); tt = d.timetable; grid = []; $("#pCount").value = String(Math.min(8, Math.max(5, tt.periods.length))); periodsRender(); box.textContent = ""; toast("تم استيراد جداول " + secs.length + " شعبة.");
        } catch (ex) { $("#ttErr").textContent = ex.message; busy(go, false); }
      };
    } catch (ex) { box.textContent = ""; $("#ttErr").textContent = ex.message; } finally { e.target.value = ""; }
  });

  // الاختبارات
  let exams = [];
  function exReset() { $("#exForm").reset(); $("#exId").value = ""; $("#exFormTitle").textContent = "اختبار أو تسليم جديد"; $("#exSave").textContent = "حفظ"; $("#exErr").textContent = ""; $("#exDate").value = addDays(today(), 7); }
  function exRender() {
    const box = $("#exList"); box.textContent = ""; const t = today();
    const up = exams.filter((e) => e.date >= t);
    if (!up.length) { box.append(el("p", { class: "empty", text: "لا توجد اختبارات قادمة." })); return; }
    up.forEach((x) => {
      const days = Math.round((Date.parse(x.date) - Date.parse(t)) / 864e5);
      const edit = el("button", { class: "btn light sm", type: "button", text: "تعديل" }), del = el("button", { class: "btn light sm", type: "button", text: "حذف", style: "color:var(--danger)" });
      edit.onclick = () => { $("#exId").value = x.id; $("#exSubject").value = x.subject; $("#exKind").value = x.kind; $("#exDate").value = x.date; $("#exPeriod").value = x.period ? String(x.period) : ""; $("#exGrade").value = x.grade || ""; $("#exSection").value = x.section || ""; $("#exNote").value = x.note || ""; $("#exFormTitle").textContent = "تعديل " + x.subject; $("#exSave").textContent = "حفظ التعديل"; };
      del.onclick = async () => { if (!(await A.ask("حذف «" + x.subject + "»؟"))) return; try { await api({ action: "exam-delete", id: x.id }); exLoad(); } catch (e) { toast(e.message); } };
      box.append(el("div", { class: "row-item", style: "--c:" + (days <= 3 ? "#D93A2B" : days <= 10 ? "#F5A700" : "#2D8CFF") }, el("span", { class: "bar" }),
        el("div", { class: "tx" }, el("b", { text: x.subject + " · " + x.kind }), el("small", { text: fmtDay(x.date) + (x.period ? " · الحصة " + x.period : "") + " · " + (x.section ? "الشعبة " + x.section : x.grade) + (x.note ? " · " + x.note : "") })),
        el("span", { class: "st-chip st-sched", text: days === 0 ? "اليوم" : days === 1 ? "غدًا" : days === 2 ? "بعد يومين" : days <= 10 ? "بعد " + days + " أيام" : "بعد " + days + " يومًا" }),
        el("div", { class: "row-actions" }, edit, del)));
    });
  }
  async function exLoad() {
    try { const d = await api({ action: "exams-list" }); exams = d.items || []; const k = $("#exKind"); if (!k.options.length) d.kinds.forEach((x) => k.append(el("option", { text: x }))); exRender(); } catch (e) { toast(e.message); }
  }
  $("#exGrade").addEventListener("change", () => {
    const g = $("#exGrade").value, sel = $("#exSection"), cur = sel.value; sel.textContent = ""; sel.append(el("option", { value: "", text: "كل شعب الصف" }));
    SECTIONS.forEach((s) => sel.append(el("option", { value: s, text: "الشعبة " + s }))); sel.value = cur;
  });
  $("#exReset").addEventListener("click", exReset);
  $("#exForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#exErr").textContent = ""; const btn = $("#exSave"); busy(btn, true, "جارٍ الحفظ…");
    try {
      await api({ action: "exam-save", id: $("#exId").value || undefined, subject: $("#exSubject").value, kind: $("#exKind").value, date: $("#exDate").value, period: $("#exPeriod").value || null, grade: $("#exGrade").value, section: $("#exSection").value, note: $("#exNote").value });
      toast("تم الحفظ."); exReset(); exLoad();
    } catch (ex) { $("#exErr").textContent = ex.message; } finally { busy(btn, false); }
  });

  // =====================================================================
  // لوحة المؤشرات
  // =====================================================================
  const thisMonth = () => today().slice(0, 7);
  $("#dashMonth").value = thisMonth(); $("#repMonth").value = thisMonth();
  $("#dashMonth").max = thisMonth(); $("#repMonth").max = thisMonth();
  function bars(box, rows, label, val) {
    box.textContent = ""; const max = Math.max(1, ...rows.map(val));
    rows.forEach((r) => box.append(el("div", { class: "hbar" }, el("span", { text: label(r) }), el("span", { class: "tr" }, el("i", { style: `width:${(val(r) / max * 100).toFixed(1)}%` })), el("b", { text: String(val(r)) }))));
  }
  function trendSvg(weeks) {
    const W = 520, H = 170, L = 26, R = 10, T = 14, B = 26;
    const vals = weeks.map((w) => w.avgResponseH);
    const real = vals.filter((v) => v != null);
    if (!real.length) return '<p class="empty" style="padding:30px 0">لا توجد ردود كافية بعد.</p>';
    const max = Math.max(4, Math.ceil(Math.max(...real) / 4) * 4);
    const x = (i) => L + i * (W - L - R) / (weeks.length - 1), y = (v) => T + (H - T - B) * (1 - v / max);
    let grid = "";
    for (let g = 0; g <= 2; g++) { const v = max * g / 2, yy = y(v); grid += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E6EDF5"/><text x="${L - 6}" y="${yy + 4}" font-size="10" fill="#7A8CA3" text-anchor="end">${Math.round(v)}</text>`; }
    const pts = weeks.map((w, i) => (w.avgResponseH == null ? null : [x(i), y(w.avgResponseH)])).filter(Boolean);
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const lbl = weeks.map((w, i) => `<text x="${x(i)}" y="${H - 8}" font-size="10" fill="#7A8CA3" text-anchor="middle">${w.end.slice(8, 10)}/${+w.end.slice(5, 7)}</text>`).join("");
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="متوسط زمن أول رد لآخر 8 أسابيع">${grid}<path d="${path}" fill="none" stroke="#2D8CFF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#2D8CFF"/>`).join("")}<circle cx="${last[0]}" cy="${last[1]}" r="5.5" fill="#fff" stroke="#2D8CFF" stroke-width="2.5"/><text x="${last[0] - 8}" y="${last[1] - 10}" font-size="12" font-weight="700" fill="#0B2545" text-anchor="end">${hrs(weeks[weeks.length - 1].avgResponseH ?? real[real.length - 1])}</text>${lbl}</svg>`;
  }
  let lastStats = null;
  async function dashLoad() {
    const m = $("#dashMonth").value || thisMonth();
    try {
      const s = (await api({ action: "stats", month: m })).stats; lastStats = s;
      const hijriToday = fmtHijri(today());
      $("#dashSub").textContent = (hijriToday ? hijriToday + "هـ · " : "") + monthName(m) + " · " + (me().owner || me().perms.inquiries === "all" ? "كل الاستفسارات" : "ضمن صلاحياتك");
      const k = $("#kpis"); k.textContent = "";
      const kpi = (label, val, note, cls, valCls) => k.append(el("div", { class: "kpi" }, el("small", { text: label }), el("b", { class: valCls || "", text: val }), el("em", { class: cls || "", text: note })));
      kpi("استفسارات " + (m === thisMonth() ? "هذا الشهر" : monthName(m)), String(s.total), s.change == null ? (s.prevTotal ? "" : "لا بيانات للشهر السابق") : (s.change >= 0 ? "↑ " : "↓ ") + Math.abs(s.change) + "% عن الشهر السابق", s.change == null ? "" : s.change > 0 ? "down" : "up");
      kpi("بانتظار الرد", String(s.waiting), s.oldestWaiting ? "أقدمها " + ago(s.oldestWaiting) : "لا يوجد ما ينتظر", "", s.waiting ? "warn" : "");
      kpi("متوسط زمن أول رد", hrs(s.avgResponseH), s.prevAvgResponseH != null && s.avgResponseH != null ? (s.avgResponseH <= s.prevAvgResponseH ? "↓ أسرع من " : "↑ أبطأ من ") + hrs(s.prevAvgResponseH) + " الشهر السابق" : "", s.prevAvgResponseH != null && s.avgResponseH != null ? (s.avgResponseH <= s.prevAvgResponseH ? "up" : "down") : "");
      kpi("رضا الطلاب", s.rating.avg != null ? s.rating.avg + " ★" : "—", s.rating.count ? "من " + s.rating.count + " تقييمًا" : "لا تقييمات هذا الشهر");
      $("#byTypeSub").textContent = monthName(m) + " · العدد";
      bars($("#byType"), s.byType.filter((r) => r.n || s.total === 0).slice(0, 7), (r) => r.type, (r) => r.n);
      $("#byGradeSub").textContent = monthName(m);
      bars($("#byGrade"), s.byGrade, (r) => r.grade.replace(" الثانوي", ""), (r) => r.n);
      const bs = $("#bySection"); bs.textContent = "";
      if (!s.bySection.length) bs.append(el("span", { class: "hint", style: "background:none", text: "—" }));
      s.bySection.forEach((r) => bs.append(el("span", { text: "الشعبة " + r.section + " · " + r.n })));
      $("#trend").innerHTML = trendSvg(s.weeks);
      const at = $("#attention"); at.textContent = "";
      if (!s.attention.length) at.append(el("p", { class: "empty", text: "لا يوجد ما يحتاج انتباهك الآن 👏" }));
      s.attention.forEach((i) => {
        const b = el("button", { class: "att", type: "button" },
          el("div", { class: "tx" }, el("b", {}, el("span", { class: "mono", text: i.ticket }), " · " + i.type), el("small", {}, i.name + " · " + i.grade.replace(" الثانوي", "") + " · الشعبة " + i.section + " · ", el("span", { class: "why", text: i.reason }))),
          el("span", { class: "age", text: ago(i.updatedAt) }));
        b.onclick = () => { A.selectTab("complaints"); A.openItem(i.key); };
        at.append(b);
      });
    } catch (e) { toast(e.message); }
  }
  $("#dashMonth").addEventListener("change", dashLoad);
  $("#dashReport").addEventListener("click", () => { $("#repMonth").value = $("#dashMonth").value; A.selectTab("report"); });

  // =====================================================================
  // التقرير الشهري
  // =====================================================================
  async function repLoad() {
    const m = $("#repMonth").value || thisMonth(); const box = $("#report");
    box.textContent = ""; box.append(el("p", { class: "empty", text: "جارٍ إعداد التقرير…" }));
    try {
      const s = (await api({ action: "stats", month: m })).stats;
      box.textContent = "";
      const table = (head, rows) => el("table", {}, el("tr", {}, ...head.map((h) => el("th", { text: h }))), ...rows.map((r) => el("tr", {}, ...r.map((c) => el("td", { text: String(c) })))));
      const pct = (n) => (s.total ? Math.round(n / s.total * 100) + "%" : "—");
      const topType = s.byType.find((r) => r.n);
      const summary = s.total
        ? `استقبل الدعم الطلابي خلال ${monthName(m)} ${s.total} استفسارًا` + (s.change != null ? ` (${s.change >= 0 ? "بزيادة" : "بانخفاض"} ${Math.abs(s.change)}% عن الشهر السابق)` : "") + `، أُغلق منها ${s.resolved} (${pct(s.resolved)}). ` +
          (s.avgResponseH != null ? `بلغ متوسط زمن أول رد ${hrs(s.avgResponseH)}` + (s.avgResolveH != null ? ` ومتوسط زمن الحل ${hrs(s.avgResolveH)}` : "") + ". " : "") +
          (topType ? `أكثر الاستفسارات تكرارًا: «${topType.type}» (${topType.n}). ` : "") +
          (s.rating.count ? `قيّم الطلاب الخدمة بمتوسط ${s.rating.avg} من 5 في ${s.rating.count} تقييمًا.` : "")
        : `لم تُسجّل استفسارات خلال ${monthName(m)}.`;
      box.append(
        el("header", {}, el("div", {}, el("h2", { text: "التقرير الشهري للدعم الطلابي" }), el("p", { class: "sub", style: "margin:4px 0 0", text: "ثانوية بلاط الشهداء الثانوية · " + monthName(m) })),
          el("div", { class: "sub", style: "text-align:left;font-size:13px" }, "تاريخ الإعداد: " + fmtDay(today()), el("br"), "أعدّه: " + me().name)),
        el("div", { class: "rk" },
          ...[["عدد الاستفسارات", s.total], ["المغلقة والمحلولة", s.resolved], ["متوسط أول رد", hrs(s.avgResponseH)], ["رضا الطلاب", s.rating.avg != null ? s.rating.avg + " / 5" : "—"]].map(([a, b]) => el("div", {}, el("small", { text: a }), el("b", { text: String(b) })))),
        el("h3", { text: "الملخص" }), el("p", { class: "summary", text: summary }),
        el("h3", { text: "الاستفسارات حسب النوع" }), table(["النوع", "العدد", "النسبة"], s.byType.filter((r) => r.n).map((r) => [r.type, r.n, pct(r.n)]).concat(s.total ? [] : [["—", 0, "—"]])),
        el("h3", { text: "حسب الصف والشعبة" }), table(["الصف", "العدد", "النسبة"], s.byGrade.map((r) => [r.grade, r.n, pct(r.n)])),
        s.bySection.length ? el("p", { class: "sub", text: "الشعب الأكثر استفسارًا: " + s.bySection.map((r) => r.section + " (" + r.n + ")").join("، ") }) : "",
        el("h3", { text: "الحالات" }), table(["الحالة", "العدد"], ["جديد", "قيد المعالجة", "تم الرد", "تم الحل", "مغلق"].map((k) => [k, s.byStatus[k] || 0])),
        Object.keys(s.byResponder).length ? el("h3", { text: "الردود حسب الجهة" }) : "", Object.keys(s.byResponder).length ? table(["الجهة", "عدد الردود"], Object.entries(s.byResponder).sort((a, b) => b[1] - a[1])) : "",
        el("h3", { text: "رضا الطلاب" }),
        s.rating.count ? table(["التقييم", "العدد"], [5, 4, 3, 2, 1].map((n) => ["★".repeat(n), s.rating.stars[n - 1]]).concat(Object.entries(s.rating.tags).map(([t, n]) => ["وسم: " + t, n]))) : el("p", { class: "sub", text: "لا توجد تقييمات لهذا الشهر." }),
        s.comments.length ? el("div", {}, el("h3", { text: "من ملاحظات الطلاب" }), el("ul", {}, ...s.comments.map((c) => el("li", { text: "«" + c.note + "» — " + "★".repeat(c.stars) })))) : "",
        el("div", { class: "sign" }, el("div", { text: "مسؤول الدعم الطلابي" }), el("div", { text: "مدير المدرسة" })),
        el("div", { class: "rf" }, el("span", { text: "لا يتضمن التقرير أسماء الطلاب أو أرقام هوياتهم." }), el("span", { text: "دليل الطالب الرقمي" })));
    } catch (e) { box.textContent = ""; box.append(el("p", { class: "err", text: e.message })); }
  }
  $("#repMonth").addEventListener("change", repLoad);
  $("#repPrint").addEventListener("click", () => window.print());

  // =====================================================================
  // التحميل حسب الصلاحيات
  // =====================================================================
  let loaded = {};
  const once = (k, f) => () => { if (!loaded[k]) { loaded[k] = true; f(); } };
  onTab("dash", dashLoad); onTab("report", repLoad);
  onTab("ann", once("ann", () => { annReset(); annLoad(); }));
  onTab("faq", once("faq", faqLoad));
  onTab("sched", once("sched", () => { ttLoad(); exReset(); exLoad(); }));
  onTab("users", once("users", () => { userReset(); usersLoad(); settingsLoad(); calLoad(); }));
  A.loaders.push(() => {
    loaded = {};
    const cur = document.querySelector('.tab[aria-selected="true"]');
    if (cur) (A.onTab[cur.dataset.tab] || []).forEach((f) => f());
  });
})();
