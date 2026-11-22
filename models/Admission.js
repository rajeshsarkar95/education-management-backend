const mongoose = require("mongoose");
const { STATUSES, ACADEMIC_SESSIONS, GENDERS, ADMISSION_TYPES, QUALIFICATIONS, GRADE_TYPES, DEPARTMENTS } = require("../utils/admissionConstants");

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const AdmissionCounter = mongoose.models.AdmissionCounter || mongoose.model("AdmissionCounter", counterSchema);

const ID_BASE = 1000; 

async function nextApplicationId() {
  const year = new Date().getFullYear();
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await AdmissionCounter.findOneAndUpdate({ _id: `admission-${year}` }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
      return `APP-${year}-${String(ID_BASE + c.seq).padStart(4, "0")}`;
    } catch (e) {
      if (e.code === 11000 && attempt < 5) continue;
      throw e;
    }
  }
}

const fileSchema = new mongoose.Schema(
  {
    name: String,
    size: Number,
    type: String,
    url: String,
    dataUrl: String,
  },
  { _id: false },
);

const timelineSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["submitted", "updated", "review", "approved", "rejected", "documents"], required: true },
    title: { type: String, required: true },
    description: String,
    by: { type: String, default: "Admissions Office" },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const admissionSchema = new mongoose.Schema(
  {
    applicationId: { type: String, unique: true, index: true },
    status: { type: String, enum: STATUSES, default: "pending", index: true },
    remarks: String,
    decidedAt: Date,
    fullName: { type: String, required: true, trim: true },
    nameKey: { type: String, index: true }, 
    dob: { type: String, required: true }, 
    gender: { type: String, enum: GENDERS, required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobile: { type: String, required: true },
    photo: { type: fileSchema, default: null },

    fatherName: { type: String, required: true, trim: true },
    motherName: { type: String, required: true, trim: true },
    guardianName: { type: String, required: true, trim: true },
    guardianMobile: { type: String, required: true },
    parentOccupation: { type: String, required: true, trim: true },

    previousSchool: { type: String, required: true, trim: true },
    qualification: { type: String, enum: QUALIFICATIONS, required: true },
    board: { type: String, required: true, trim: true },
    passingYear: { type: String, required: true },
    gradeType: { type: String, enum: GRADE_TYPES, default: "Percentage" },
    score: { type: String, required: true },

    session: { type: String, enum: ACADEMIC_SESSIONS, required: true, index: true },
    department: { type: String, enum: DEPARTMENTS, required: true },
    course: { type: String, required: true, index: true },
    term: { type: String, required: true },
    admissionType: { type: String, enum: ADMISSION_TYPES, required: true },

    marksheet: { type: fileSchema, default: null },
    transferCertificate: { type: fileSchema, default: null },
    migrationCertificate: { type: fileSchema, default: null },
    identityProof: { type: fileSchema, default: null },
    addressProof: { type: fileSchema, default: null },

    declaration: { type: Boolean, default: true },
    timeline: { type: [timelineSchema], default: [] },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: { createdAt: "applicationDate", updatedAt: "updatedAt" } },
);

admissionSchema.index({ applicationDate: -1 });

admissionSchema.pre("validate", function () {
  if (this.fullName) this.nameKey = this.fullName.toLowerCase();
});
admissionSchema.set("toJSON", {
  virtuals: false,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret.applicationId;
    ret.timeline = (ret.timeline || []).map((t) => ({ id: String(t._id), kind: t.kind, title: t.title, description: t.description, by: t.by, at: t.at }));
    delete ret._id;
    delete ret.applicationId;
    delete ret.nameKey;
    delete ret.isDeleted;
    delete ret.deletedAt;
    return ret;
  },
});

module.exports = mongoose.models.Admission || mongoose.model("Admission", admissionSchema);
module.exports.nextApplicationId = nextApplicationId;
