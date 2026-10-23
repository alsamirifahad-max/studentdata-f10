// لوحة التحكم: الاستدعاءات، الفعاليات، لوحة الشرف، الاستطلاعات والمبادرات، المكتبة، التوقيت الذكي، ملصقات QR
(() => {
  "use strict";
  const A = window.ADM;
  const { el, toast, busy, fmtDate, $, SECTIONS } = A;
  const api = (b) => A.api(b);
  const TZ = "Asia/Riyadh";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dayDiff = (iso) => Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(today() + "T12:00:00Z")) / 864e5);
  const inDays = (n) => n < 0 ? "انتهى" : n === 0 ? "اليوم" : n === 1 ? "غدًا" : n === 2 ? "بعد يومين" : n <= 10 ? "بعد " + n + " أيام" : "بعد " + n + " يومًا";
  const fmtDay = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" }); } catch { return iso; } };
  const onTab = (name, f) => { (A.onTab[name] = A.onTab[name] || []).push(f); };
  const digits = (v) => String(v || "").replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x0660).replace(/\D/g, "");
  const btn = (text, cls, fn) => { const b = el("button", { class: "btn light sm" + (cls ? " " + cls : ""), type: "button", text }); b.onclick = fn; return b; };
  const delBtn = (fn) => { const b = btn("حذف", "", fn); b.style.color = "var(--danger)"; return b; };
  // تأكيد داخل الصفحة بضغطتين (بدلًا من نوافذ المتصفح)
  const twoStep = (b, fn) => { let armed = false, t; b.onclick = async () => { if (!armed) { armed = true; const old = b.textContent; b.textContent = "اضغط للتأكيد"; t = setTimeout(() => { armed = false; b.textContent = old; }, 3000); return; } clearTimeout(t); await fn(); }; return b; };
  const fillSections = (sel, first) => { sel.textContent = ""; if (first != null) sel.append(el("option", { value: "", text: first })); SECTIONS.forEach((s) => sel.append(el("option", { value: s, text: "الشعبة " + s }))); };

  // =====================================================================
  // استدعاء طالب
  // =====================================================================
  let calls = [];
  async function checkStudent() {
    const id = digits($("#cStudent").value); $("#cWho").textContent = "";
    if (id.length !== 10) { $("#cWho").textContent = "رقم الهوية 10 أرقام."; return null; }
    try { const d = await api({ action: "calls-student", studentId: id }); $("#cWho").textContent = "✓ " + d.student.name + " · " + d.student.grade + " · الشعبة " + d.student.section; return d.student; }
    catch (e) { $("#cWho").textContent = e.message; return null; }
  }
  $("#cCheck").addEventListener("click", checkStudent);
  $("#cStudent").addEventListener("change", checkStudent);
  document.querySelectorAll("#cQuick button").forEach((b) => b.addEventListener("click", () => { $("#cText").value = b.textContent; if (/الموجه/.test(b.textContent)) $("#cPlace").value = "مكتب الموجه الطلابي"; else if (/الوكيل/.test(b.textContent)) $("#cPlace").value = "مكتب الوكيل"; else if (/العيادة/.test(b.textContent)) $("#cPlace").value = "العيادة المدرسية"; }));
  function callReset() { $("#callForm").reset(); $("#cId").value = ""; $("#cWho").textContent = ""; $("#cExp").value = addDays(today(), 3); $("#callFormTitle").textContent = "استدعاء جديد"; $("#callSave").textContent = "إرسال الاستدعاء"; $("#callErr").textContent = ""; $("#cStudent").disabled = false; }
  function callRender() {
    const box = $("#callList"); box.textContent = "";
    const q = $("#callQ").value.trim(), t = today();
    const list = calls.filter((c) => !q || (c.name + " " + c.studentId).includes(q));
    const active = calls.filter((c) => c.expires >= t);
    $("#callStats").textContent = active.length + " ساري · " + active.filter((c) => c.seenAt).length + " اطّلع عليه الطالب";
    if (!list.length) { box.append(el("p", { class: "empty", text: "لا توجد استدعاءات." })); return; }
    list.forEach((c) => {
      const expired = c.expires < t;
      const edit = btn("تعديل", "", () => { $("#cId").value = c.id; $("#cStudent").value = c.studentId; $("#cStudent").disabled = true; $("#cWho").textContent = c.name; $("#cText").value = c.text; $("#cPlace").value = c.place || ""; $("#cWhen").value = c.when || ""; $("#cExp").value = c.expires; $("#callFormTitle").textContent = "تعديل استدعاء " + c.name; $("#callSave").textContent = "حفظ التعديل"; });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "calls-delete", id: c.id }); toast("تم حذف الاستدعاء."); callLoad(); } catch (e) { toast(e.message); } });
      box.append(el("div", { class: "row-item", style: "--c:" + (expired ? "#94A3B8" : c.seenAt ? "#00A774" : "#E5533F") }, el("span", { class: "bar" }),
        el("div", { class: "tx" }, el("b", { text: c.name + " · " + c.grade.replace(" الثانوي", "") + " · الشعبة " + c.section }),
          el("small", { text: c.text + (c.place ? " · " + c.place : "") + (c.when ? " · " + c.when : "") }),
          el("small", {}, c.from + " · " + fmtDate(c.createdAt) + " · ", expired ? el("span", { text: "منتهٍ" }) : c.seenAt ? el("span", { class: "seen-yes", text: "✓ اطّلع " + fmtDate(c.seenAt) }) : el("span", { class: "seen-no", text: "لم يطّلع بعد" }))),
        el("div", { class: "row-actions" }, edit, del)));
    });
  }
  async function callLoad() { try { calls = (await api({ action: "calls-list" })).items || []; callRender(); } catch (e) { toast(e.message); } }
  $("#callQ").addEventListener("input", callRender);
  $("#callReset").addEventListener("click", callReset);
  $("#callForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#callErr").textContent = ""; const b = $("#callSave"); busy(b, true, "جارٍ الإرسال…");
    try { await api({ action: "calls-save", id: $("#cId").value || undefined, studentId: digits($("#cStudent").value), text: $("#cText").value, place: $("#cPlace").value, when: $("#cWhen").value, expires: $("#cExp").value }); toast("وصل الاستدعاء. يظهر للطالب عندما يفتح «بياناتي»."); callReset(); callLoad(); }
    catch (ex) { $("#callErr").textContent = ex.message; } finally { busy(b, false); }
  });

  // =====================================================================
  // الفعاليات والمواعيد
  // =====================================================================
  let events = [];
  function evReset() { $("#evForm").reset(); $("#eId").value = ""; $("#eDate").value = addDays(today(), 7); $("#evFormTitle").textContent = "فعالية أو موعد جديد"; $("#evSave").textContent = "حفظ"; $("#evErr").textContent = ""; }
  function evRender() {
    const box = $("#evList"); box.textContent = "";
    const t = today(), list = events.filter((e) => (e.deadline && e.deadline >= t) || (e.end || e.date) >= t);
    if (!list.length) { box.append(el("p", { class: "empty", text: "لا توجد فعاليات قادمة." })); return; }
    list.forEach((x) => {
      const edit = btn("تعديل", "", () => { $("#eId").value = x.id; ["Title", "Kind", "Grade", "Date", "End", "Deadline", "Link", "Note"].forEach((k) => { $("#e" + k).value = x[k.toLowerCase()] || ""; }); $("#evFormTitle").textContent = "تعديل " + x.title; $("#evSave").textContent = "حفظ التعديل"; });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "events-delete", id: x.id }); evLoad(); } catch (e) { toast(e.message); } });
      const n = dayDiff(x.date);
      box.append(el("div", { class: "row-item", style: "--c:" + (x.kind === "الخريجين" || x.kind === "اختبار وطني" ? "#7051F0" : x.kind === "تسجيل" ? "#E5533F" : "#2D7BEA") }, el("span", { class: "bar" }),
        el("div", { class: "tx" }, el("b", { text: x.title }), el("small", { text: x.kind + " · " + fmtDay(x.date) + (x.end ? " ← " + fmtDay(x.end) : "") + (x.grade ? " · " + x.grade : "") + (x.deadline ? " · آخر موعد للتسجيل " + fmtDay(x.deadline) : "") })),
        el("span", { class: "st-chip st-sched", text: inDays(n) }), el("div", { class: "row-actions" }, edit, del)));
    });
  }
  async function evLoad() { try { const d = await api({ action: "events-list" }); events = d.items || []; const k = $("#eKind"); if (!k.options.length) d.kinds.forEach((x) => k.append(el("option", { text: x }))); evRender(); } catch (e) { toast(e.message); } }
  $("#evReset").addEventListener("click", evReset);
  $("#evForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#evErr").textContent = ""; const b = $("#evSave"); busy(b, true, "جارٍ الحفظ…");
    try { await api({ action: "events-save", id: $("#eId").value || undefined, title: $("#eTitle").value, kind: $("#eKind").value, grade: $("#eGrade").value, date: $("#eDate").value, end: $("#eEnd").value, deadline: $("#eDeadline").value, link: $("#eLink").value.trim(), note: $("#eNote").value }); toast("تم الحفظ."); evReset(); evLoad(); }
    catch (ex) { $("#evErr").textContent = ex.message; } finally { busy(b, false); }
  });

  // =====================================================================
  // لوحة الشرف
  // =====================================================================
  let honor = [];
  fillSections($("#hSection"), "—");
  function hoReset() { $("#hoForm").reset(); $("#hId").value = ""; $("#hoFormTitle").textContent = "إضافة متميز"; $("#hoSave").textContent = "نشر"; $("#hoErr").textContent = ""; }
  $("#hFill").addEventListener("click", async () => {
    const id = digits($("#hFromId").value); if (id.length !== 10) { $("#hoErr").textContent = "رقم الهوية 10 أرقام."; return; }
    try { const d = await api({ action: "calls-student", studentId: id }); $("#hName").value = d.student.name; $("#hGrade").value = d.student.grade; $("#hSection").value = d.student.section; $("#hoErr").textContent = ""; }
    catch (e) { $("#hoErr").textContent = A.me().perms.calls ? e.message : "التعبئة من الهوية تحتاج صلاحية «استدعاء الطلاب». اكتب الاسم يدويًا."; }
  });
  function hoRender() {
    const box = $("#hoList"); box.textContent = "";
    $("#hoStats").textContent = honor.filter((h) => !h.hidden).length + " ظاهر في صفحة الطلاب";
    if (!honor.length) { box.append(el("p", { class: "empty", text: "لم يُضف أحد بعد." })); return; }
    honor.forEach((h) => {
      const edit = btn("تعديل", "", () => { $("#hId").value = h.id; $("#hName").value = h.name; $("#hCat").value = h.cat; $("#hGrade").value = h.grade || ""; $("#hSection").value = h.section || ""; $("#hTitle").value = h.title; $("#hPeriod").value = h.period || ""; $("#hConsent").checked = !!h.consent; $("#hoFormTitle").textContent = "تعديل " + h.name; $("#hoSave").textContent = "حفظ التعديل"; });
      const hide = btn(h.hidden ? "إظهار" : "إخفاء", "", async () => { try { await api({ action: "honor-save", ...h, hidden: !h.hidden }); hoLoad(); } catch (e) { toast(e.message); } });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "honor-delete", id: h.id }); hoLoad(); } catch (e) { toast(e.message); } });
      box.append(el("div", { class: "row-item" + (h.hidden ? " off" : ""), style: h.hidden ? "opacity:.6" : "" }, el("span", { class: "who-av", style: "background:#D68A00", text: "★" }),
        el("div", { class: "tx" }, el("b", { text: h.name }), el("small", { text: h.title + " · " + h.cat + (h.period ? " · " + h.period : "") + (h.grade ? " · " + h.grade.replace(" الثانوي", "") : "") })),
        el("div", { class: "row-actions" }, edit, hide, del)));
    });
  }
  async function hoLoad() { try { const d = await api({ action: "honor-list" }); honor = d.items || []; const c = $("#hCat"); if (!c.options.length) d.cats.forEach((x) => c.append(el("option", { text: x }))); hoRender(); } catch (e) { toast(e.message); } }
  $("#hoReset").addEventListener("click", hoReset);
  $("#hoForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#hoErr").textContent = ""; const b = $("#hoSave"); busy(b, true, "جارٍ الحفظ…");
    const cur = honor.find((x) => x.id === $("#hId").value);
    try { await api({ action: "honor-save", id: $("#hId").value || undefined, name: $("#hName").value, cat: $("#hCat").value, grade: $("#hGrade").value, section: $("#hSection").value, title: $("#hTitle").value, period: $("#hPeriod").value, consent: $("#hConsent").checked, hidden: cur ? cur.hidden : false }); toast("تم النشر في لوحة الشرف."); hoReset(); hoLoad(); }
    catch (ex) { $("#hoErr").textContent = ex.message; } finally { busy(b, false); }
  });

  // =====================================================================
  // الاستطلاعات + المبادرات
  // =====================================================================
  document.querySelectorAll("#panel-polls .seg-a button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#panel-polls .seg-a button").forEach((x) => x.classList.toggle("on", x === b));
    $("#pv-polls").hidden = b.dataset.pv !== "polls"; $("#pv-ideas").hidden = b.dataset.pv !== "ideas";
  }));
  let polls = [];
  function optRow(v) {
    const i = el("input", { type: "text", maxlength: "80", value: v || "", placeholder: "خيار" });
    const x = el("button", { class: "ib del", type: "button", text: "×", "aria-label": "حذف الخيار" });
    const row = el("div", { class: "inline" }, i, x);
    x.onclick = () => { if ($("#pOpts").children.length > 2) row.remove(); };
    $("#pOpts").append(row);
  }
  $("#pAddOpt").addEventListener("click", () => { if ($("#pOpts").children.length < 6) optRow(""); });
  function plReset() { $("#plForm").reset(); $("#pId").value = ""; $("#pOpts").textContent = ""; optRow(""); optRow(""); $("#pUntil").value = addDays(today(), 7); $("#plFormTitle").textContent = "استطلاع جديد"; $("#plSave").textContent = "نشر الاستطلاع"; $("#plErr").textContent = ""; }
  function plRender() {
    const box = $("#plList"); box.textContent = "";
    if (!polls.length) { box.append(el("p", { class: "empty", text: "لا توجد استطلاعات." })); return; }
    polls.forEach((p) => {
      const total = p.counts.reduce((a, b) => a + b, 0), max = Math.max(1, ...p.counts);
      const open = !p.closed && p.until >= today();
      const edit = btn("تعديل", "", () => { $("#pId").value = p.id; $("#pQ").value = p.q; $("#pOpts").textContent = ""; p.options.forEach(optRow); $("#pGrade").value = p.grade || ""; $("#pUntil").value = p.until; $("#pShow").checked = p.showResults; $("#pClosed").checked = p.closed; $("#plFormTitle").textContent = "تعديل الاستطلاع"; $("#plSave").textContent = "حفظ"; });
      const stop = btn(p.closed ? "إعادة فتح" : "إيقاف", "", async () => { try { await api({ action: "polls-save", ...p, closed: !p.closed }); plLoad(); } catch (e) { toast(e.message); } });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "polls-delete", id: p.id }); plLoad(); } catch (e) { toast(e.message); } });
      box.append(el("div", { class: "poll-card" },
        el("div", { class: "ph", style: "margin:0 0 6px;align-items:flex-start" }, el("div", {}, el("h4", { text: p.q }), el("small", { class: "hint", text: (open ? "مفتوح حتى " + fmtDay(p.until) : "مغلق") + " · " + total + " صوتًا" + (p.grade ? " · " + p.grade : "") })), el("div", { class: "row-actions" }, edit, stop, del)),
        ...p.options.map((o, i) => el("div", { class: "pbar" }, el("span", { text: o }), el("span", { class: "tr" }, el("i", { style: `width:${(p.counts[i] / max * 100).toFixed(1)}%` })), el("b", { text: p.counts[i] + (total ? " · " + Math.round(p.counts[i] / total * 100) + "%" : "") })))));
    });
  }
  async function plLoad() { try { polls = (await api({ action: "polls-list" })).items || []; plRender(); } catch (e) { toast(e.message); } }
  $("#plReset").addEventListener("click", plReset);
  $("#plForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#plErr").textContent = ""; const b = $("#plSave"); busy(b, true, "جارٍ الحفظ…");
    try { await api({ action: "polls-save", id: $("#pId").value || undefined, q: $("#pQ").value, options: [...$("#pOpts").querySelectorAll("input")].map((i) => i.value), grade: $("#pGrade").value, until: $("#pUntil").value, showResults: $("#pShow").checked, closed: $("#pClosed").checked }); toast("تم نشر الاستطلاع."); plReset(); plLoad(); }
    catch (ex) { $("#plErr").textContent = ex.message; } finally { busy(b, false); }
  });

  let ideas = [], ideaStatuses = [];
  const ST_COLOR = { "بانتظار المراجعة": "#D68A00", "منشورة للتصويت": "#2D7BEA", "قيد التنفيذ": "#7051F0", "نُفذت": "#00A774", "غير مناسبة": "#94A3B8" };
  function idRender() {
    const box = $("#idList"); box.textContent = ""; const f = $("#idF").value;
    const pending = ideas.filter((x) => x.status === "بانتظار المراجعة").length;
    $("#ideasCount").textContent = pending || ""; $("#ideasBadge").textContent = pending; $("#ideasBadge").hidden = !pending;
    const list = ideas.filter((x) => !f || x.status === f);
    if (!list.length) { box.append(el("p", { class: "empty", text: "لا توجد مبادرات." })); return; }
    list.forEach((x) => {
      const st = el("select", { "aria-label": "الحالة", style: "width:auto;padding:6px 10px" }); ideaStatuses.forEach((s) => st.append(el("option", { text: s }))); st.value = x.status;
      const rp = el("input", { type: "text", value: x.reply || "", maxlength: "300", placeholder: "رد الإدارة الظاهر للطلاب (اختياري)", style: "padding:8px 10px" });
      const save = btn("حفظ", "", async () => { try { await api({ action: "ideas-update", id: x.id, status: st.value, reply: rp.value }); toast(st.value === "منشورة للتصويت" ? "نُشرت المبادرة للتصويت." : "تم الحفظ."); idLoad(); } catch (e) { toast(e.message); } });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "ideas-delete", id: x.id }); idLoad(); } catch (e) { toast(e.message); } });
      box.append(el("div", { class: "row-item", style: "--c:" + (ST_COLOR[x.status] || "#94A3B8") }, el("span", { class: "bar" }),
        el("div", { class: "tx" }, el("b", { text: x.title + (x.votes ? " · " + x.votes + " داعم" : "") }), el("small", { text: x.body }), el("small", { text: x.name + " · " + x.grade + " · الشعبة " + x.section + " · " + fmtDate(x.createdAt) }), rp),
        el("div", { class: "row-actions", style: "flex-direction:column;align-items:stretch" }, st, save, del)));
    });
  }
  async function idLoad() {
    try { const d = await api({ action: "ideas-list" }); ideas = d.items || []; ideaStatuses = d.statuses;
      const f = $("#idF"); if (f.options.length < 2) ideaStatuses.forEach((s) => f.append(el("option", { text: s }))); idRender(); } catch (e) { toast(e.message); }
  }
  $("#idF").addEventListener("change", idRender);

  // =====================================================================
  // المكتبة: الملفات والفيديوهات
  // =====================================================================
  let files = [], fileSections = {}, picked = null;
  const fSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + " م.ب" : Math.max(1, Math.round(n / 1024)) + " ك.ب";
  function fiSync() { const sec = $("#fSection").value; $("#fCatF").hidden = sec !== "faq"; $("#fTitleF").hidden = sec === "guide"; $("#fFile").accept = sec === "guide" ? ".png,.jpg,.jpeg,.webp" : ".pdf,.png,.jpg,.jpeg,.webp"; }
  $("#fSection").addEventListener("change", fiSync);
  function fiReset() { const sv = $("#fSection").value || "faq"; $("#fiForm").reset(); if ($("#fSection").options.length) $("#fSection").value = sv; $("#fId").value = ""; picked = null; $("#fInfo").textContent = "PDF أو صورة · حتى 4 ميجابايت"; $("#fiFormTitle").textContent = "رفع ملف"; $("#fiSave").textContent = "رفع"; $("#fiErr").textContent = ""; fiSync(); }
  function pick(f) {
    $("#fiErr").textContent = "";
    if (!f) return;
    if (!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(f.type)) { $("#fiErr").textContent = "نوع الملف غير مدعوم. المسموح: PDF أو صورة."; return; }
    if (f.size > 4 * 1048576) { $("#fiErr").textContent = "حجم الملف أكبر من 4 ميجابايت."; return; }
    picked = f; $("#fInfo").textContent = f.name + " · " + fSize(f.size);
    if (!$("#fTitle").value) $("#fTitle").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  }
  $("#fFile").addEventListener("change", (e) => pick(e.target.files[0]));
  const drop = $("#fDrop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => pick(e.dataTransfer.files[0]));
  const toB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
  function fiRender() {
    const box = $("#fiList"); box.textContent = "";
    if (!files.length) { box.append(el("p", { class: "empty", text: "لا توجد ملفات." })); return; }
    files.forEach((f, i) => {
      const isImg = /^image/.test(f.type || "");
      const href = f.url || "/api/file?id=" + encodeURIComponent(f.id) + (f.v ? "&v=" + f.v : "");
      const up = el("button", { class: "ib", type: "button", text: "↑", title: "للأعلى" }), dn = el("button", { class: "ib", type: "button", text: "↓", title: "للأسفل" });
      const move = async (d) => { const j = i + d; if (j < 0 || j >= files.length) return; [files[i], files[j]] = [files[j], files[i]]; fiRender(); try { await api({ action: "files-order", ids: files.map((x) => x.id) }); } catch (e) { toast(e.message); } };
      up.onclick = () => move(-1); dn.onclick = () => move(1);
      const repl = btn("استبدال/تعديل", "", () => { $("#fId").value = f.id; $("#fSection").value = f.section; $("#fCat").value = f.cat || ""; $("#fTitle").value = f.title; fiSync(); picked = null; $("#fInfo").textContent = "اختر ملفًا جديدًا ليحل محل الحالي، أو عدّل العنوان فقط"; $("#fiFormTitle").textContent = "تعديل: " + f.title; $("#fiSave").textContent = "حفظ"; $("#fiForm").scrollIntoView({ behavior: "smooth", block: "start" }); });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "files-delete", id: f.id }); toast("تم حذف الملف."); fiLoad(); } catch (e) { toast(e.message); } });
      box.append(el("div", { class: "row-item" }, el("span", { class: "fic" + (isImg ? " img" : ""), text: isImg ? "صورة" : "PDF" }),
        el("div", { class: "tx" }, el("b", {}, el("a", { href, target: "_blank", rel: "noopener", text: f.title })), el("small", { text: (fileSections[f.section] || f.section) + (f.cat ? " · " + f.cat : "") + (f.size ? " · " + fSize(f.size) : "") + (f.url ? " · ملف أساسي" : "") })),
        el("div", { class: "row-actions" }, up, dn, repl, del)));
    });
  }
  async function fiLoad() {
    try { const d = await api({ action: "files-list" }); files = d.items || []; fileSections = d.sections || {};
      const s = $("#fSection"); if (!s.options.length) { Object.entries(fileSections).forEach(([k, v]) => s.append(el("option", { value: k, text: v }))); s.value = "faq"; } fiSync(); fiRender();
      const dl = $("#faqCatsList"); if (!dl.options.length) { try { (await api({ action: "faq-list" })).cats.forEach((c) => dl.append(el("option", { value: c }))); } catch {} }
    } catch (e) { toast(e.message); }
  }
  $("#fiReset").addEventListener("click", fiReset);
  $("#fiForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#fiErr").textContent = ""; const b = $("#fiSave"); busy(b, true, picked ? "جارٍ الرفع…" : "جارٍ الحفظ…");
    try {
      const body = { action: "files-save", id: $("#fId").value || undefined, section: $("#fSection").value, cat: $("#fCat").value, title: $("#fTitle").value };
      if (picked) Object.assign(body, { name: picked.name, type: picked.type, data: await toB64(picked) });
      await api(body); toast(picked ? "تم رفع الملف، ويظهر للطلاب خلال دقيقة." : "تم الحفظ."); fiReset(); fiLoad();
    } catch (ex) { $("#fiErr").textContent = ex.message; } finally { busy(b, false); }
  });

  let videos = [];
  const ytId = (u) => (String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || [])[1] || "";
  function viReset() { $("#viForm").reset(); $("#vId").value = ""; $("#viFormTitle").textContent = "مقطع جديد"; $("#viSave").textContent = "إضافة"; $("#viErr").textContent = ""; }
  function viRender() {
    const box = $("#viList"); box.textContent = "";
    if (!videos.length) { box.append(el("p", { class: "empty", text: "لا توجد مقاطع بعد." })); return; }
    videos.forEach((v, i) => {
      const up = el("button", { class: "ib", type: "button", text: "↑" }), dn = el("button", { class: "ib", type: "button", text: "↓" });
      const move = async (d) => { const j = i + d; if (j < 0 || j >= videos.length) return; [videos[i], videos[j]] = [videos[j], videos[i]]; viRender(); try { await api({ action: "videos-order", ids: videos.map((x) => x.id) }); } catch (e) { toast(e.message); } };
      up.onclick = () => move(-1); dn.onclick = () => move(1);
      const edit = btn("تعديل", "", () => { $("#vId").value = v.id; $("#vTitle").value = v.title; $("#vUrl").value = v.url; $("#vCat").value = v.cat || ""; $("#viFormTitle").textContent = "تعديل المقطع"; $("#viSave").textContent = "حفظ"; });
      const hide = btn(v.hidden ? "إظهار" : "إخفاء", "", async () => { try { await api({ action: "videos-save", ...v, hidden: !v.hidden }); viLoad(); } catch (e) { toast(e.message); } });
      const del = twoStep(delBtn(), async () => { try { await api({ action: "videos-delete", id: v.id }); viLoad(); } catch (e) { toast(e.message); } });
      box.append(el("div", { class: "row-item", style: v.hidden ? "opacity:.6" : "" }, el("img", { class: "thumb", alt: "", loading: "lazy", src: "https://i.ytimg.com/vi/" + v.yt + "/mqdefault.jpg" }),
        el("div", { class: "tx" }, el("b", { text: v.title }), el("small", { text: (v.cat || "عام") + (v.hidden ? " · مخفي" : "") })), el("div", { class: "row-actions" }, up, dn, edit, hide, del)));
    });
  }
  async function viLoad() { try { videos = (await api({ action: "videos-list" })).items || []; viRender(); } catch (e) { toast(e.message); } }
  $("#vUrl").addEventListener("input", () => { $("#viErr").textContent = $("#vUrl").value && !ytId($("#vUrl").value) ? "ضع رابط مقطع من يوتيوب." : ""; });
  $("#viReset").addEventListener("click", viReset);
  $("#viForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#viErr").textContent = ""; const b = $("#viSave"); busy(b, true, "…");
    const cur = videos.find((x) => x.id === $("#vId").value);
    try { await api({ action: "videos-save", id: $("#vId").value || undefined, title: $("#vTitle").value, url: $("#vUrl").value.trim(), cat: $("#vCat").value, hidden: cur ? cur.hidden : false }); toast("تمت الإضافة."); viReset(); viLoad(); }
    catch (ex) { $("#viErr").textContent = ex.message; } finally { busy(b, false); }
  });

  // =====================================================================
  // التوقيت الذكي
  // =====================================================================
  let tt = null, mode = "ramadan";
  const MODE_LBL = { ramadan: "توقيت رمضان", exams: "توقيت الاختبارات" };
  function modeRender() {
    const box = $("#modeEd"); box.textContent = "";
    const base = tt.periods || [];
    if (!base.length) { box.append(el("p", { class: "hint", text: "حدد أوقات الحصص الأساسية أولًا في الأعلى." })); return; }
    tt.modes = tt.modes || {}; tt.modes[mode] = tt.modes[mode] || base.map(() => ({ start: "", end: "" }));
    base.forEach((p, i) => {
      const cur = tt.modes[mode][i] = tt.modes[mode][i] || { start: "", end: "" };
      const s = el("input", { type: "time", value: cur.start }); s.oninput = () => { cur.start = s.value; };
      box.append(el("div", {}, el("small", { text: "الحصة " + (i + 1) + " · الأساسي " + (p.start || "—") }), s));
    });
  }
  function rangeRender() {
    const box = $("#rangeList"); box.textContent = ""; tt.ranges = tt.ranges || [];
    if (!tt.ranges.length) box.append(el("p", { class: "hint", text: "لا توجد فترات. أضف فترة رمضان مثلًا من بدايته إلى آخر يوم دراسي فيه." }));
    tt.ranges.forEach((r, i) => {
      const m = el("select", { style: "width:auto" }); Object.entries(MODE_LBL).forEach(([k, v]) => m.append(el("option", { value: k, text: v }))); m.value = r.mode || "ramadan";
      const f = el("input", { type: "date", value: r.from || "" }), t = el("input", { type: "date", value: r.to || "" });
      const x = el("button", { class: "ib del", type: "button", text: "×", "aria-label": "حذف الفترة" });
      m.onchange = () => r.mode = m.value; f.oninput = () => r.from = f.value; t.oninput = () => r.to = t.value; x.onclick = () => { tt.ranges.splice(i, 1); rangeRender(); };
      r.mode = m.value;
      box.append(el("div", { class: "inline", style: "margin-bottom:6px;align-items:center" }, m, f, el("span", { text: "←" }), t, x));
    });
  }
  async function timingLoad() { try { tt = (await api({ action: "tt-get" })).timetable; modeRender(); rangeRender(); } catch (e) { toast(e.message); } }
  document.querySelectorAll("#panel-sched [data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; document.querySelectorAll("#panel-sched [data-mode]").forEach((x) => x.classList.toggle("on", x === b)); modeRender(); }));
  $("#rangeAdd").addEventListener("click", () => { tt.ranges = tt.ranges || []; tt.ranges.push({ mode, from: today(), to: addDays(today(), 7) }); rangeRender(); });
  $("#timingSave").addEventListener("click", async () => {
    $("#timingErr").textContent = ""; const b = $("#timingSave"); busy(b, true, "…");
    try { const d = await api({ action: "tt-save", modes: tt.modes || {}, ranges: tt.ranges || [] }); tt = d.timetable; toast("تم حفظ التوقيت."); modeRender(); rangeRender(); }
    catch (ex) { $("#timingErr").textContent = ex.message; } finally { busy(b, false); }
  });

  // =====================================================================
  // ملصقات QR لكل فصل
  // =====================================================================
  const GRADE_OF = (s) => (+s < 10 ? "الأول الثانوي" : +s < 20 ? "الثاني الثانوي" : "الثالث الثانوي");
  const GI = { "الأول الثانوي": 1, "الثاني الثانوي": 2, "الثالث الثانوي": 3 };
  $("#qrBase").value = /netlify\.app$/.test(location.hostname) ? location.origin + "/" : "https://studentdata-f10.netlify.app/";
  const qs = $("#qrSecs");
  SECTIONS.forEach((x) => qs.append(el("label", {}, el("input", { type: "checkbox", value: x }), x)));
  $("#qrAll").addEventListener("click", () => { const all = [...qs.querySelectorAll("input")]; const on = all.some((c) => !c.checked); all.forEach((c) => (c.checked = on)); });
  $("#qrMake").addEventListener("click", async () => {
    $("#qrErr").textContent = "";
    const secs = [...qs.querySelectorAll("input:checked")].map((c) => c.value);
    if (!secs.length) { $("#qrErr").textContent = "اختر شعبة واحدة على الأقل."; return; }
    const base = $("#qrBase").value.trim().replace(/#.*$/, "");
    if (!/^https:\/\//.test(base)) { $("#qrErr").textContent = "رابط الموقع يجب أن يبدأ بـ https://"; return; }
    try {
      if (!window.qrcode) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "assets/qrcode.js"; s.onload = res; s.onerror = () => rej(new Error("تعذر تحميل مولّد QR.")); document.head.append(s); });
      const sheet = $("#qrSheet"); sheet.textContent = ""; sheet.hidden = false;
      secs.forEach((x) => {
        const url = base + "#s" + GI[GRADE_OF(x)] + "-" + x;
        const q = el("div", { class: "qr" });
        sheet.append(el("div", { class: "qr-card" }, el("p", { text: "ثانوية بلاط الشهداء الثانوية" }), el("h3", { text: "الشعبة " + x }), el("p", { text: GRADE_OF(x) + " · امسح لعرض جدولك واختباراتك" }), q, el("small", { text: "دليل الطالب الرقمي" })));
        const g = window.qrcode(0, "M"); g.addData(url); g.make();
        q.innerHTML = g.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      });
      const pr = el("button", { class: "btn sm", type: "button", text: "طباعة الملصقات" });
      pr.onclick = () => { document.body.classList.add("printing-qr"); window.print(); setTimeout(() => document.body.classList.remove("printing-qr"), 500); };
      sheet.prepend(el("div", { style: "grid-column:1/-1;display:flex;justify-content:space-between;align-items:center" }, el("b", { text: secs.length + " ملصق جاهز. اطبعها على ورق A4." }), pr));
      sheet.scrollIntoView({ behavior: "smooth" });
    } catch (ex) { $("#qrErr").textContent = ex.message; }
  });

  // =====================================================================
  // حالة المنصات (يدويًا أو تلقائيًا) + عدد المشتركين في الإشعارات
  // =====================================================================
  const ST_TX = { up: "تعمل", slow: "بطيئة", down: "متوقفة", unknown: "تعذّر الفحص" };
  let stManual = {};
  async function stLoad() {
    try {
      const d = await api({ action: "status-get" }); stManual = d.manual || {};
      const box = $("#stRows"); box.textContent = "";
      d.status.items.forEach((x) => {
        const m = stManual[x.id] = stManual[x.id] || { mode: "auto", note: "" };
        const sel = el("select", { "aria-label": "حالة " + x.name }); [["auto", "تلقائي"], ["up", "تعمل"], ["down", "متوقفة"]].forEach(([v, t]) => sel.append(el("option", { value: v, text: t }))); sel.value = m.mode;
        const note = el("input", { type: "text", maxlength: "160", value: m.note || "", placeholder: "رسالة للطلاب، مثل: عطل عام من الوزارة" });
        const until = el("input", { type: "datetime-local", value: m.until ? m.until.slice(0, 16) : "", title: "ينتهي الإعلان اليدوي تلقائيًا في" });
        sel.onchange = () => { m.mode = sel.value; }; note.oninput = () => { m.note = note.value; }; until.oninput = () => { m.until = until.value ? new Date(until.value).toISOString() : null; };
        box.append(el("div", { class: "st-row" }, el("div", {}, el("b", { text: x.name }), el("small", {}, el("span", { class: "dot-s " + x.state }), "الآن: " + ST_TX[x.state] + (x.source === "manual" ? " (يدوي)" : ""))), sel, note, until));
      });
      if (A.P.owner()) { try { const p = await api({ action: "push-stats" }); $("#pushStats").textContent = "🔔 " + p.total + " جهازًا مشتركًا في الإشعارات" + (p.total ? " (" + Object.entries(p.byGrade).map(([g, n]) => g.replace(" الثانوي", "") + ": " + n).join("، ") + ")" : ""); } catch {} }
    } catch (e) { $("#stErr").textContent = e.message; }
  }
  $("#stSave").addEventListener("click", async () => {
    $("#stErr").textContent = ""; const b = $("#stSave"); busy(b, true, "…");
    try { await api({ action: "status-save", manual: stManual }); toast("تم حفظ حالة المنصات، وتظهر للطلاب خلال دقيقة."); stLoad(); }
    catch (ex) { $("#stErr").textContent = ex.message; } finally { busy(b, false); }
  });

  // =====================================================================
  // التحميل عند فتح كل قسم
  // =====================================================================
  let loaded = {};
  const once = (k, f) => () => { if (!loaded[k]) { loaded[k] = true; f(); } };
  onTab("calls", once("calls", () => { callReset(); callLoad(); }));
  onTab("events", once("events", () => { evReset(); evLoad(); }));
  onTab("honor", once("honor", () => { hoReset(); hoLoad(); }));
  onTab("polls", once("polls", () => { plReset(); plLoad(); idLoad(); }));
  onTab("library", once("library", () => { fiReset(); fiLoad(); viReset(); viLoad(); }));
  onTab("sched", once("timing", timingLoad));
  onTab("users", once("status", stLoad));
  A.loaders.push(() => {
    loaded = {};
    if (A.P.polls()) idLoad(); // لإظهار عدد المبادرات الجديدة في القائمة
  });
})();
