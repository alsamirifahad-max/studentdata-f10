import { json, store, clean, normalizeId, checkPassword, adminConfigured, issueToken, verifyToken, rateLimit, STATUSES } from "../lib/common.mjs";

// كل عمليات لوحة المسؤول. كل إجراء عدا "login" يتطلب رمز دخول صادرًا من الخادم.
export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }
  const action = String(b.action || "");

  if (action === "login") {
    if (!(await rateLimit(context, "login", 10, 15 * 60 * 1000))) {
      return json({ error: "محاولات دخول كثيرة. حاول بعد 15 دقيقة." }, 429);
    }
    if (!adminConfigured()) {
      return json({ error: "لم يُضبط الرقم السري بعد. أضف المتغير ADMIN_PASSWORD في إعدادات Netlify ثم أعد النشر." }, 503);
    }
    if (!checkPassword(String(b.password || ""))) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: "الرقم السري غير صحيح" }, 401);
    }
    return json({ ok: true, ...issueToken() });
  }

  if (!verifyToken(req)) return json({ error: "انتهت الجلسة. سجّل الدخول من جديد.", auth: false }, 401);

  const complaints = store("complaints");
  const students = store("students");

  switch (action) {
    case "list": {
      const { blobs } = await complaints.list();
      const items = await Promise.all(
        blobs.map(async ({ key }) => {
          const v = await complaints.get(key, { type: "json" });
          return v ? { key, ...v } : null;
        })
      );
      const list = items.filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ ok: true, items: list });
    }

    case "update": {
      const key = String(b.key || "");
      const cur = await complaints.get(key, { type: "json" });
      if (!cur) return json({ error: "البلاغ غير موجود" }, 404);
      if (b.status != null) {
        if (!STATUSES.includes(b.status)) return json({ error: "حالة غير صالحة" }, 400);
        cur.status = b.status;
      }
      if (b.adminNote != null) cur.adminNote = clean(b.adminNote, 2000);
      const now = new Date().toISOString();
      const reply = clean(b.reply, 2000);
      if (reply) {
        cur.messages = cur.messages || [];
        cur.messages.push({ from: "admin", text: reply, at: now });
        // كتابة رد على طلب جديد تجعله «تم الرد» تلقائيًا ما لم يختر المسؤول حالة أخرى
        if (b.status == null && cur.status === "جديد") cur.status = "تم الرد";
      }
      cur.unreadByAdmin = false;
      cur.updatedAt = now;
      await complaints.setJSON(key, cur);
      return json({ ok: true, item: { key, ...cur } });
    }

    case "mark-read": {
      const key = String(b.key || "");
      const cur = await complaints.get(key, { type: "json" });
      if (!cur) return json({ error: "البلاغ غير موجود" }, 404);
      if (cur.unreadByAdmin) { cur.unreadByAdmin = false; await complaints.setJSON(key, cur); }
      return json({ ok: true });
    }

    case "backup": {
      const { blobs } = await complaints.list();
      const items = (await Promise.all(blobs.map(async ({ key }) => {
        const v = await complaints.get(key, { type: "json" });
        return v ? { key, ...v } : null;
      }))).filter(Boolean);
      const studentsData = await students.get("data", { type: "json" });
      return json({ ok: true, backup: { createdAt: new Date().toISOString(), complaints: items, students: studentsData || null } });
    }

    case "delete": {
      const key = String(b.key || "");
      await complaints.delete(key);
      return json({ ok: true });
    }

    case "students-info": {
      const d = await students.get("data", { type: "json" });
      if (!d) return json({ ok: true, info: null });
      return json({
        ok: true,
        info: {
          fileName: d.fileName,
          updatedAt: d.updatedAt,
          count: Object.keys(d.records || {}).length,
          columns: d.columns,
          idColumn: d.idColumn,
          roles: d.roles || {},
        },
      });
    }

    case "students-sample": {
      const d = await students.get("data", { type: "json" });
      if (!d) return json({ ok: true, rows: [] });
      const rows = Object.entries(d.records || {}).slice(0, 15).map(([id, r]) => ({ ...r, [d.idColumn]: id }));
      return json({ ok: true, columns: d.columns, rows });
    }

    case "students-save": {
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

      await students.setJSON("data", {
        fileName: clean(b.fileName, 150),
        updatedAt: new Date().toISOString(),
        columns,
        idColumn,
        roles,
        records,
      });
      return json({ ok: true, count, skipped, duplicates: b.rows.length - skipped - count });
    }

    case "students-clear": {
      await students.delete("data");
      return json({ ok: true });
    }

    default:
      return json({ error: "إجراء غير معروف" }, 400);
  }
};

export const config = { path: "/api/admin" };
