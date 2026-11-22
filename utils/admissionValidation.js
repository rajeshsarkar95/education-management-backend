const { z } = require("zod");
const C = require("./admissionConstants");

const MIN_AGE = 14;
const MAX_AGE = 60;
const thisYear = new Date().getFullYear();

function ageFrom(dob) {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const phone = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");
const personName = (label) =>
  z.string().trim().min(2, `${label} must be at least 2 characters`).max(80).regex(/^[A-Za-z][A-Za-z .'-]*$/, `${label} can only contain letters`);

const fileMeta = z
  .object({
    name: z.string().max(255),
    size: z.number().nonnegative().max(C.MAX_FILE_SIZE, "File is larger than 5 MB"),
    type: z.string(),
    url: z.string().optional(),
    // thumbnails only; cap size so the document cannot be bloated
    dataUrl: z.string().max(200_000).optional(),
  })
  .strip();

const requiredFile = fileMeta.nullable().refine((v) => v !== null, "This document is required");
const optionalFile = fileMeta.nullable().optional().transform((v) => v ?? null);

const admissionBodySchema = z
  .object({
    fullName: personName("Full name"),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date")
      .refine((v) => new Date(v) <= new Date(), "Date of birth cannot be in the future")
      .refine((v) => ageFrom(v) >= MIN_AGE, `Student must be at least ${MIN_AGE} years old`)
      .refine((v) => ageFrom(v) <= MAX_AGE, "Please check the date of birth"),
    gender: z.enum(C.GENDERS),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    mobile: phone,
    photo: requiredFile,

    fatherName: personName("Father's name"),
    motherName: personName("Mother's name"),
    guardianName: personName("Guardian name"),
    guardianMobile: phone,
    parentOccupation: z.string().trim().min(2).max(80),

    previousSchool: z.string().trim().min(3).max(120),
    qualification: z.enum(C.QUALIFICATIONS),
    board: z.string().trim().min(2).max(120),
    passingYear: z
      .string()
      .regex(/^\d{4}$/, "Enter a 4-digit year")
      .refine((v) => Number(v) >= 1990 && Number(v) <= thisYear, `Year must be between 1990 and ${thisYear}`),
    gradeType: z.enum(C.GRADE_TYPES),
    score: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid number (max 2 decimals)"),

    session: z.enum(C.ACADEMIC_SESSIONS),
    department: z.enum(C.DEPARTMENTS),
    course: z.string().min(1),
    term: z.string().min(1),
    admissionType: z.enum(C.ADMISSION_TYPES),

    marksheet: requiredFile,
    transferCertificate: optionalFile,
    migrationCertificate: optionalFile,
    identityProof: requiredFile,
    addressProof: requiredFile,

    declaration: z.literal(true, { errorMap: () => ({ message: "The declaration must be accepted" }) }),
  })
  .strip()
  .superRefine((v, ctx) => {
    const n = Number(v.score);
    if (v.gradeType === "Percentage" && (n < 33 || n > 100)) ctx.addIssue({ code: "custom", path: ["score"], message: "Percentage must be between 33 and 100" });
    if (v.gradeType === "CGPA" && (n < 3 || n > 10)) ctx.addIssue({ code: "custom", path: ["score"], message: "CGPA must be between 3 and 10" });
    const course = C.courseByName(v.course);
    if (!course || course.department !== v.department) ctx.addIssue({ code: "custom", path: ["course"], message: "Course does not belong to this department" });
    else if (!C.termsForCourse(v.course).includes(v.term)) ctx.addIssue({ code: "custom", path: ["term"], message: "Invalid class/semester for this course" });
  });

const statusBodySchema = z
  .object({
    status: z.enum(C.STATUSES),
    remarks: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "rejected" && !v.remarks) ctx.addIssue({ code: "custom", path: ["remarks"], message: "A reason is required to reject an application" });
  });

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(C.STATUSES).optional(),
  course: z.string().max(100).optional(),
  session: z.enum(C.ACADEMIC_SESSIONS).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sortBy: z.enum(["id", "fullName", "course", "mobile", "applicationDate", "status"]).default("applicationDate"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

function formatZodError(err) {
  return err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}

module.exports = { admissionBodySchema, statusBodySchema, listQuerySchema, formatZodError };
