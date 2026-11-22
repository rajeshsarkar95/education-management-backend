// Keep in sync with the frontend: lib/admission/constants.ts
const STATUSES = ["pending", "under_review", "approved", "rejected"];
const ACADEMIC_SESSIONS = ["2024-25", "2025-26", "2026-27", "2027-28"];
const GENDERS = ["Male", "Female", "Other"];
const ADMISSION_TYPES = ["Regular", "Lateral Entry", "Transfer", "Management Quota", "Scholarship"];
const QUALIFICATIONS = ["10th / Secondary", "12th / Higher Secondary", "Diploma", "Bachelor's Degree", "Master's Degree"];
const GRADE_TYPES = ["Percentage", "CGPA"];
const DEPARTMENTS = ["Engineering", "Commerce & Management", "Science", "Arts & Humanities", "Computer Applications"];

const COURSES = [
  { name: "B.Tech Computer Science", department: "Engineering", terms: 8, termType: "Semester" },
  { name: "B.Tech Mechanical", department: "Engineering", terms: 8, termType: "Semester" },
  { name: "B.Tech Electronics", department: "Engineering", terms: 8, termType: "Semester" },
  { name: "B.Com (Hons)", department: "Commerce & Management", terms: 6, termType: "Semester" },
  { name: "BBA", department: "Commerce & Management", terms: 6, termType: "Semester" },
  { name: "MBA", department: "Commerce & Management", terms: 4, termType: "Semester" },
  { name: "B.Sc Physics", department: "Science", terms: 6, termType: "Semester" },
  { name: "B.Sc Chemistry", department: "Science", terms: 6, termType: "Semester" },
  { name: "B.Sc Mathematics", department: "Science", terms: 6, termType: "Semester" },
  { name: "BA English", department: "Arts & Humanities", terms: 3, termType: "Year" },
  { name: "BA Economics", department: "Arts & Humanities", terms: 3, termType: "Year" },
  { name: "BCA", department: "Computer Applications", terms: 6, termType: "Semester" },
  { name: "MCA", department: "Computer Applications", terms: 4, termType: "Semester" },
];

const courseByName = (name) => COURSES.find((c) => c.name === name);
const termsForCourse = (name) => {
  const c = courseByName(name);
  return c ? Array.from({ length: c.terms }, (_, i) => `${c.termType} ${i + 1}`) : [];
};

const DOCUMENT_KEYS = ["marksheet", "transferCertificate", "migrationCertificate", "identityProof", "addressProof"];
const UPLOAD_KEYS = ["photo", ...DOCUMENT_KEYS];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

module.exports = {
  STATUSES, ACADEMIC_SESSIONS, GENDERS, ADMISSION_TYPES, QUALIFICATIONS, GRADE_TYPES, DEPARTMENTS, COURSES,
  courseByName, termsForCourse, DOCUMENT_KEYS, UPLOAD_KEYS, MAX_FILE_SIZE, ACCEPTED_DOC_TYPES, ACCEPTED_IMAGE_TYPES,
};
