const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const C = require("../utils/admissionConstants");

const EXT = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const ROOT = () => process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(ROOT(), "admissions", req.params.id);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(12).toString("hex")}${EXT[file.mimetype] || ""}`),
});

const upload = multer({
  storage,
  limits: { fileSize: C.MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (!/^APP-\d{4}-\d{4,}$/.test(req.params.id)) return cb(new Error("Invalid application ID"));
    const allowed = req.params.key === "photo" ? C.ACCEPTED_IMAGE_TYPES : C.ACCEPTED_DOC_TYPES;
    if (!allowed.includes(file.mimetype)) {
      const err = new Error(`Unsupported file type. Allowed: ${allowed.map((t) => t.split("/")[1]).join(", ")}`);
      err.code = "UNSUPPORTED_TYPE";
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = upload.single("file");
