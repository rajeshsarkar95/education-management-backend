const fs = require("fs");
const path = require("path");
const Admission = require("../models/Admission");
const { nextApplicationId } = require("../models/Admission");
const asyncHandler = require("../utils/asyncHandler");
const C = require("../utils/admissionConstants");
const { admissionBodySchema, statusBodySchema, listQuerySchema, formatZodError } = require("../utils/admissionValidation");

const TZ = process.env.ADMISSION_TZ_OFFSET || "+05:30"; 
const ID_RE = /^APP-\d{4}-\d{4,}$/;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const actor = (req) => req.user?.name || req.user?.email || "Admissions Office";

class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Validation failed", formatZodError(r.error));
  return r.data;
}

async function findOr404(id) {
  if (!ID_RE.test(id)) throw new HttpError(404, "Application not found");
  const app = await Admission.findOne({ applicationId: id, isDeleted: false });
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}

/* GET /api/admissions */
exports.list = asyncHandler(async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const filter = { isDeleted: false };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    filter.$or = [{ fullName: rx }, { applicationId: rx }];
  }
  if (q.status) filter.status = q.status;
  if (q.course) filter.course = q.course;
  if (q.session) filter.session = q.session;
  if (q.from || q.to) {
    if (q.from && q.to && q.from > q.to) throw new HttpError(400, "`from` must be on or before `to`");
    filter.applicationDate = {};
    if (q.from) filter.applicationDate.$gte = new Date(`${q.from}T00:00:00.000${TZ}`);
    if (q.to) filter.applicationDate.$lte = new Date(`${q.to}T23:59:59.999${TZ}`);
  }

  const sortField = { id: "applicationId", fullName: "nameKey" }[q.sortBy] || q.sortBy;
  const sort = { [sortField]: q.order === "asc" ? 1 : -1, _id: -1 };

  const [items, total] = await Promise.all([
    Admission.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    Admission.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) },
  });
});

/** "+05:30" -> minutes east of UTC */
function tzMinutes(tz) {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/* GET /api/admissions/stats?session=2026-27 */
exports.stats = asyncHandler(async (req, res) => {
  const session = req.query.session;
  if (session && !C.ACADEMIC_SESSIONS.includes(session)) throw new HttpError(400, "Invalid session");
  const match = { isDeleted: false, ...(session ? { session } : {}) };

  // Month buckets are computed in JS in the configured timezone (portable, no $year/$month tz operators needed).
  const offMs = tzMinutes(TZ) * 60_000;
  const local = new Date(Date.now() + offMs);
  const monthsBack = 6;
  const startUtc = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (monthsBack - 1), 1) - offMs);

  const [byStatusRows, recent] = await Promise.all([
    Admission.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Admission.find({ ...match, applicationDate: { $gte: startUtc } }).select("applicationDate status").lean(),
  ]);

  const byStatus = Object.fromEntries(C.STATUSES.map((s) => [s, 0]));
  byStatusRows.forEach((r) => (byStatus[r._id] = r.n));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  const monthly = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - (monthsBack - 1 - i), 1));
    return {
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      ...Object.fromEntries(C.STATUSES.map((s) => [s, 0])),
    };
  });
  for (const r of recent) {
    const l = new Date(r.applicationDate.getTime() + offMs);
    const key = `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = monthly.find((m) => m.month === key);
    if (row) row[r.status]++;
  }

  const decided = byStatus.approved + byStatus.rejected;
  res.json({ success: true, data: { total, ...byStatus, byStatus, approvalRate: decided ? Math.round((byStatus.approved / decided) * 100) : 0, monthly } });
});

/* GET /api/admissions/:id */
exports.getById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await findOr404(req.params.id) });
});

/* POST /api/admissions */
exports.create = asyncHandler(async (req, res) => {
  const body = parse(admissionBodySchema, req.body);
  let doc;
  // The counter is atomic, but the unique index on applicationId is the real guarantee: on a collision, take the next ID.
  for (let attempt = 0; !doc; attempt++) {
    try {
      doc = await Admission.create({
        ...body,
        applicationId: await nextApplicationId(),
        status: "pending",
        timeline: [{ kind: "submitted", title: "Application submitted", description: "Application received.", by: actor(req) }],
      });
    } catch (e) {
      // applicationId is the only unique field settable on create (_id is generated), so E11000 == ID collision.
      if (e.code !== 11000 || attempt >= 4) throw e;
    }
  }
  res.status(201).json({ success: true, message: "Application submitted", data: doc });
});

/* PUT /api/admissions/:id */
exports.update = asyncHandler(async (req, res) => {
  const app = await findOr404(req.params.id);
  const body = parse(admissionBodySchema, req.body);
  app.set(body);
  app.timeline.push({ kind: "updated", title: "Application details updated", by: actor(req) });
  await app.save();
  res.json({ success: true, message: "Application updated", data: app });
});

/* PATCH /api/admissions/:id/status   body: { status, remarks? } */
exports.updateStatus = asyncHandler(async (req, res) => {
  const app = await findOr404(req.params.id);
  const { status, remarks } = parse(statusBodySchema, req.body);
  if (app.status === status) throw new HttpError(409, `Application is already ${status.replace("_", " ")}`);

  const decided = status === "approved" || status === "rejected";
  const events = {
    approved: ["approved", "Admission approved", remarks || "Application approved by the admissions office."],
    rejected: ["rejected", "Application rejected", remarks],
    under_review: ["review", "Moved to review", "Forwarded to the department for evaluation."],
    pending: ["updated", "Status reset to pending", undefined],
  };
  const [kind, title, description] = events[status];

  app.status = status;
  app.remarks = decided ? remarks || app.remarks : undefined;
  app.decidedAt = decided ? new Date() : undefined;
  app.timeline.push({ kind, title, description, by: decided ? "Admission Committee" : actor(req) });
  await app.save();
  res.json({ success: true, message: `Application ${status.replace("_", " ")}`, data: app });
});

/* DELETE /api/admissions/:id  (soft delete) */
exports.remove = asyncHandler(async (req, res) => {
  const app = await findOr404(req.params.id);
  app.isDeleted = true;
  app.deletedAt = new Date();
  await app.save();
  res.json({ success: true, message: "Application deleted", data: { id: app.applicationId } });
});

/* POST /api/admissions/:id/restore  (undo delete) */
exports.restore = asyncHandler(async (req, res) => {
  if (!ID_RE.test(req.params.id)) throw new HttpError(404, "Application not found");
  const app = await Admission.findOne({ applicationId: req.params.id, isDeleted: true });
  if (!app) throw new HttpError(404, "No deleted application with this ID");
  app.isDeleted = false;
  app.deletedAt = undefined;
  await app.save();
  res.json({ success: true, message: "Application restored", data: app });
});

/* POST /api/admissions/:id/documents/:key   multipart field "file" */
exports.uploadDocument = asyncHandler(async (req, res) => {
  const { key } = req.params;
  if (!C.UPLOAD_KEYS.includes(key)) throw new HttpError(400, `Unknown document "${key}". Allowed: ${C.UPLOAD_KEYS.join(", ")}`);
  const app = await findOr404(req.params.id).catch((e) => {
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    throw e;
  });
  if (!req.file) throw new HttpError(400, 'No file received. Send it as multipart field "file".');

  const old = app[key];
  app[key] = {
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    url: `/uploads/admissions/${app.applicationId}/${req.file.filename}`,
    dataUrl: key === "photo" ? old?.dataUrl : undefined,
  };
  app.timeline.push({ kind: "documents", title: `${key === "photo" ? "Photograph" : "Document"} uploaded`, description: req.file.originalname, by: actor(req) });
  await app.save();
  if (old?.url) removeFile(old.url);
  res.status(201).json({ success: true, message: "File uploaded", data: app });
});

/* DELETE /api/admissions/:id/documents/:key */
exports.deleteDocument = asyncHandler(async (req, res) => {
  const { key } = req.params;
  if (!C.UPLOAD_KEYS.includes(key)) throw new HttpError(400, "Unknown document");
  if (!["transferCertificate", "migrationCertificate"].includes(key))
    throw new HttpError(400, "This document is mandatory. Upload a replacement instead of deleting it.");
  const app = await findOr404(req.params.id);
  const old = app[key];
  app[key] = null;
  await app.save();
  if (old?.url) removeFile(old.url);
  res.json({ success: true, message: "Document removed", data: app });
});

function removeFile(url) {
  const rel = url.replace(/^\/?uploads\//, "");
  const full = path.join(process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads"), rel);
  if (full.includes(`${path.sep}admissions${path.sep}`)) fs.promises.unlink(full).catch(() => {});
}

exports.HttpError = HttpError;
