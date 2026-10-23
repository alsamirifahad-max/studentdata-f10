// لوحة التحكم: الاختبارات النهائية (الجدول، مقرات اللجان، أرقام الجلوس مع المطابقة والمراجعة)
(() => {
  "use strict";
  const A = window.ADM;
  const { el, toast, busy, $ } = A;
  const api = (b) => A.api(b);
  const GRADES = ["الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"];
  const PERIODS = ["الأولى", "الثانية", "الثالثة"];
  const onTab = (name, f) => { (A.onTab[name] = A.onTab[name] || []).push(f); };
  const hijri = (iso) => { try { return new Date(iso + "T12:00:00Z").toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); } catch { return ""; } };
  const download = (name, text) => { const a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" })), download: name }); document.body.append(a); a.click(); a.remove(); };
  const toB64 = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });

  let F = { title: "", visible: false, instructions: "", schedule: [], committees: {} };
  let seatCount = 0, officialFile = null, dirty = false;
  const mark = () => { dirty = true; $("#fxState").textContent = "تعديلات غير محفوظة"; steps(); };

  function steps() {
    const s = [["الجدول", F.schedule.length > 0], ["مقرات اللجان", Object.keys(F.committees).length > 0], ["أرقام الجلوس", seatCount > 0], ["ظاهر للطلاب", F.visible]];
    const box = $("#fxSteps"); box.textContent = "";
    s.forEach(([t, ok]) => box.append(el("span", { class: ok ? "ok" : "", text: t })));
  }

  // ===== الجدول =====
  function schedRow(r) {
    const tr = el("tr");
    const date = el("input", { type: "date", value: r.date || "" });
    const hint = el("small", { text: r.date ? hijri(r.date) : "" });
    date.oninput = () => { r.date = date.value; hint.textContent = date.value ? hijri(date.value) : ""; mark(); };
    const per = el("select"); PERIODS.forEach((p) => per.append(el("option", { value: p, text: p }))); per.value = r.period || PERIODS[0];
    per.onchange = () => { r.period = per.value; mark(); };
    const st = el("input", { type: "time", value: r.start || "" }), en = el("input", { type: "time", value: r.end || "" });
    st.oninput = () => { r.start = st.value; mark(); }; en.oninput = () => { r.end = en.value; mark(); };
    tr.append(el("td", {}, date, hint), el("td", {}, per), el("td", {}, st), el("td", {}, en));
    r.subjects = r.subjects || {};
    GRADES.forEach((g) => { const i = el("input", { type: "text", value: r.subjects[g] || "", maxlength: "60", placeholder: "—" }); i.oninput = () => { r.subjects[g] = i.value.trim(); mark(); }; tr.append(el("td", {}, i)); });
    const x = el("button", { type: "button", class: "x", "aria-label": "حذف اليوم", text: "×" });
    x.onclick = () => { F.schedule.splice(F.schedule.indexOf(r), 1); renderSched(); mark(); };
    tr.append(el("td", {}, x));
    return tr;
  }
  function renderSched() {
    const tb = $("#fxSched"); tb.textContent = "";
    F.schedule.forEach((r) => tb.append(schedRow(r)));
    if (!F.schedule.length) tb.append(el("tr", {}, el("td", { colspan: "8", class: "sub", text: "لا توجد أيام بعد. أضف يومًا أو استورد الجدول." })));
  }
  $("#fxAddDay").onclick = () => {
    const last = F.schedule[F.schedule.length - 1];
    let date = "";
    if (last && last.date) { const t = new Date(last.date + "T12:00:00Z"); do { t.setUTCDate(t.getUTCDate() + 1); } while (t.getUTCDay() === 5 || t.getUTCDay() === 6); date = t.toISOString().slice(0, 10); }
    F.schedule.push({ date, period: last ? last.period : PERIODS[0], start: last ? last.start : "07:00", end: last ? last.end : "09:30", subjects: {} });
    renderSched(); mark();
  };
  $("#fxSchedTpl").onclick = () => download("نموذج-جدول-الاختبارات.csv", "التاريخ,الفترة,الوقت," + GRADES.join(",") + "\n1448/01/06,الأولى,7:00 - 9:30,رياضيات 1,رياضيات 2,رياضيات 3\n");
  $("#fxSchedFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    $("#fxSchedErr").textContent = "";
    try {
      const r = A.importer.parseFinalsSchedule(await A.importer.readFile(f));
      if (!r.schedule.length) throw new Error(r.warnings[0] || "لم يُعثر على جدول.");
      if (F.schedule.length && !(await A.ask("سيُستبدل الجدول الحالي (" + F.schedule.length + " أيام) بالجدول المستورد (" + r.schedule.length + " أيام). متابعة؟"))) return;
      F.schedule = r.schedule; renderSched(); mark();
      toast("استُورد " + r.schedule.length + " أيام. راجعها ثم اضغط «حفظ».");
      if (r.warnings.length) $("#fxSchedErr").textContent = r.warnings.join(" · ");
    } catch (ex) { $("#fxSchedErr").textContent = ex.message; }
  };
  $("#fxOfficial").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast("حجم الملف أكبر من 4 ميجابايت."); return; }
    try {
      const d = await api({ action: "files-save", id: officialFile ? officialFile.id : undefined, section: "finals", title: "جدول الاختبارات النهائية (الرسمي)", name: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "image/jpeg"), data: await toB64(f) });
      officialFile = d.item; fileInfo(); toast("رُفع الجدول الرسمي.");
    } catch (ex) { toast(ex.message); }
  };
  const fileInfo = () => { $("#fxFileInfo").textContent = officialFile ? "مرفوع: " + (officialFile.name || officialFile.title) + " — يمكنك استبداله." : "اختياري: يظهر للطلاب زرًا «الجدول الرسمي»."; };

  // ===== مقرات اللجان =====
  function renderCom() {
    const box = $("#fxCom"); box.textContent = "";
    const nums = Object.keys(F.committees).sort((a, b) => a - b);
    if (!nums.length) { box.append(el("p", { class: "sub", text: "لا توجد لجان بعد. استورد كشف المقرات أو أضف لجنة." })); return; }
    box.append(el("div", { class: "c hd" }, el("span", { text: "اللجنة" }), el("span", { text: "الدور" }), el("span", { text: "القاعة / الشعبة" }), el("span")));
    nums.forEach((n) => {
      const c = F.committees[n];
      const num = el("input", { class: "num", value: n, inputmode: "numeric", "aria-label": "رقم اللجنة" });
      const fl = el("input", { value: c.floor || "", list: "fxFloors", "aria-label": "الدور" });
      const rm = el("input", { value: c.room || "", "aria-label": "القاعة" });
      num.onchange = () => { const v = String(+num.value.replace(/\D/g, "") || ""); if (!v || (v !== n && F.committees[v])) { num.value = n; toast("رقم اللجنة غير صالح أو مكرر."); return; } delete F.committees[n]; F.committees[v] = c; renderCom(); mark(); };
      fl.oninput = () => { c.floor = fl.value; mark(); }; rm.oninput = () => { c.room = rm.value; mark(); };
      const x = el("button", { type: "button", class: "x", "aria-label": "حذف", text: "×" }); x.onclick = () => { delete F.committees[n]; renderCom(); mark(); };
      box.append(el("div", { class: "c" }, num, fl, rm, x));
    });
  }
  document.body.append(el("datalist", { id: "fxFloors" }, ...["الدور الأرضي", "الدور الأول", "الدور الثاني", "الدور الثالث", "الصالة الرياضية"].map((v) => el("option", { value: v }))));
  $("#fxAddCom").onclick = () => { const n = String(Math.max(0, ...Object.keys(F.committees).map(Number)) + 1); const prev = F.committees[n - 1] || {}; F.committees[n] = { floor: prev.floor || "", room: "" }; renderCom(); mark(); };
  $("#fxClearCom").onclick = async () => { if (!Object.keys(F.committees).length || !(await A.ask("مسح جميع مقرات اللجان من النموذج؟ (لن يُحفظ إلا بعد «حفظ»)"))) return; F.committees = {}; renderCom(); mark(); };
  $("#fxComTpl").onclick = () => download("نموذج-مقرات-اللجان.csv", "رقم اللجنة,مقر اللجنة,المقر (الشعبة)\n1,الدور الثالث,1\n2,الدور الثالث,2\n");
  $("#fxComFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    $("#fxComErr").textContent = "";
    try {
      const r = A.importer.parseCommittees(await A.importer.readFile(f));
      const n = Object.keys(r.committees).length;
      if (!n) throw new Error(r.warnings[0] || "لم يُعثر على لجان.");
      F.committees = r.committees; renderCom(); mark();
      toast("استُوردت " + n + " لجنة. راجعها ثم اضغط «حفظ».");
    } catch (ex) { $("#fxComErr").textContent = ex.message; }
  };

  // ===== الحفظ =====
  async function save(silent) {
    const btn = $("#fxSave"); $("#fxErr").textContent = "";
    F.title = $("#fxTitle").value.trim(); F.instructions = $("#fxInstr").value.trim(); F.visible = $("#fxVisible").checked;
    if (F.visible && !F.schedule.length) { $("#fxErr").textContent = "أضف جدول الاختبارات قبل إظهاره للطلاب."; $("#fxVisible").checked = F.visible = false; return false; }
    busy(btn, true);
    try {
      const d = await api({ action: "finals-save", finals: F });
      F = d.finals; dirty = false; render(); if (!silent) toast("تم الحفظ.");
      return true;
    } catch (ex) { $("#fxErr").textContent = ex.message; return false; }
    finally { busy(btn, false); }
  }
  $("#fxSave").onclick = () => save();
  $("#fxVisible").onchange = () => { F.visible = $("#fxVisible").checked; save(true).then((ok) => ok && toast(F.visible ? "أصبحت الاختبارات ظاهرة للطلاب." : "أُخفيت الاختبارات عن الطلاب.")); };
  $("#fxTitle").oninput = $("#fxInstr").oninput = mark;

  function render() {
    $("#fxTitle").value = F.title || ""; $("#fxInstr").value = F.instructions || ""; $("#fxVisible").checked = !!F.visible;
    renderSched(); renderCom(); steps(); fileInfo(); seatState();
    $("#fxState").textContent = F.updatedAt ? "آخر حفظ: " + A.fmtDate(F.updatedAt) + (F.updatedBy ? " — " + F.updatedBy : "") : "";
  }
  const seatState = () => { $("#fxSeatState").textContent = seatCount ? "محفوظ لـ " + seatCount + " طالبًا رقم جلوس ولجنة." : "لم تُحفظ أرقام جلوس بعد."; $("#fxSeatClear").hidden = !(A.me() && A.me().owner && seatCount); };
  async function load() {
    try { const d = await api({ action: "finals-get" }); F = d.finals; seatCount = d.seatCount; officialFile = d.file; dirty = false; render(); }
    catch (ex) { $("#fxErr").textContent = ex.message; }
  }
  let loadedOnce = false;
  onTab("finals", () => { if (!loadedOnce) { loadedOnce = true; load(); } });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ===== أرقام الجلوس =====
  let cancelled = false, review = null;
  $("#fxCancel").onclick = () => { cancelled = true; };
  const prog = (p) => {
    $("#fxProg").hidden = false;
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    $("#fxBar").style.width = pct + "%";
    $("#fxProgT").textContent = p.stage === "ocr" ? (p.done < p.total ? "قراءة الصفحة " + (p.done + 1) + " من " + p.total + "…" : "اكتملت القراءة") : p.text || "";
  };
  $("#fxSeatFile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    $("#fxSeatErr").textContent = ""; $("#fxReview").textContent = ""; cancelled = false;
    prog({ text: "جارٍ فتح الملف…", done: 0, total: 1 });
    try {
      const blocks = await A.importer.readFile(f, { ocr: true, onProgress: prog, cancelled: () => cancelled });
      if (blocks.scanned && blocks.scanned.length) toast("قُرئت " + blocks.scanned.length + " صفحة مصوّرة آليًا؛ راجع النتائج.");
      const r = A.importer.parseSeating(blocks);
      if (!r.rows.length) throw new Error("لم أجد أرقام جلوس في الملف. تأكد أنه كشف لجان أو ملف فيه عمود «رقم الجلوس».");
      // مقرات اللجان من رؤوس الكشوف إن لم تكن مُدخلة
      let added = 0;
      r.pages.forEach((p) => { if (p.committee && p.floor && !F.committees[p.committee]) { F.committees[p.committee] = { floor: p.floor, room: "" }; added++; } });
      if (added) { renderCom(); mark(); toast("أُضيفت " + added + " لجنة من رؤوس الكشوف."); }
      prog({ text: "مطابقة الأسماء مع ملف الطلاب…", done: 1, total: 1 });
      review = { rows: r.rows, pages: r.pages };
      await match();
    } catch (ex) { $("#fxSeatErr").textContent = ex.message; }
    finally { $("#fxProg").hidden = true; }
  };

  async function match() {
    const rows = review.rows.map((x) => ({ seat: x.seat, name: x.name, grade: x.grade, section: x.section, committee: x.committee, studentId: x.studentId }));
    const d = await api({ action: "finals-match", rows });
    review.matched = d.matched; review.unmatched = d.unmatched.map((u) => ({ ...u, pick: "" }));
    renderReview();
  }

  function renderReview() {
    const box = $("#fxReview"); box.textContent = "";
    const R = review, noCom = R.rows.filter((x) => !x.committee).length;
    const resolved = R.unmatched.filter((u) => u.pick).length;
    box.append(el("div", { class: "fx-sum" },
      el("div", {}, el("b", { text: R.rows.length }), el("small", { text: "صفًا في الكشوف" })),
      el("div", { class: "ok" }, el("b", { text: R.matched.length + resolved }), el("small", { text: "طالبًا تمت مطابقته" })),
      el("div", { class: R.unmatched.length - resolved ? "warn" : "ok" }, el("b", { text: R.unmatched.length - resolved }), el("small", { text: "يحتاج مراجعتك" })),
      el("div", { class: noCom ? "warn" : "" }, el("b", { text: R.pages.length }), el("small", { text: noCom ? "صفحة — بعضها بلا رقم لجنة" : "صفحة/لجنة" }))));
    // أرقام اللجان لكل صفحة (للتصحيح السريع)
    if (R.pages.some((p) => p.page)) {
      box.append(el("h3", { class: "sub-h", text: "رقم اللجنة لكل صفحة" }));
      if (R.pages.some((p) => p.inferred)) box.append(el("p", { class: "sub", text: "الكشوف مصوّرة، فاستنتجتُ أرقام اللجان من ترتيب الصفحات (الأرقام المائلة). راجع أول صفحة وآخر صفحة؛ تعديل رقم يعيد ترقيم ما بعده تلقائيًا." }));
      const pages = el("div", { class: "fx-pages" });
      R.pages.forEach((p) => {
        const i = el("input", { value: p.committee || "", inputmode: "numeric", "aria-label": "رقم لجنة الصفحة " + p.page });
        i.onchange = () => {
          let v = +i.value.replace(/\D/g, "") || 0;
          p.committee = v ? String(v) : ""; p.inferred = false;
          // الصفحات المستنتجة بعدها يُعاد ترقيمها تلقائيًا بالتسلسل
          const k = R.pages.indexOf(p);
          for (const q of R.pages.slice(k + 1)) { if (!q.inferred || !v) break; if (!(q.first > 10)) v++; q.committee = String(v); }
          const byPage = Object.fromEntries(R.pages.map((q) => [q.page, q.committee]));
          R.rows.forEach((x) => { if (x.page in byPage) x.committee = byPage[x.page]; });
          [...R.matched, ...R.unmatched].forEach((x) => { const src = R.rows.find((y) => y.seat === x.seat); if (src) x.committee = src.committee; });
          renderReview();
        };
        pages.append(el("label", { class: (p.committee ? "" : "miss") + (p.inferred ? " inf" : ""), title: p.count + " طالبًا" + (p.inferred ? " — رقم مستنتج من ترتيب الصفحات، صححه إن لزم" : "") }, "ص" + p.page + " ←", i));
      });
      box.append(pages);
    }
    if (R.unmatched.length) {
      box.append(el("h3", { class: "sub-h", text: "أسماء تحتاج تأكيدك" }), el("p", { class: "sub", text: "اختر الطالب الصحيح من الاقتراحات، أو اكتب رقم هويته. المتروك فارغًا لن يُحفظ." }));
      const list = el("div", { class: "fx-un" });
      R.unmatched.forEach((u) => {
        const row = el("div", { class: "u" + (u.pick ? " done" : "") });
        const sel = el("select", {}, el("option", { value: "", text: u.candidates.length ? "— اختر —" : "لا توجد اقتراحات" }));
        u.candidates.forEach((c) => sel.append(el("option", { value: c.id, text: c.name + " · " + (c.grade || "").replace(" الثانوي", "") + (c.section ? "/" + c.section : "") + " (" + Math.round(c.score * 100) + "%)" })));
        const idIn = el("input", { type: "text", inputmode: "numeric", maxlength: "10", placeholder: "أو رقم الهوية" });
        sel.value = u.pick && u.candidates.some((c) => c.id === u.pick) ? u.pick : "";
        if (u.pick && !sel.value) idIn.value = u.pick;
        const set = (v) => { u.pick = v; row.classList.toggle("done", !!v); updSum(); };
        sel.onchange = () => { idIn.value = ""; set(sel.value); };
        idIn.oninput = () => { const v = idIn.value.replace(/\D/g, ""); if (v.length === 10) { sel.value = ""; set(v); } else if (!sel.value) set(""); };
        row.append(el("div", {}, el("b", { text: u.name || "—" }), el("small", { text: "جلوس " + u.seat + " · " + [(u.grade || "").replace(" الثانوي", ""), u.section && "ش" + u.section, u.committee && "لجنة " + u.committee].filter(Boolean).join(" · ") + (u.duplicate ? " · مكرر" : "") })),
          el("div", { style: "display:grid;gap:6px" }, sel, idIn), el("div"));
        list.append(row);
      });
      box.append(list);
    }
    const rc = el("input", { type: "checkbox", id: "fxReplace" }); rc.checked = seatCount === 0;
    const repl = el("label", { class: "switch", style: "font-size:14px" }, rc, " استبدال أرقام الجلوس المحفوظة سابقًا بالكامل");
    const btn = el("button", { class: "btn", type: "button", text: "حفظ أرقام الجلوس" });
    btn.onclick = async () => {
      const seats = [...R.matched.map((m) => ({ studentId: m.studentId, seat: m.seat, committee: m.committee })), ...R.unmatched.filter((u) => u.pick).map((u) => ({ studentId: u.pick, seat: u.seat, committee: u.committee }))];
      if (!seats.length) { toast("لا توجد صفوف مطابقة للحفظ."); return; }
      const miss = seats.filter((s) => !s.committee).length;
      if (miss && !(await A.ask(miss + " طالبًا بلا رقم لجنة (صححها من «رقم اللجنة لكل صفحة»). حفظ رغم ذلك؟"))) return;
      busy(btn, true);
      try {
        const d = await api({ action: "finals-seats-save", seats, replace: $("#fxReplace").checked });
        seatCount = d.total; seatState(); steps();
        if (dirty) await save(true);
        toast("حُفظت أرقام الجلوس لـ " + d.saved + " طالبًا.");
        $("#fxReview").textContent = ""; review = null;
      } catch (ex) { toast(ex.message); } finally { busy(btn, false); }
    };
    box.append(el("div", { class: "row-actions", style: "justify-content:space-between;margin-top:12px;flex-wrap:wrap" }, repl, btn));
    function updSum() { const s = box.querySelectorAll(".fx-sum b"); const res = R.unmatched.filter((u) => u.pick).length; s[1].textContent = R.matched.length + res; s[2].textContent = R.unmatched.length - res; s[2].parentNode.className = R.unmatched.length - res ? "warn" : "ok"; }
  }

  // ===== بحث وتعديل يدوي =====
  async function find() {
    const q = $("#fxFindQ").value.trim(), box = $("#fxFindRes"); box.textContent = "";
    if (q.length < 2) return;
    try {
      const d = await api({ action: "finals-seat-find", q });
      if (!d.items.length) { box.append(el("p", { class: "sub", text: "لا نتائج." })); return; }
      const wrap = el("div", { class: "fx-res" });
      d.items.forEach((s) => {
        const seat = el("input", { value: s.seat || "", inputmode: "numeric", placeholder: "رقم الجلوس", "aria-label": "رقم الجلوس" });
        const com = el("input", { value: s.committee || "", inputmode: "numeric", placeholder: "اللجنة", "aria-label": "رقم اللجنة" });
        const b = el("button", { class: "btn outline sm", type: "button", text: "حفظ" });
        b.onclick = async () => {
          busy(b, true);
          try { const r = await api({ action: "finals-seats-save", seats: [{ studentId: s.id, seat: seat.value, committee: com.value }] }); seatCount = r.total; seatState(); steps(); toast("حُفظ."); }
          catch (ex) { toast(ex.message); } finally { busy(b, false); }
        };
        wrap.append(el("div", { class: "r" }, el("div", {}, el("b", { text: s.name }), el("small", { class: "sub", text: " · " + (s.grade || "").replace(" الثانوي", "") + (s.section ? "/" + s.section : "") })), seat, com, b));
      });
      box.append(wrap);
    } catch (ex) { toast(ex.message); }
  }
  $("#fxFind").onclick = find;
  $("#fxFindQ").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); find(); } });
  $("#fxSeatClear").onclick = async () => {
    if (!(await A.ask("حذف أرقام الجلوس لجميع الطلاب نهائيًا؟"))) return;
    try { await api({ action: "finals-clear" }); seatCount = 0; seatState(); steps(); toast("حُذفت أرقام الجلوس."); } catch (ex) { toast(ex.message); }
  };
})();
