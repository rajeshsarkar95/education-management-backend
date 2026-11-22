const multer = require("multer");

/** Mount AFTER the admission routes: app.use("/api/admissions", routes, admissionErrorHandler) */
module.exports = function admissionErrorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "File is larger than 5 MB" : err.message;
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ success: false, message: msg });
  }
  if (err.code === "UNSUPPORTED_TYPE") return res.status(415).json({ success: false, message: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ success: false, message: "Malformed JSON body" });
  if (err.name === "ValidationError") return res.status(400).json({ success: false, message: err.message });
  if (err.code === 11000) return res.status(409).json({ success: false, message: "Duplicate record" });
  const status = err.status || 500;
  if (status >= 500) console.error("[admissions]", err);
  res.status(status).json({ success: false, message: status >= 500 ? "Internal server error" : err.message, ...(err.errors ? { errors: err.errors } : {}) });
};
