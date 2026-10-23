import { json, store, clean, normalizeId, adminConfigured, issueToken, rateLimit, STATUSES, TYPES, GRADES, SECTIONS, CLOSED,
  getContent, content, todayRiyadh, ISO_DAY, DEFAULT_SETTINGS, DEFAULT_FAQ, FAQ_CATS, RATING_TAGS } from "../lib/common.mjs";
import { getSession, login, publicMe, canInquiry, canItem, staffList, loadUsers, saveUsers, setPassword, checkUserPassword, tempPassword, newId, normUser, cleanPerms, ROLES } from "../lib/auth.mjs";
import { computeStats } from "../lib/stats.mjs";
import { extraAction } from "../lib/admin-extra.mjs";
import { notify, toAudience, toStudent, background, allSubs } from "../lib/push.mjs";
import { getManual, setManual, publicStatus } from "../lib/status.mjs";
import { ROLE_SLOTS } from "../lib/auth.mjs";
import { cleanSections } from "../lib/common.mjs";
import { cleanCalendar } from "../lib/calendar.mjs";

// كل عمليات لوحة التحكم. كل إجراء عدا "login" يتطلب جلسة صالحة، وكل إجراء يتحقق من صلاحية صاحبها.
const DENY = () => json({ error: "ليست لديك صلاحية لهذا الإجراء." }, 403);
const EXAM_KINDS = ["اختبار قصير", "اختبار فترة", "اختبار نهائي", "اختبار عملي", "تسليم مشروع", "واجب"];
const DAYS = 5; // الأحد إلى الخميس
const MAX_PERIODS = 8;

async function allItems(complaints) {
  const { blobs } = await complaints.list();
  return (await Promise.all(blobs.map(async ({ key }) => {
    const v = await complaints.get(key, { type: "json" });
    return v ? { key, ...v } : null;
  }))).filter(Boolean);
}
/** الاستفسار مؤرشف إذا أُغلق/حُلّ منذ أكثر من المدة المحددة في الإعدادات */
function isArchived(i, settings) {
  const days = Number(settings.archiveDays) || 0;
  if (!days || !CLOSED.includes(i.status)) return false;
  const t = Date.parse(i.resolvedAt || i.updatedAt || i.createdAt);
  return Number.isFinite(t) && Date.now() - t > days * 864e5;
}
const cleanTime = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : "");

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }
  const action = String(b.action || "");

  // ===== الدخول =====
  if (action === "login") {
    if (!(await rateLimit(context, "login", 10, 15 * 60 * 1000))) {
      return json({ error: "محاولات دخول كثيرة. حاول بعد 15 دقيقة." }, 429);
    }
    if (!normUser(b.username) && !adminConfigured()) {
      return json({ error: "لم يُضبط الرقم السري بعد. أضف المتغير ADMIN_PASSWORD في إعدادات Netlify ثم أعد النشر." }, 503);
    }
    const s = await login(b.username, String(b.password || ""));
    if (!s) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: normUser(b.username) ? "اسم الدخول أو الرقم السري غير صحيح" : "الرقم السري غير صحيح" }, 401);
    }
    return json({ ok: true, ...issueToken(s.id), me: publicMe(s) });
  }

  const me = await getSession(req);
  if (!me) return json({ error: "انتهت الجلسة. سجّل الدخول من جديد.", auth: false }, 401);

  // حساب برقم مؤقت: لا يُسمح إلا بتغيير الرقم أولًا
  if (me.mustChange && !["me", "change-password"].includes(action)) {
    return json({ error: "غيّر الرقم السري المؤقت أولًا.", mustChange: true }, 403);
  }

  const complaints = store("complaints");
  const students = store("students");
  const annStore = store("announcements");

  switch (action) {
    case "me":
      return json({ ok: true, me: publicMe(me) });

    case "change-password": {
      if (me.owner) return json({ error: "رقم مدير النظام يُغيَّر من إعدادات Netlify (ADMIN_PASSWORD)." }, 400);
      const nw = String(b.newPassword || "");
      if (nw.length < 8) return json({ error: "الرقم السري الجديد يجب أن يكون 8 خانات على الأقل." }, 400);
      const list = await loadUsers();
      const u = list.find((x) => x.id === me.id);
      if (!u) return json({ error: "الحساب غير موجود" }, 404);
      if (!checkUserPassword(u, String(b.currentPassword || ""))) return json({ error: "الرقم السري الحالي غير صحيح." }, 400);
      if (checkUserPassword(u, nw)) return json({ error: "اختر رقمًا مختلفًا عن الحالي." }, 400);
      setPassword(u, nw); u.mustChange = false; u.updatedAt = new Date().toISOString();
      await saveUsers(list);
      return json({ ok: true, me: publicMe({ ...me, mustChange: false }) });
    }

    // ===== الاستفسارات =====
    case "list": {
      const settings = await getContent("settings", DEFAULT_SETTINGS);
      const list = (await allItems(complaints)).filter((i) => canItem(me, i))
        .map((i) => ({ ...i, archived: isArchived(i, settings) }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ ok: true, items: list, settings });
    }

    case "update": {
      const key = String(b.key || "");
      const cur = await complaints.get(key, { type: "json" });
      if (!cur) return json({ error: "الطلب غير موجود" }, 404);
      if (!canItem(me, cur)) return DENY();
      const now = new Date().toISOString();
      cur.log = cur.log || [];
      if (b.status != null && b.status !== cur.status) {
        if (!STATUSES.includes(b.status)) return json({ error: "حالة غير صالحة" }, 400);
        cur.log.push({ at: now, by: me.name, text: `غيّر الحالة إلى «${b.status}»` });
        cur.status = b.status;
        if (CLOSED.includes(b.status)) { if (!cur.resolvedAt) cur.resolvedAt = now; }
        else cur.resolvedAt = null;
      }
      if (b.adminNote != null && clean(b.adminNote, 2000) !== (cur.adminNote || "")) {
        cur.adminNote = clean(b.adminNote, 2000);
        cur.log.push({ at: now, by: me.name, text: "عدّل الملاحظات الداخلية" });
      }
      const reply = clean(b.reply, 2000);
      if (reply) {
        cur.messages = cur.messages || [];
        cur.messages.push({ from: "admin", text: reply, at: now, by: me.name, role: me.role });
        cur.log.push({ at: now, by: me.name, text: "ردّ على الطالب" });
        if (!cur.firstReplyAt) cur.firstReplyAt = now;
        if (b.status == null && cur.status === "جديد") cur.status = "تم الرد";
      }
      cur.unreadByAdmin = false;
      cur.updatedAt = now;
      await complaints.setJSON(key, cur);
      if (reply) background(context, notify(toStudent(cur.studentId), { title: "وصل رد على استفسارك", body: cur.ticket + " · " + reply.slice(0, 90), url: "/#track", tag: "t-" + cur.ticket }));
      return json({ ok: true, item: { key, ...cur } });
    }

    case "mark-read": {
      const key = String(b.key || "");
      const cur = await complaints.get(key, { type: "json" });
      if (!cur) return json({ error: "الطلب غير موجود" }, 404);
      if (!canItem(me, cur)) return DENY();
      if (cur.unreadByAdmin) {
        cur.unreadByAdmin = false;
        cur.log = cur.log || []; cur.log.push({ at: new Date().toISOString(), by: me.name, text: "فتح الطلب" });
        await complaints.setJSON(key, cur);
      }
      return json({ ok: true });
    }

    case "delete": {
      if (!me.owner) return DENY();
      await complaints.delete(String(b.key || ""));
      return json({ ok: true });
    }

    case "backup": {
      if (!me.owner) return DENY();
      const items = await allItems(complaints);
      const studentsData = await students.get("data", { type: "json" });
      const ann = (await annStore.get("list", { type: "json" })) || [];
      const extra = {};
      for (const k of ["faq", "timetable", "exams", "calendar", "settings", "calls", "events", "honor", "polls", "ideas", "videos", "files"]) extra[k] = await getContent(k);
      return json({ ok: true, backup: { createdAt: new Date().toISOString(), complaints: items, announcements: ann, students: studentsData || null, content: extra } });
    }


    // ===== الإشعارات وحالة المنصات =====
    case "push-stats": {
      if (!me.owner) return DENY();
      const list = await allSubs();
      const by = {}; for (const s of list) by[s.grade || "—"] = (by[s.grade || "—"] || 0) + 1;
      return json({ ok: true, total: list.length, byGrade: by });
    }
    case "status-get": {
      if (!me.owner && !me.perms.announcements) return DENY();
      return json({ ok: true, manual: await getManual(), status: await publicStatus({ refreshIfOlderMin: 15 }) });
    }
    case "status-save": {
      if (!me.owner && !me.perms.announcements) return DENY();
      return json({ ok: true, manual: await setManual(b.manual) });
    }

    // ===== التحويل بين المسؤولين =====
    case "staff": {
      return json({ ok: true, items: await staffList() });
    }

    case "assign": {
      const key = String(b.key || "");
      const cur = await complaints.get(key, { type: "json" });
      if (!cur) return json({ error: "الطلب غير موجود" }, 404);
      if (!canItem(me, cur)) return DENY();
      const to = String(b.to || "");
      const now = new Date().toISOString();
      cur.log = cur.log || [];
      if (!to) {
        cur.assignedTo = ""; cur.assignedName = ""; cur.assignedRole = "";
        cur.log.push({ at: now, by: me.name, text: "ألغى التحويل" });
      } else {
        const target = (await staffList()).find((x) => x.id === to);
        if (!target) return json({ error: "المسؤول غير موجود أو موقوف." }, 400);
        cur.assignedTo = target.id; cur.assignedName = target.name; cur.assignedRole = target.role;
        cur.assignedAt = now; cur.assignedBy = me.name;
        cur.unreadByAdmin = true;
        const note = clean(b.note, 300);
        cur.log.push({ at: now, by: me.name, text: `حوّل الطلب إلى ${target.name} (${target.role})` + (note ? `: ${note}` : "") });
        if (cur.status === "جديد") cur.status = "قيد المعالجة";
      }
      cur.updatedAt = now;
      await complaints.setJSON(key, cur);
      return json({ ok: true, item: { key, ...cur } });
    }

    // ===== المؤشرات والتقرير الشهري =====
    case "stats": {
      const month = /^\d{4}-\d{2}$/.test(String(b.month || "")) ? b.month : todayRiyadh().slice(0, 7);
      const list = (await allItems(complaints)).filter((i) => canItem(me, i));
      return json({ ok: true, stats: computeStats(list, month, me) });
    }

    // ===== الإعدادات وحفظ البيانات =====
    case "settings-get":
      return json({ ok: true, settings: await getContent("settings", DEFAULT_SETTINGS) });

    case "settings-save": {
      if (!me.owner) return DENY();
      const days = Number(b.archiveDays);
      const st = { archiveDays: [0, 30, 60, 90].includes(days) ? days : 30, maskPhones: !!b.maskPhones };
      await content().setJSON("settings", st);
      return json({ ok: true, settings: st });
    }

    case "purge-archive": {
      if (!me.owner) return DENY();
      if (b.confirm !== "حذف") return json({ error: "يلزم تأكيد الحذف." }, 400);
      const settings = await getContent("settings", DEFAULT_SETTINGS);
      if (!Number(settings.archiveDays)) return json({ error: "الأرشفة غير مفعّلة." }, 400);
      const old = (await allItems(complaints)).filter((i) => isArchived(i, settings));
      for (const i of old) await complaints.delete(i.key);
      return json({ ok: true, deleted: old.length });
    }

    // ===== الأسئلة الشائعة =====
    case "faq-list": {
      if (!me.perms.faq) return DENY();
      const stored = await getContent("faq");
      return json({ ok: true, items: stored ?? DEFAULT_FAQ, isDefault: stored == null, cats: FAQ_CATS });
    }

    case "faq-save": {
      if (!me.perms.faq) return DENY();
      if (!Array.isArray(b.items) || b.items.length > 100) return json({ error: "قائمة غير صالحة" }, 400);
      const items = [];
      for (const x of b.items) {
        const it = { id: /^[a-z0-9]{1,20}$/i.test(x?.id || "") ? x.id : newId(), cat: clean(x?.cat, 30) || "عام",
          q: clean(x?.q, 200), a: clean(x?.a, 1500), link: clean(x?.link, 400), hidden: !!x?.hidden };
        if (it.q.length < 5 || it.a.length < 5) return json({ error: "كل سؤال يحتاج نصًا وإجابة (5 أحرف على الأقل)." }, 400);
        if (it.link && !/^https:\/\/[^\s]+$/i.test(it.link)) return json({ error: "الرابط يجب أن يبدأ بـ https:// (السؤال: " + it.q.slice(0, 40) + ")" }, 400);
        items.push(it);
      }
      await content().setJSON("faq", items);
      return json({ ok: true, items });
    }

    // ===== الجداول الدراسية =====
    case "tt-get": {
      if (!me.perms.schedule) return DENY();
      return json({ ok: true, timetable: await getContent("timetable", { periods: [], sections: {} }) });
    }

    case "tt-save": {
      if (!me.perms.schedule) return DENY();
      const tt = await getContent("timetable", { periods: [], sections: {} });
      if (Array.isArray(b.periods)) {
        const periods = b.periods.slice(0, MAX_PERIODS).map((p) => ({ start: cleanTime(p?.start), end: cleanTime(p?.end) }));
        if (!periods.length) return json({ error: "حدد عدد الحصص وأوقاتها." }, 400);
        if (periods.some((p) => !p.start)) return json({ error: "اكتب وقت بداية كل حصة بصيغة 07:00." }, 400);
        tt.periods = periods;
      }
      const putSection = (sec, grid) => {
        if (!SECTIONS.includes(String(sec))) throw new Error("شعبة غير صالحة: " + sec);
        if (!Array.isArray(grid)) throw new Error("جدول غير صالح");
        const rows = Array.from({ length: DAYS }, (_, d) => Array.from({ length: tt.periods.length || MAX_PERIODS }, (_, p) => clean(grid[d]?.[p], 30)));
        if (rows.flat().every((x) => !x)) delete tt.sections[sec]; else tt.sections[sec] = rows;
      };
      try {
        if (b.section != null) putSection(String(b.section), b.grid);
        if (b.bulk && typeof b.bulk === "object") {
          const keys = Object.keys(b.bulk);
          if (keys.length > SECTIONS.length) throw new Error("عدد الشعب أكبر من المسموح");
          if (b.replaceAll) tt.sections = {};
          for (const k of keys) putSection(k, b.bulk[k]);
        }
      } catch (ex) { return json({ error: ex.message }, 400); }
      // أوقات بديلة (رمضان/الاختبارات) وفترات تطبيقها
      if (b.modes && typeof b.modes === "object") {
        tt.modes = {};
        for (const m of ["ramadan", "exams"]) {
          const ps = Array.isArray(b.modes[m]) ? b.modes[m].slice(0, MAX_PERIODS).map((p) => ({ start: cleanTime(p?.start), end: cleanTime(p?.end) })) : [];
          if (ps.some((p) => p.start)) tt.modes[m] = ps;
        }
      }
      if (Array.isArray(b.ranges)) {
        const rs = b.ranges.slice(0, 20).map((r) => ({ mode: ["ramadan", "exams"].includes(r?.mode) ? r.mode : "", from: ISO_DAY.test(r?.from) ? r.from : "", to: ISO_DAY.test(r?.to) ? r.to : "", label: clean(r?.label, 40) }));
        for (const r of rs) if (!r.mode || !r.from || !r.to || r.to < r.from) return json({ error: "تحقق من فترات التوقيت: النوع والتاريخان مطلوبة، والنهاية بعد البداية." }, 400);
        tt.ranges = rs;
      }
      tt.updatedAt = new Date().toISOString(); tt.updatedBy = me.name;
      await content().setJSON("timetable", tt);
      return json({ ok: true, timetable: tt });
    }

    // ===== الاختبارات والتسليمات =====
    case "exams-list": {
      if (!me.perms.schedule) return DENY();
      const list = await getContent("exams", []);
      return json({ ok: true, items: list.sort((a, b) => (a.date < b.date ? -1 : 1)), kinds: EXAM_KINDS });
    }

    case "exam-save": {
      if (!me.perms.schedule) return DENY();
      const e = {
        subject: clean(b.subject, 60), kind: EXAM_KINDS.includes(b.kind) ? b.kind : EXAM_KINDS[0],
        date: ISO_DAY.test(b.date) ? b.date : "", period: Number.isInteger(+b.period) && +b.period >= 1 && +b.period <= MAX_PERIODS ? +b.period : null,
        grade: GRADES.includes(b.grade) ? b.grade : "", section: SECTIONS.includes(String(b.section)) ? String(b.section) : "",
        note: clean(b.note, 200),
      };
      if (e.subject.length < 2) return json({ error: "اكتب اسم المادة." }, 400);
      if (!e.date) return json({ error: "حدد تاريخ الاختبار." }, 400);
      if (!e.grade && !e.section) return json({ error: "اختر الصف أو الشعبة." }, 400);
      const list = await getContent("exams", []);
      let item;
      if (b.id) {
        item = list.find((x) => x.id === b.id);
        if (!item) return json({ error: "الاختبار غير موجود" }, 404);
        Object.assign(item, e, { updatedAt: new Date().toISOString(), updatedBy: me.name });
      } else {
        // حذف الاختبارات التي مضى عليها أكثر من 60 يومًا تلقائيًا
        const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
        for (let i = list.length - 1; i >= 0; i--) if (list[i].date < cutoff) list.splice(i, 1);
        if (list.length >= 400) return json({ error: "وصلت للحد الأقصى من الاختبارات." }, 400);
        item = { id: newId(), ...e, createdAt: new Date().toISOString(), by: me.name };
        list.push(item);
      }
      await content().setJSON("exams", list);
      return json({ ok: true, item });
    }

    case "exam-delete": {
      if (!me.perms.schedule) return DENY();
      const list = await getContent("exams", []);
      await content().setJSON("exams", list.filter((x) => x.id !== b.id));
      return json({ ok: true });
    }

    // ===== التقويم الدراسي (لمدير النظام) =====
    case "cal-get": {
      if (!me.owner) return DENY();
      return json({ ok: true, calendar: await getContent("calendar") });
    }

    case "cal-save": {
      if (!me.owner) return DENY();
      if (b.reset) { await content().delete("calendar"); return json({ ok: true, calendar: null }); }
      const r = cleanCalendar(b.calendar);
      if (r.error) return json({ error: r.error }, 400);
      await content().setJSON("calendar", { ...r.calendar, updatedAt: new Date().toISOString(), updatedBy: me.name });
      return json({ ok: true, calendar: r.calendar });
    }

    // ===== الإعلانات =====
    case "ann-list": {
      if (!me.perms.announcements) return DENY();
      const list = (await annStore.get("list", { type: "json" })) || [];
      return json({ ok: true, items: list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
    }

    case "ann-save": {
      if (!me.perms.announcements) return DENY();
      const a = {
        title: clean(b.title, 120),
        body: clean(b.body, 600),
        type: ["urgent", "warn", "info", "congrats"].includes(b.type) ? b.type : "info",
        link: clean(b.link, 400),
        grade: GRADES.includes(b.grade) ? b.grade : "",
        section: "",
        sections: cleanSections(b.sections ?? (b.section ? [b.section] : [])),
        from: ISO_DAY.test(b.from) ? b.from : "",
        to: ISO_DAY.test(b.to) ? b.to : "",
        pinned: !!b.pinned,
        hidden: !!b.hidden,
        notify: b.notify !== false,
      };
      if (a.title.length < 3) return json({ error: "اكتب عنوانًا للإعلان (3 أحرف على الأقل)." }, 400);
      if (a.link && !/^https:\/\/[^\s]+$/i.test(a.link)) return json({ error: "الرابط يجب أن يبدأ بـ https://" }, 400);
      if (!a.from || !a.to) return json({ error: "حدّد تاريخ البداية والانتهاء." }, 400);
      if (a.to < a.from) return json({ error: "تاريخ الانتهاء قبل تاريخ البداية." }, 400);

      const list = (await annStore.get("list", { type: "json" })) || [];
      const now = new Date().toISOString();
      let item;
      if (b.id) {
        item = list.find((x) => x.id === b.id);
        if (!item) return json({ error: "الإعلان غير موجود" }, 404);
        Object.assign(item, a, { updatedAt: now, updatedBy: me.name });
      } else {
        if (list.length >= 200) return json({ error: "وصلت للحد الأقصى من الإعلانات. احذف القديمة أولًا." }, 400);
        item = { id: newId(), ...a, createdAt: now, by: me.name };
        list.push(item);
      }
      // تسجيل صوتي اختياري للإعلان (يُسجّل من المتصفح أو يُرفع ملفًا)
      const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-m4a"];
      if (b.audio && b.audio.data) {
        const type = String(b.audio.type || "").split(";")[0];
        if (!AUDIO.includes(type)) return json({ error: "صيغة التسجيل غير مدعومة. المسموح: MP3 أو M4A أو WEBM أو OGG أو WAV." }, 400);
        let buf; try { buf = Buffer.from(String(b.audio.data), "base64"); } catch { buf = null; }
        if (!buf || !buf.length) return json({ error: "تعذر قراءة التسجيل." }, 400);
        if (buf.length > 4 * 1024 * 1024) return json({ error: "التسجيل أكبر من 4 ميجابايت. اجعله أقصر (دقيقتان تكفي)." }, 400);
        await store("files").set("ann-audio-" + item.id, buf);
        Object.assign(item, { audioType: type, audioV: Date.now(), audioSec: Math.min(600, Math.max(0, +b.audio.sec || 0)) });
      } else if (b.audioRemove && item.audioType) {
        await store("files").delete("ann-audio-" + item.id);
        delete item.audioType; delete item.audioV; delete item.audioSec;
      }
      await annStore.setJSON("list", list);
      // إشعار فوري للطلاب المستهدفين عند نشر إعلان جديد يبدأ اليوم (المجدول يُرسل صباح يوم بدايته)
      if (!b.id && a.notify && !a.hidden && a.from <= todayRiyadh() && a.to >= todayRiyadh())
        background(context, notify(toAudience(a), { title: a.title, body: a.body || "إعلان جديد من المدرسة", url: "/#news", tag: "ann-" + item.id }));
      return json({ ok: true, item });
    }

    case "ann-delete": {
      if (!me.perms.announcements) return DENY();
      const list = (await annStore.get("list", { type: "json" })) || [];
      await annStore.setJSON("list", list.filter((x) => x.id !== b.id));
      await store("files").delete("ann-audio-" + String(b.id || ""));
      return json({ ok: true });
    }

    // ===== المسؤولون (لمدير النظام فقط) =====
    case "users-list": {
      if (!me.owner) return DENY();
      const list = await loadUsers();
      return json({ ok: true, roles: ROLES, types: TYPES, slots: ROLE_SLOTS,
        items: list.map(({ salt, hash, ...u }) => u) });
    }

    case "users-save": {
      if (!me.owner) return DENY();
      const list = await loadUsers();
      const name = clean(b.name, 60), username = normUser(b.username), role = ROLES.includes(b.role) ? b.role : "أخرى", title = role === "أخرى" ? clean(b.title, 40) : "";
      if (name.length < 2) return json({ error: "اكتب اسم المسؤول." }, 400);
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: "اسم الدخول بالإنجليزية من 3 إلى 30 حرفًا أو رقمًا، بدون مسافات (مثل khaled)." }, 400);
      if (list.some((x) => x.username === username && x.id !== b.id)) return json({ error: "اسم الدخول مستخدم لمسؤول آخر." }, 400);
      const perms = cleanPerms(b.perms);
      const now = new Date().toISOString();
      if (b.id) {
        const u = list.find((x) => x.id === b.id);
        if (!u) return json({ error: "الحساب غير موجود" }, 404);
        Object.assign(u, { name, username, role, title, perms, updatedAt: now });
        await saveUsers(list);
        return json({ ok: true });
      }
      if (list.length >= 30) return json({ error: "الحد الأقصى 30 مسؤولًا." }, 400);
      const temp = tempPassword();
      const u = { id: newId(), name, username, role, title, perms, active: true, mustChange: true, createdAt: now };
      setPassword(u, temp);
      list.push(u);
      await saveUsers(list);
      return json({ ok: true, tempPassword: temp, username });
    }

    case "users-reset": {
      if (!me.owner) return DENY();
      const list = await loadUsers();
      const u = list.find((x) => x.id === b.id);
      if (!u) return json({ error: "الحساب غير موجود" }, 404);
      const temp = tempPassword();
      setPassword(u, temp); u.mustChange = true; u.updatedAt = new Date().toISOString();
      await saveUsers(list);
      return json({ ok: true, tempPassword: temp, username: u.username });
    }

    case "users-toggle": {
      if (!me.owner) return DENY();
      const list = await loadUsers();
      const u = list.find((x) => x.id === b.id);
      if (!u) return json({ error: "الحساب غير موجود" }, 404);
      u.active = !u.active; u.updatedAt = new Date().toISOString();
      await saveUsers(list);
      return json({ ok: true, active: u.active });
    }

    case "users-delete": {
      if (!me.owner) return DENY();
      await saveUsers((await loadUsers()).filter((x) => x.id !== b.id));
      return json({ ok: true });
    }

    // ===== بيانات الطلاب =====
    case "students-info": {
      if (!me.perms.students) return DENY();
      const d = await students.get("data", { type: "json" });
      if (!d) return json({ ok: true, info: null });
      return json({ ok: true, info: { fileName: d.fileName, updatedAt: d.updatedAt, count: Object.keys(d.records || {}).length, columns: d.columns, idColumn: d.idColumn, roles: d.roles || {} } });
    }

    case "students-sample": {
      if (!me.perms.students) return DENY();
      const d = await students.get("data", { type: "json" });
      if (!d) return json({ ok: true, rows: [] });
      const rows = Object.entries(d.records || {}).slice(0, 15).map(([id, r]) => ({ ...r, [d.idColumn]: id }));
      return json({ ok: true, columns: d.columns, rows });
    }

    case "students-save": {
      if (!me.perms.students) return DENY();
      const columns = Array.isArray(b.columns) ? b.columns.map((c) => clean(c, 60)).filter(Boolean).slice(0, 40) : [];
      const idColumn = clean(b.idColumn, 60);
      if (!columns.length || !columns.includes(idColumn)) return json({ error: "حدّد عمود رقم الهوية" }, 400);
      if (!Array.isArray(b.rows) || !b.rows.length) return json({ error: "لا توجد صفوف للحفظ" }, 400);
      if (b.rows.length > 20000) return json({ error: "عدد الصفوف كبير جدًا" }, 400);
      const roles = {};
      for (const k of ["name", "grade", "section", "email"]) {
        const v = clean(b.roles?.[k], 60);
        if (v && columns.includes(v)) roles[k] = v;
      }
      const records = {};
      let skipped = 0;
      for (const r of b.rows) {
        const id = normalizeId(r?.[idColumn]);
        if (!/^\d{10}$/.test(id)) { skipped++; continue; }
        const o = {};
        for (const c of columns) if (c !== idColumn) o[c] = clean(r?.[c], 300);
        records[id] = o;
      }
      const count = Object.keys(records).length;
      if (!count) return json({ error: "لم يُعثر على أرقام هوية صحيحة (10 أرقام) في العمود المحدد" }, 400);
      await students.setJSON("data", { fileName: clean(b.fileName, 150), updatedAt: new Date().toISOString(), columns, idColumn, roles, records });
      return json({ ok: true, count, skipped, duplicates: b.rows.length - skipped - count });
    }

    case "students-clear": {
      if (!me.owner) return DENY();
      await students.delete("data");
      return json({ ok: true });
    }

    default: {
      const r = await extraAction(action, b, me, context);
      return r || json({ error: "إجراء غير معروف" }, 400);
    }
  }
};

export const config = { path: "/api/admin" };
