// الاختبارات النهائية: الجدول، ومقرات اللجان، وأرقام الجلوس لكل طالب
import { json, store, clean, normalizeId, getContent, content, ISO_DAY, GRADES, matchGrade, findStudent, officialInfo } from "./common.mjs";

const DENY = () => json({ error: "ليست لديك صلاحية لهذا الإجراء." }, 403);
const bad = (m) => json({ error: m }, 400);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const PERIODS = ["الأولى", "الثانية", "الثالثة"];

// ===== مطابقة الأسماء (لكشوف الجلوس التي لا تحتوي رقم الهوية) =====
const nname = (s) => String(s || "").normalize("NFKC").replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
  .replace(/[^ء-ي\s]/g, " ").replace(/\b(بن|ابن)\b/g, " ").replace(/\bال\s+/g, "ال").replace(/\s+/g, " ").trim();
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
/** تشابه اسمين بين 0 و1: يجمع تشابه الحروف وتطابق أجزاء الاسم */
export function nameScore(a, b) {
  a = nname(a); b = nname(b); if (!a || !b) return 0;
  // القراءة الآلية تحوّل الخط الفاصل «|» قبل الاسم إلى «ا» أحيانًا: نجرب الاسم بدونها أيضًا
  if (/^ا/.test(a) && a.length > 4) return Math.max(rawScore(a, b), rawScore(a.slice(1).trim(), b));
  return rawScore(a, b);
}
function rawScore(a, b) {
  if (!a || !b) return 0;
  const charSim = 1 - lev(a.replace(/ /g, ""), b.replace(/ /g, "")) / Math.max(a.length, b.length);
  const ta = a.split(" "), tb = b.split(" ");
  // الأجزاء القصيرة (مثل أحمد/محمد) يجب أن تتطابق تمامًا؛ الطويلة تحتمل خطأ قراءة واحدًا
  const near = (t, u) => t === u || (Math.min(t.length, u.length) >= 5 && lev(t, u) <= (Math.max(t.length, u.length) >= 8 ? 2 : 1));
  const used = new Set();
  const tok = ta.filter((t) => { const j = tb.findIndex((u, k) => !used.has(k) && near(t, u)); if (j < 0) return false; used.add(j); return true; }).length / Math.max(ta.length, tb.length);
  const first = ta[0] && tb[0] && near(ta[0], tb[0]) ? 1 : 0;
  return 0.55 * charSim + 0.35 * tok + 0.1 * first;
}

/** الاسم الأول متطابق (مع احتمال «ا» زائدة من القراءة الآلية) */
function sameFirst(a, b) {
  const x = nname(a).split(" "), y = nname(b).split(" ")[0];
  return x[0] === y || (x[0].startsWith("ا") && x[0].slice(1) === y) || (x[0] === "ا" && x[1] === y);
}

/** يجهّز قائمة الطلاب من ملف المدرسة للمطابقة */
async function roster() {
  const data = await store("students").get("data", { type: "json" });
  if (!data || !data.records) return null;
  return Object.entries(data.records).map(([id, row]) => ({ id, ...officialInfo(data, row) })).filter((s) => s.name);
}

export async function finalsAction(action, b, me) {
  if (!action.startsWith("finals-")) return null;
  if (!me.perms.schedule) return DENY();
  switch (action) {
    case "finals-get": {
      const f = await getContent("finals", null);
      const seats = await getContent("finals-seats", { byId: {} });
      const file = ((await getContent("files")) || []).find((x) => x.section === "finals") || null;
      return json({ ok: true, finals: f || { title: "", visible: false, instructions: "", schedule: [], committees: {} }, seatCount: Object.keys(seats.byId || {}).length, seatsUpdatedAt: seats.updatedAt || null, file });
    }
    case "finals-save": {
      const f = b.finals || {};
      const out = { title: clean(f.title, 120), visible: !!f.visible, instructions: clean(f.instructions, 2000), schedule: [], committees: {} };
      for (const r of (Array.isArray(f.schedule) ? f.schedule : []).slice(0, 40)) {
        const row = { date: ISO_DAY.test(r?.date) ? r.date : "", period: PERIODS.includes(r?.period) ? r.period : PERIODS[0],
          start: TIME.test(r?.start || "") ? r.start : "", end: TIME.test(r?.end || "") ? r.end : "", subjects: {} };
        for (const g of GRADES) { const v = clean(r?.subjects?.[g], 60); if (v) row.subjects[g] = v; }
        if (!row.date) return bad("حدد تاريخ كل يوم في جدول الاختبارات.");
        if (!Object.keys(row.subjects).length) continue;
        out.schedule.push(row);
      }
      out.schedule.sort((x, y) => (x.date + x.period < y.date + y.period ? -1 : 1));
      for (const [k, v] of Object.entries(f.committees || {}).slice(0, 200)) {
        const n = String(+normalizeId(k) || ""); if (!n) continue;
        out.committees[n] = { floor: clean(v?.floor, 60), room: clean(v?.room, 60) };
      }
      out.updatedAt = new Date().toISOString(); out.updatedBy = me.name;
      await content().setJSON("finals", out);
      return json({ ok: true, finals: out });
    }
    case "finals-match": {
      // يطابق صفوف كشف الجلوس (رقم الجلوس، الاسم، الصف، الشعبة، اللجنة) مع ملف الطلاب
      const list = await roster();
      if (!list) return bad("ارفع ملف بيانات الطلاب أولًا؛ المطابقة تعتمد عليه.");
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 3000);
      const byId = new Map(list.map((s) => [s.id, s]));
      const matched = [], unmatched = [];
      for (const r of rows) {
        const seat = normalizeId(r?.seat).slice(0, 20), committee = String(+normalizeId(r?.committee) || ""), sid = normalizeId(r?.studentId);
        const base = { seat, committee, name: clean(r?.name, 80), grade: matchGrade(r?.grade), section: String(+normalizeId(r?.section) || "") };
        if (sid && byId.has(sid)) { const s = byId.get(sid); matched.push({ ...base, studentId: sid, studentName: s.name, score: 1 }); continue; }
        // الشعبة في الكشوف قد تكون مرقّمة داخل الصف (1–8) أو بالترقيم العام (11–18، 21–28)
        const gi = GRADES.indexOf(base.grade), n = +base.section, secs = new Set();
        if (n) { secs.add(String(n)); if (gi > 0 && n <= 8) secs.add(String(gi * 10 + n)); }
        let pool = list.filter((s) => (!base.grade || s.grade === base.grade) && (!secs.size || secs.has(s.section)));
        if (pool.length < 2) pool = list.filter((s) => !base.grade || s.grade === base.grade);
        const scored = pool.map((s) => ({ s, sc: nameScore(base.name, s.name) })).sort((x, y) => y.sc - x.sc).slice(0, 4);
        const best = scored[0], second = scored[1];
        const margin = best ? best.sc - (second ? second.sc : 0) : 0;
        if (best && ((best.sc >= 0.8 && margin >= 0.05) || (best.sc >= 0.68 && margin >= 0.15 && sameFirst(base.name, best.s.name)))) matched.push({ ...base, studentId: best.s.id, studentName: best.s.name, score: +best.sc.toFixed(2) });
        else unmatched.push({ ...base, candidates: scored.filter((x) => x.sc >= 0.45).map((x) => ({ id: x.s.id, name: x.s.name, grade: x.s.grade, section: x.s.section, score: +x.sc.toFixed(2) })) });
      }
      // طالب واحد لا يأخذ رقمي جلوس: نبقي الأعلى تطابقًا وننقل الآخر للمراجعة
      const seen = new Map();
      for (const m of [...matched].sort((x, y) => y.score - x.score)) {
        if (seen.has(m.studentId)) { matched.splice(matched.indexOf(m), 1); unmatched.push({ ...m, duplicate: true, candidates: [{ id: m.studentId, name: m.studentName, score: m.score }] }); }
        else seen.set(m.studentId, m);
      }
      return json({ ok: true, matched, unmatched, rosterSize: list.length });
    }
    case "finals-seats-save": {
      const seats = Array.isArray(b.seats) ? b.seats.slice(0, 3000) : [];
      const cur = b.replace ? { byId: {} } : await getContent("finals-seats", { byId: {} });
      const { data } = await findStudent("0000000000");
      if (!data) return bad("ارفع ملف بيانات الطلاب أولًا.");
      let n = 0;
      for (const s of seats) {
        const id = normalizeId(s?.studentId);
        if (!/^\d{10}$/.test(id) || !data.records[id]) continue;
        cur.byId[id] = { seat: normalizeId(s.seat).slice(0, 20), committee: String(+normalizeId(s.committee) || "") };
        n++;
      }
      cur.updatedAt = new Date().toISOString(); cur.updatedBy = me.name;
      await content().setJSON("finals-seats", cur);
      return json({ ok: true, saved: n, total: Object.keys(cur.byId).length });
    }
    case "finals-seat-find": {
      const q = String(b.q || "").trim();
      const seats = (await getContent("finals-seats", { byId: {} })).byId || {};
      const list = await roster() || [];
      const res = list.filter((s) => (/^\d+$/.test(normalizeId(q)) && normalizeId(q).length >= 4 ? s.id.includes(normalizeId(q)) || (seats[s.id]?.seat || "").includes(normalizeId(q)) : nameScore(q, s.name) > 0.6 || nname(s.name).includes(nname(q))))
        .slice(0, 10).map((s) => ({ id: s.id, name: s.name, grade: s.grade, section: s.section, ...(seats[s.id] || {}) }));
      return json({ ok: true, items: res });
    }
    case "finals-clear": {
      if (!me.owner) return DENY();
      await content().setJSON("finals-seats", { byId: {} });
      return json({ ok: true });
    }
  }
  return null;
}

/** بيانات الاختبارات النهائية لطالب واحد (تُعرض في «بياناتي») */
export async function finalsFor(id, off) {
  const f = await getContent("finals", null);
  if (!f || !f.visible) return null;
  const seats = await getContent("finals-seats", { byId: {} });
  const st = (seats.byId || {})[id] || null;
  const com = st && st.committee ? (f.committees || {})[st.committee] || {} : {};
  const exams = (f.schedule || []).filter((r) => r.subjects?.[off.grade]).map((r) => ({ date: r.date, period: r.period, start: r.start, end: r.end, subject: r.subjects[off.grade] }));
  const file = ((await getContent("files")) || []).find((x) => x.section === "finals");
  const fileUrl = file ? (file.url || "/api/file?id=" + encodeURIComponent(file.id) + (file.v ? "&v=" + file.v : "")) : "";
  return { title: f.title, instructions: f.instructions, fileUrl, seat: st ? st.seat : "", committee: st ? st.committee : "", floor: com.floor || "", room: com.room || "", exams };
}
