const express = require("express");
const ctrl = require("../controllers/admissionController");
const uploadSingle = require("../middleware/admissionUpload");

const router = express.Router();


router.get("/stats", ctrl.stats); 
router.route("/").get(ctrl.list).post(ctrl.create);
router.route("/:id").get(ctrl.getById).put(ctrl.update).delete(ctrl.remove);
router.patch("/:id/status", ctrl.updateStatus);
router.post("/:id/restore", ctrl.restore);
router.post("/:id/documents/:key", uploadSingle, ctrl.uploadDocument);
router.delete("/:id/documents/:key", ctrl.deleteDocument);

module.exports = router;
