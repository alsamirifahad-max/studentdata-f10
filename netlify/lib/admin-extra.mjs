// إجراءات لوحة التحكم الإضافية: الاستدعاءات، الفعاليات، لوحة الشرف، الاستطلاعات، المبادرات، المكتبة (ملفات وفيديوهات)
import { json, store, clean, normalizeId, getContent, content, todayRiyadh, addDays, ISO_DAY, GRADES, SECTIONS,
  cleanSections, findStudent, officialInfo, DEFAULT_FILES } from "./common.mjs";
import { newId } from "./auth.mjs";
import { notify, toStudent, background } from "./push.mjs";
import { finalsAction } from "./finals.mjs";

const DENY = () => json({ error: "ليست لديك صلاحية لهذا الإجراء." }, 403);
const bad = (m) => json({ error: m }, 400);
const now = () => new Date().toISOString();
const httpsOk = (u) => !u || /^https:\/\/[^\s]+$/i.test(u);

export const EVENT_KINDS = ["نشاط مدرسي", "مسابقة", "تسجيل", "اختبار وطني", "الخريجين", "فعالية"];
export const HONOR_CATS = ["التفوق الدراسي", "المسابقات", "المواظبة", "السلوك المتميز", "التطوع", "مبادرة"];
export const IDEA_STATUSES = ["بانتظار المراجعة", "منشورة للتصويت", "قيد التنفيذ", "نُفذت", "غير مناسبة"];
export const PUBLIC_IDEA = ["منشورة للتصويت", "قيد التنفيذ", "نُفذت"];
export const FILE_SECTIONS = { faq: "الأسئلة الشائعة", platforms: "المنصات التعليمية", grad: "بوابة الخريج", new: "رحلة الطالب المستجد", general: "ملفات عامة", finals: "الاختبارات النهائية", guide: "صورة الدليل المصور (مدرستي وتيمز)" };
const FILE_TYPES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_FILE = 4 * 1024 * 1024;

/** يستخرج معرّف مقطع يوتيوب من أي صيغة رابط شائعة */
export function youtubeId(u) {
  const m = String(u || "").match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

/** حفظ عنصر في قائمة (إضافة أو تعديل) مع حد أقصى */
async function upsert(key, b, item, max, me) {
  const list = await getContent(key, []);
  let out;
  if (b.id) {
    out = list.find((x) => x.id === b.id);
    if (!out) return { error: "العنصر غير موجود" };
    Object.assign(out, item, { updatedAt: now(), updatedBy: me.name });
  } else {
    if (list.length >= max) return { error: "وصلت للحد الأقصى. احذف العناصر القديمة أولًا." };
    out = { id: newId(), ...item, createdAt: now(), by: me.name };
    list.push(out);
  }
  await content().setJSON(key, list);
  return { item: out };
}
async function remove(key, id) {
  const list = await getContent(key, []);
  await content().setJSON(key, list.filter((x) => x.id !== id));
}
const reply = (r) => (r.error ? bad(r.error) : json({ ok: true, item: r.item }));

export async function extraAction(action, b, me, context) {
  const fin = await finalsAction(action, b, me);
  if (fin) return fin;
  switch (action) {
    // ===== استدعاء طالب =====
    case "calls-list": {
      if (!me.perms.calls) return DENY();
      const list = (await getContent("calls", [])).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ ok: true, items: list });
    }
    case "calls-student": {
      if (!me.perms.calls) return DENY();
      const id = normalizeId(b.studentId);
      if (!/^\d{10}$/.test(id)) return bad("رقم الهوية 10 أرقام.");
      const { data, row } = await findStudent(id);
      if (!row) return bad("رقم الهوية غير موجود في ملف الطلاب.");
      return json({ ok: true, student: { id, ...officialInfo(data, row) } });
    }
    case "calls-save": {
      if (!me.perms.calls) return DENY();
      const studentId = normalizeId(b.studentId);
      const { data, row } = await findStudent(studentId);
      if (!row) return bad("رقم الهوية غير موجود في ملف الطلاب.");
      const off = officialInfo(data, row);
      const item = {
        studentId, name: off.name, grade: off.grade, section: off.section,
        text: clean(b.text, 300), place: clean(b.place, 80), when: clean(b.when, 80),
        from: me.owner ? "إدارة المدرسة" : me.role,
        expires: ISO_DAY.test(b.expires) ? b.expires : addDays(todayRiyadh(), 7),
      };
      if (item.text.length < 3) return bad("اكتب سبب الاستدعاء أو المطلوب من الطالب.");
      if (item.expires < todayRiyadh()) return bad("تاريخ الانتهاء مضى.");
      if (b.id) item.seenAt = null; // تعديل الاستدعاء يعيده غير مقروء
      const r = await upsert("calls", b, item, 500, me);
      if (!r.error) background(context, notify(toStudent(studentId), { title: "استدعاء من " + item.from, body: item.text + (item.when ? " · " + item.when : ""), url: "/#mydata", tag: "call-" + r.item.id }));
      return reply(r);
    }
    case "calls-delete": {
      if (!me.perms.calls) return DENY();
      await remove("calls", b.id);
      return json({ ok: true });
    }

    // ===== الفعاليات والمواعيد =====
    case "events-list": {
      if (!me.perms.events) return DENY();
      return json({ ok: true, items: (await getContent("events", [])).sort((a, b) => (a.date < b.date ? -1 : 1)), kinds: EVENT_KINDS });
    }
    case "events-save": {
      if (!me.perms.events) return DENY();
      const item = {
        title: clean(b.title, 120), kind: EVENT_KINDS.includes(b.kind) ? b.kind : EVENT_KINDS[0],
        date: ISO_DAY.test(b.date) ? b.date : "", end: ISO_DAY.test(b.end) ? b.end : "", deadline: ISO_DAY.test(b.deadline) ? b.deadline : "",
        link: clean(b.link, 400), grade: GRADES.includes(b.grade) ? b.grade : "", note: clean(b.note, 300),
      };
      if (item.title.length < 3) return bad("اكتب عنوان الفعالية.");
      if (!item.date) return bad("حدد تاريخ الفعالية.");
      if (item.end && item.end < item.date) return bad("تاريخ النهاية قبل البداية.");
      if (!httpsOk(item.link)) return bad("الرابط يجب أن يبدأ بـ https://");
      return reply(await upsert("events", b, item, 300, me));
    }
    case "events-delete": {
      if (!me.perms.events) return DENY();
      await remove("events", b.id);
      return json({ ok: true });
    }

    // ===== لوحة الشرف =====
    case "honor-list": {
      if (!me.perms.honor) return DENY();
      return json({ ok: true, items: (await getContent("honor", [])).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), cats: HONOR_CATS });
    }
    case "honor-save": {
      if (!me.perms.honor) return DENY();
      const item = {
        name: clean(b.name, 60), grade: GRADES.includes(b.grade) ? b.grade : "", section: SECTIONS.includes(String(b.section)) ? String(b.section) : "",
        title: clean(b.title, 120), cat: HONOR_CATS.includes(b.cat) ? b.cat : HONOR_CATS[0], period: clean(b.period, 40), hidden: !!b.hidden, consent: !!b.consent,
      };
      if (item.name.length < 3) return bad("اكتب اسم الطالب.");
      if (item.title.length < 3) return bad("اكتب الإنجاز.");
      if (!item.consent) return bad("أكّد أن المدرسة وافقت على نشر اسم الطالب.");
      return reply(await upsert("honor", b, item, 200, me));
    }
    case "honor-delete": {
      if (!me.perms.honor) return DENY();
      await remove("honor", b.id);
      return json({ ok: true });
    }

    // ===== الاستطلاعات =====
    case "polls-list": {
      if (!me.perms.polls) return DENY();
      const list = await getContent("polls", []);
      const votes = store("votes");
      const items = await Promise.all(list.map(async (p) => {
        const v = (await votes.get(p.id, { type: "json" })) || { counts: [] };
        return { ...p, counts: p.options.map((_, i) => v.counts[i] || 0) };
      }));
      return json({ ok: true, items: items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) });
    }
    case "polls-save": {
      if (!me.perms.polls) return DENY();
      const options = (Array.isArray(b.options) ? b.options : []).map((o) => clean(o, 80)).filter(Boolean).slice(0, 6);
      const item = {
        q: clean(b.q, 200), options, grade: GRADES.includes(b.grade) ? b.grade : "", sections: cleanSections(b.sections),
        until: ISO_DAY.test(b.until) ? b.until : addDays(todayRiyadh(), 7), showResults: !!b.showResults, closed: !!b.closed,
      };
      if (item.q.length < 5) return bad("اكتب سؤال الاستطلاع.");
      if (options.length < 2) return bad("أضف خيارين على الأقل.");
      if (b.id) {
        const old = (await getContent("polls", [])).find((x) => x.id === b.id);
        const v = await store("votes").get(b.id, { type: "json" });
        if (old && v && v.total && old.options.length !== options.length) return bad("لا يمكن تغيير عدد الخيارات بعد بدء التصويت.");
      }
      return reply(await upsert("polls", b, item, 100, me));
    }
    case "polls-delete": {
      if (!me.perms.polls) return DENY();
      await remove("polls", b.id);
      await store("votes").delete(String(b.id || ""));
      return json({ ok: true });
    }

    // ===== صندوق المبادرات =====
    case "ideas-list": {
      if (!me.perms.polls) return DENY();
      const list = (await getContent("ideas", [])).map(({ voters, ...x }) => x).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ ok: true, items: list, statuses: IDEA_STATUSES });
    }
    case "ideas-update": {
      if (!me.perms.polls) return DENY();
      const list = await getContent("ideas", []);
      const it = list.find((x) => x.id === b.id);
      if (!it) return bad("المبادرة غير موجودة");
      if (b.status != null) { if (!IDEA_STATUSES.includes(b.status)) return bad("حالة غير صالحة"); it.status = b.status; }
      if (b.title != null) it.title = clean(b.title, 100) || it.title;
      if (b.body != null) it.body = clean(b.body, 600) || it.body;
      if (b.reply != null) it.reply = clean(b.reply, 300);
      it.updatedAt = now(); it.updatedBy = me.name;
      await content().setJSON("ideas", list);
      const { voters, ...pub } = it;
      return json({ ok: true, item: pub });
    }
    case "ideas-delete": {
      if (!me.perms.polls) return DENY();
      await remove("ideas", b.id);
      return json({ ok: true });
    }

    // ===== المكتبة: الفيديوهات =====
    case "videos-list": {
      if (!me.perms.faq) return DENY();
      return json({ ok: true, items: await getContent("videos", []) });
    }
    case "videos-save": {
      if (!me.perms.faq) return DENY();
      const yt = youtubeId(b.url);
      const item = { title: clean(b.title, 100), url: clean(b.url, 300), yt, cat: clean(b.cat, 30) || "عام", hidden: !!b.hidden };
      if (item.title.length < 3) return bad("اكتب عنوان المقطع.");
      if (!yt) return bad("ضع رابط مقطع من يوتيوب (youtube.com أو youtu.be).");
      return reply(await upsert("videos", b, item, 100, me));
    }
    case "videos-delete": {
      if (!me.perms.faq) return DENY();
      await remove("videos", b.id);
      return json({ ok: true });
    }
    case "videos-order": {
      if (!me.perms.faq) return DENY();
      const list = await getContent("videos", []);
      const ids = Array.isArray(b.ids) ? b.ids : [];
      list.sort((a, c) => ids.indexOf(a.id) - ids.indexOf(c.id));
      await content().setJSON("videos", list);
      return json({ ok: true });
    }

    // ===== المكتبة: الملفات =====
    case "files-list": {
      if (!me.perms.faq) return DENY();
      const stored = await getContent("files");
      return json({ ok: true, items: stored ?? DEFAULT_FILES, sections: FILE_SECTIONS });
    }
    case "files-save": {
      if (!me.perms.faq && !(b.section === "finals" && me.perms.schedule)) return DENY();
      const list = (await getContent("files")) ?? DEFAULT_FILES.map((x) => ({ ...x }));
      const section = FILE_SECTIONS[b.section] ? b.section : "general";
      const meta = { title: clean(b.title, 120), section, cat: section === "faq" ? clean(b.cat, 30) : "" };
      if (section !== "guide" && meta.title.length < 3) return bad("اكتب عنوانًا للملف.");
      let blob = null;
      if (b.data) {
        const type = String(b.type || "");
        if (!FILE_TYPES[type]) return bad("نوع الملف غير مدعوم. المسموح: PDF أو صورة (PNG/JPG/WEBP).");
        if (section === "guide" && type === "application/pdf") return bad("صورة الدليل يجب أن تكون صورة وليست PDF.");
        try { blob = Buffer.from(String(b.data), "base64"); } catch { return bad("تعذر قراءة الملف."); }
        if (!blob.length) return bad("الملف فارغ.");
        if (blob.length > MAX_FILE) return bad("حجم الملف أكبر من 4 ميجابايت. اضغطه ثم أعد المحاولة.");
        Object.assign(meta, { type, size: blob.length, name: clean(b.name, 120), url: "" });
      }
      let item;
      if (section === "guide") {
        // صورة الدليل واحدة فقط: تُستبدل
        item = list.find((x) => x.section === "guide");
        if (!item && !blob) return bad("اختر صورة الدليل الجديدة.");
        if (!item) { item = { id: newId(), createdAt: now() }; list.push(item); }
        Object.assign(item, meta, { title: meta.title || "صورة الدليل المصور", updatedAt: now(), by: me.name });
      } else if (b.id) {
        item = list.find((x) => x.id === b.id);
        if (!item) return bad("الملف غير موجود");
        Object.assign(item, meta, { updatedAt: now(), by: me.name });
      } else {
        if (!blob) return bad("اختر الملف.");
        if (list.length >= 80) return bad("وصلت للحد الأقصى من الملفات.");
        item = { id: newId(), ...meta, createdAt: now(), updatedAt: now(), by: me.name };
        list.push(item);
      }
      if (blob) { await store("files").set(item.id, blob); item.v = Date.now(); }
      await content().setJSON("files", list);
      return json({ ok: true, item });
    }
    case "files-delete": {
      if (!me.perms.faq) return DENY();
      const list = (await getContent("files")) ?? DEFAULT_FILES.map((x) => ({ ...x }));
      await content().setJSON("files", list.filter((x) => x.id !== b.id));
      await store("files").delete(String(b.id || ""));
      return json({ ok: true });
    }
    case "files-order": {
      if (!me.perms.faq) return DENY();
      const list = (await getContent("files")) ?? DEFAULT_FILES.map((x) => ({ ...x }));
      const ids = Array.isArray(b.ids) ? b.ids : [];
      list.sort((a, c) => ids.indexOf(a.id) - ids.indexOf(c.id));
      await content().setJSON("files", list);
      return json({ ok: true });
    }
  }
  return null;
}

/** رابط الملف للطلاب: الملفات الافتراضية ثابتة في الموقع، والمرفوعة تُقرأ من التخزين */
export const fileUrl = (f) => (f.url ? f.url : "/api/file?id=" + encodeURIComponent(f.id) + (f.v ? "&v=" + f.v : ""));
