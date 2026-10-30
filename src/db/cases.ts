/**
 * The demo dataset: one case per problem type. Fictional people and land, but every
 * fact shown in the app is backed by a document that really exists in public/case-docs/
 * (rendered by scripts/render-cases.ts) and by the simulated department records.
 *
 * Truth model: the department records (registry) and the citizen's documents are genuine
 * unless a case says otherwise; problems come from what the citizen typed, what the
 * documents reveal (mortgage, dues, owner), a missing document, or a doctored copy.
 */

export type DocKind = "application_form" | "sale_deed" | "patta" | "ec" | "tax_receipt" | "id_proof" | "petition";

/** How the citizen's copy of a document looks (exercises different reading conditions). */
export type Look = "pdf" | "scan" | "phone_photo" | "photocopy" | "stamp_paper" | "handwritten" | "blurry";

export interface EcEntry {
  date: string; // YYYY-MM-DD
  nature: "sale" | "mortgage" | "release" | "court_attachment";
  docNo: string;
  parties: string;
  detail: string;
}

export interface PattaCase {
  ref: string;
  problem: { ta: string; en: string };
  applicant: { ta: string; en: string };
  village: { ta: string; en: string };
  sro: { ta: string; en: string };
  /** Date the citizen submitted (fixed, so it matches the printed application). */
  submittedOn: string;
  seller: { name: string; parent: string };
  buyer: { name: string; parent: string };
  surveyNo: string;
  /** Genuine registered deed (Registration department record). */
  deed: { no: string; date: string; amount: number; extentCents: number };
  /** Values the citizen typed in the online application, where they differ from the truth. */
  typed?: Partial<{ buyer: string; extentCents: number }>;
  /** Values printed on the citizen's deed copy, where it differs from the registered deed (doctored copy). */
  deedCopy?: Partial<{ extentCents: number }>;
  patta: { no: string; owner: string; ownerParent: string };
  tax: { receiptNo: string; assessmentNo: string; paidUpTo: string; dues: number; paidAmount: number };
  ec: EcEntry[];
  idProof: { name: string; number: string; dob: string };
  /** Which documents the citizen attached and how each looks. Omitted kind = not attached. */
  docs: Partial<Record<Exclude<DocKind, "petition">, Look>>;
}

export interface GrievanceCase {
  ref: string;
  problem: { ta: string; en: string };
  applicant: { ta: string; en: string };
  village: { ta: string; en: string };
  /** Date the citizen submitted (fixed, so it matches the printed application). */
  submittedOn: string;
  /** Petition as written by the citizen (Tamil). Location only if the citizen gave one. */
  petition: { text: string; location: string | null; look: Look };
  repeatCount: number;
}

const SRO_PONNERI = { ta: "சார் பதிவாளர் அலுவலகம், பொன்னேரி", en: "Sub-Registrar Office, Ponneri" };
const SRO_MINJUR = { ta: "சார் பதிவாளர் அலுவலகம், மீஞ்சூர்", en: "Sub-Registrar Office, Minjur" };
const SRO_GUMMIDI = { ta: "சார் பதிவாளர் அலுவலகம், கும்மிடிப்பூண்டி", en: "Sub-Registrar Office, Gummidipoondi" };

const ALL_DOCS: PattaCase["docs"] = {
  application_form: "pdf", sale_deed: "scan", patta: "pdf", ec: "pdf", tax_receipt: "scan", id_proof: "phone_photo",
};

const saleEntry = (c: { deed: PattaCase["deed"]; seller: PattaCase["seller"]; buyer: PattaCase["buyer"] }): EcEntry => ({
  date: c.deed.date, nature: "sale", docNo: c.deed.no, parties: `${c.seller.name} → ${c.buyer.name}`, detail: "கிரையம்",
});

const base = {
  P1: {
    deed: { no: "3812/2026", date: "2026-09-18", amount: 1440000, extentCents: 48 },
    seller: { name: "முருகேசன்", parent: "சுப்பையா" }, buyer: { name: "சரண்யா", parent: "கார்த்திக்" },
  },
  P2: {
    deed: { no: "4518/2026", date: "2026-09-12", amount: 1860000, extentCents: 62 },
    seller: { name: "கோவிந்தன்", parent: "ராமசாமி" }, buyer: { name: "மீனா", parent: "பாலு" },
  },
  P3: {
    deed: { no: "2977/2026", date: "2026-08-29", amount: 2100000, extentCents: 75 },
    seller: { name: "அண்ணாமலை", parent: "பெருமாள்" }, buyer: { name: "ராஜலட்சுமி", parent: "சேகர்" },
  },
  P4: {
    deed: { no: "3305/2026", date: "2026-09-04", amount: 1200000, extentCents: 40 },
    seller: { name: "சுப்பிரமணி", parent: "வேலாயுதம்" }, buyer: { name: "தனபால்", parent: "வேலு" },
  },
  P5: {
    deed: { no: "4102/2026", date: "2026-09-09", amount: 980000, extentCents: 25 },
    seller: { name: "அப்துல் ரஹீம்", parent: "முகமது இஸ்மாயில்" }, buyer: { name: "பாத்திமா", parent: "அப்துல் காதர்" },
  },
  P6: {
    deed: { no: "2654/2026", date: "2026-08-14", amount: 1650000, extentCents: 60 },
    seller: { name: "வேலு", parent: "முனுசாமி" }, buyer: { name: "ராஜேஷ்", parent: "தெய்வசிகாமணி" },
  },
  P7: {
    deed: { no: "3990/2026", date: "2026-09-07", amount: 1320000, extentCents: 44 },
    seller: { name: "ராமசாமி", parent: "கந்தசாமி" }, buyer: { name: "லட்சுமி", parent: "ராஜா" },
  },
  P8: {
    deed: { no: "3527/2026", date: "2026-09-01", amount: 2400000, extentCents: 80 },
    seller: { name: "சின்னசாமி", parent: "மாரியப்பன்" }, buyer: { name: "கவிதா", parent: "முருகன்" },
  },
};

export const PATTA_CASES: PattaCase[] = [
  {
    ref: "PT-2026-0201", problem: { ta: "குறை இல்லை", en: "Clean file" },
    applicant: { ta: "சரண்யா கா", en: "Saranya K" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, sro: SRO_PONNERI,
    submittedOn: "2026-10-25", ...base.P1, surveyNo: "112/3",
    patta: { no: "1427", owner: "முருகேசன்", ownerParent: "சுப்பையா" },
    tax: { receiptNo: "PNR/2026/08812", assessmentNo: "PNR-112-3", paidUpTo: "2026-27", dues: 0, paidAmount: 1180 },
    ec: [saleEntry(base.P1)],
    idProof: { name: "சரண்யா", number: "XXXX XXXX 4821", dob: "1991-04-12" },
    docs: { ...ALL_DOCS, sale_deed: "pdf" },
  },
  {
    ref: "PT-2026-0202", problem: { ta: "பரப்பு வேறுபாடு", en: "Extent mismatch" },
    applicant: { ta: "மீனா பா", en: "Meena B" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, sro: SRO_PONNERI,
    submittedOn: "2026-10-12", ...base.P2, surveyNo: "201/7", typed: { extentCents: 80 },
    patta: { no: "1689", owner: "கோவிந்தன்", ownerParent: "ராமசாமி" },
    tax: { receiptNo: "PNR/2026/07734", assessmentNo: "PNR-201-7", paidUpTo: "2026-27", dues: 0, paidAmount: 1520 },
    ec: [saleEntry(base.P2)],
    idProof: { name: "மீனா", number: "XXXX XXXX 7310", dob: "1988-11-02" },
    docs: { ...ALL_DOCS, sale_deed: "phone_photo" },
  },
  {
    ref: "PT-2026-0203", problem: { ta: "பெயர் வேறுபாடு", en: "Name mismatch" },
    applicant: { ta: "ராஜேஸ்வரி சே", en: "Rajeswari S" }, village: { ta: "கும்மிடிப்பூண்டி", en: "Gummidipoondi" }, sro: SRO_GUMMIDI,
    submittedOn: "2026-10-21", ...base.P3, surveyNo: "45/1", typed: { buyer: "ராஜேஸ்வரி" },
    patta: { no: "0954", owner: "அண்ணாமலை", ownerParent: "பெருமாள்" },
    tax: { receiptNo: "GMP/2026/03321", assessmentNo: "GMP-45-1", paidUpTo: "2026-27", dues: 0, paidAmount: 1650 },
    ec: [saleEntry(base.P3)],
    idProof: { name: "ராஜலட்சுமி", number: "XXXX XXXX 2264", dob: "1985-07-21" },
    docs: { ...ALL_DOCS, sale_deed: "scan" },
  },
  {
    ref: "PT-2026-0204", problem: { ta: "வரி நிலுவை", en: "Tax dues" },
    applicant: { ta: "தனபால் வே", en: "Dhanapal V" }, village: { ta: "மீஞ்சூர்", en: "Minjur" }, sro: SRO_MINJUR,
    submittedOn: "2026-10-08", ...base.P4, surveyNo: "310/5",
    patta: { no: "2210", owner: "சுப்பிரமணி", ownerParent: "வேலாயுதம்" },
    tax: { receiptNo: "MJR/2024/11870", assessmentNo: "MJR-310-5", paidUpTo: "2024-25", dues: 3450, paidAmount: 1150 },
    ec: [saleEntry(base.P4)],
    idProof: { name: "தனபால்", number: "XXXX XXXX 5590", dob: "1979-02-15" },
    docs: { ...ALL_DOCS, sale_deed: "stamp_paper" },
  },
  {
    ref: "PT-2026-0205", problem: { ta: "அடமானம் (வில்லங்கம்)", en: "Mortgage on the land" },
    applicant: { ta: "பாத்திமா அ", en: "Fathima A" }, village: { ta: "மீஞ்சூர்", en: "Minjur" }, sro: SRO_MINJUR,
    submittedOn: "2026-10-16", ...base.P5, surveyNo: "17/9",
    patta: { no: "0377", owner: "அப்துல் ரஹீம்", ownerParent: "முகமது இஸ்மாயில்" },
    tax: { receiptNo: "MJR/2026/02219", assessmentNo: "MJR-17-9", paidUpTo: "2026-27", dues: 0, paidAmount: 640 },
    ec: [
      { date: "2024-03-11", nature: "mortgage", docNo: "1188/2024", parties: "அப்துல் ரஹீம் → இந்தியன் வங்கி, மீஞ்சூர்", detail: "அடமானம் ₹4,50,000" },
      saleEntry(base.P5),
    ],
    idProof: { name: "பாத்திமா", number: "XXXX XXXX 9043", dob: "1993-09-30" },
    docs: { ...ALL_DOCS, sale_deed: "photocopy" },
  },
  {
    ref: "PT-2026-0206", problem: { ta: "விற்பவர் பட்டாதாரர் அல்ல", en: "Seller is not the owner" },
    applicant: { ta: "ராஜேஷ் தெ", en: "Rajesh D" }, village: { ta: "கும்மிடிப்பூண்டி", en: "Gummidipoondi" }, sro: SRO_GUMMIDI,
    submittedOn: "2026-10-03", ...base.P6, surveyNo: "66/3",
    patta: { no: "1102", owner: "பழனிசாமி", ownerParent: "கருப்பன்" },
    tax: { receiptNo: "GMP/2026/04410", assessmentNo: "GMP-66-3", paidUpTo: "2026-27", dues: 0, paidAmount: 1400 },
    ec: [saleEntry(base.P6)],
    idProof: { name: "ராஜேஷ்", number: "XXXX XXXX 3378", dob: "1990-01-08" },
    docs: { ...ALL_DOCS, sale_deed: "handwritten" },
  },
  {
    ref: "PT-2026-0207", problem: { ta: "ஆவணம் இல்லை", en: "Missing document" },
    applicant: { ta: "லட்சுமி ரா", en: "Lakshmi R" }, village: { ta: "மீஞ்சூர்", en: "Minjur" }, sro: SRO_MINJUR,
    submittedOn: "2026-10-18", ...base.P7, surveyNo: "88/2A",
    patta: { no: "2675", owner: "ராமசாமி", ownerParent: "கந்தசாமி" },
    tax: { receiptNo: "MJR/2026/05561", assessmentNo: "MJR-88-2A", paidUpTo: "2026-27", dues: 0, paidAmount: 1090 },
    ec: [saleEntry(base.P7)],
    idProof: { name: "லட்சுமி", number: "XXXX XXXX 6152", dob: "1983-05-19" },
    docs: { application_form: "pdf", sale_deed: "scan", patta: "pdf", tax_receipt: "scan", id_proof: "phone_photo" },
  },
  {
    ref: "PT-2026-0208", problem: { ta: "பத்திரம் அரசுப் பதிவுடன் பொருந்தவில்லை", en: "Deed copy differs from the registered deed" },
    applicant: { ta: "கவிதா மு", en: "Kavitha M" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, sro: SRO_PONNERI,
    submittedOn: "2026-09-29", ...base.P8, surveyNo: "142/1",
    typed: { extentCents: 120 }, deedCopy: { extentCents: 120 },
    patta: { no: "1873", owner: "சின்னசாமி", ownerParent: "மாரியப்பன்" },
    tax: { receiptNo: "PNR/2026/09120", assessmentNo: "PNR-142-1", paidUpTo: "2026-27", dues: 0, paidAmount: 1980 },
    ec: [saleEntry(base.P8)],
    idProof: { name: "கவிதா", number: "XXXX XXXX 1187", dob: "1987-12-03" },
    docs: { ...ALL_DOCS, sale_deed: "scan" },
  },
];

export const GRIEVANCE_CASES: GrievanceCase[] = [
  {
    ref: "GR-2026-0301", problem: { ta: "அவசரம் — குடிநீர்", en: "Urgent — drinking water" },
    applicant: { ta: "சுந்தரி அ", en: "Sundari A" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, submittedOn: "2026-10-28",
    petition: {
      text: "ஐயா, எங்கள் காந்தி தெருவில் கடந்த மூன்று நாட்களாக குடிநீர் வரவில்லை. குழந்தைகளுக்கு காய்ச்சல் வந்துள்ளது. இதே பிரச்சனைக்கு கடந்த மாதமும் புகார் கொடுத்தோம். உடனடியாக நடவடிக்கை எடுக்க வேண்டுகிறோம்.",
      location: "காந்தி தெரு, பொன்னேரி", look: "handwritten",
    },
    repeatCount: 2,
  },
  {
    ref: "GR-2026-0302", problem: { ta: "இதே இடத்தில் மற்றொரு புகார்", en: "Duplicate of another complaint" },
    applicant: { ta: "இளங்கோ தெ", en: "Ilango D" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, submittedOn: "2026-10-29",
    petition: {
      text: "காந்தி தெருவில் மூன்று நாட்களாக குழாயில் தண்ணீர் வரவில்லை. தெரு மக்கள் அனைவரும் சிரமப்படுகிறோம். குடிநீர் வழங்கலை சரிசெய்யுமாறு கேட்டுக்கொள்கிறோம்.",
      location: "காந்தி தெரு, பொன்னேரி", look: "pdf",
    },
    repeatCount: 1,
  },
  {
    ref: "GR-2026-0303", problem: { ta: "விவரம் தெளிவில்லை", en: "Unclear complaint" },
    applicant: { ta: "மோகன் ரா", en: "Mohan R" }, village: { ta: "கும்மிடிப்பூண்டி", en: "Gummidipoondi" }, submittedOn: "2026-10-26",
    petition: { text: "ஐயா, எனக்கு உதவி வேண்டும். தயவுசெய்து நடவடிக்கை எடுக்கவும்.", location: null, look: "handwritten" },
    repeatCount: 1,
  },
];

/**
 * Demo kits for the live citizen flow: document sets a presenter downloads and uploads as the citizen
 * (account "citizen", செல்வி). They are not seeded as applications — only their department records are.
 * Kit A is clean but its ID card is a very blurry photo. Kit B has an old tax receipt with dues; `taxLater` is the receipt after paying, which
 * the citizen uploads when the tahsildar returns the file.
 */
export interface DemoKit extends PattaCase {
  id: "kit-a" | "kit-b";
  taxLater?: PattaCase["tax"];
}

const CITIZEN_BUYER = { name: "செல்வி", parent: "கணேசன்" };
const CITIZEN_ID = { name: "செல்வி", number: "XXXX XXXX 5307", dob: "1990-06-14" };
const KIT_DOCS: PattaCase["docs"] = { sale_deed: "scan", patta: "pdf", ec: "pdf", tax_receipt: "scan", id_proof: "phone_photo" };

export const DEMO_KITS: DemoKit[] = [
  {
    id: "kit-a", ref: "KIT-A", problem: { ta: "குறை இல்லை", en: "Clean file" },
    applicant: { ta: "செல்வி க", en: "Selvi G" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, sro: SRO_PONNERI,
    submittedOn: "2026-10-30", surveyNo: "58/2",
    deed: { no: "4630/2026", date: "2026-10-06", amount: 1080000, extentCents: 36 },
    seller: { name: "பாலகிருஷ்ணன்", parent: "நடராஜன்" }, buyer: CITIZEN_BUYER,
    patta: { no: "1544", owner: "பாலகிருஷ்ணன்", ownerParent: "நடராஜன்" },
    tax: { receiptNo: "PNR/2026/09875", assessmentNo: "PNR-58-2", paidUpTo: "2026-27", dues: 0, paidAmount: 890 },
    ec: [{ date: "2026-10-06", nature: "sale", docNo: "4630/2026", parties: "பாலகிருஷ்ணன் → செல்வி", detail: "கிரையம்" }],
    // A badly out-of-focus phone photo: Sarvam may not read it, and the officer checks it by eye.
    idProof: CITIZEN_ID, docs: { ...KIT_DOCS, id_proof: "blurry" },
  },
  {
    id: "kit-b", ref: "KIT-B", problem: { ta: "வரி நிலுவை", en: "Tax dues" },
    applicant: { ta: "செல்வி க", en: "Selvi G" }, village: { ta: "பொன்னேரி", en: "Ponneri" }, sro: SRO_PONNERI,
    submittedOn: "2026-10-30", surveyNo: "203/1B",
    deed: { no: "4712/2026", date: "2026-10-10", amount: 1560000, extentCents: 52 },
    seller: { name: "ஜெயராமன்", parent: "சின்னையா" }, buyer: CITIZEN_BUYER,
    patta: { no: "1961", owner: "ஜெயராமன்", ownerParent: "சின்னையா" },
    tax: { receiptNo: "PNR/2024/06617", assessmentNo: "PNR-203-1B", paidUpTo: "2024-25", dues: 2760, paidAmount: 1380 },
    taxLater: { receiptNo: "PNR/2026/10457", assessmentNo: "PNR-203-1B", paidUpTo: "2026-27", dues: 0, paidAmount: 2760 },
    ec: [{ date: "2026-10-10", nature: "sale", docNo: "4712/2026", parties: "ஜெயராமன் → செல்வி", detail: "கிரையம்" }],
    idProof: CITIZEN_ID, docs: KIT_DOCS,
  },
];

/** Villages in the taluk (English key, Tamil name) — the online form's choices. */
export const VILLAGES = { Ponneri: "பொன்னேரி", Minjur: "மீஞ்சூர்", Gummidipoondi: "கும்மிடிப்பூண்டி" } as const;

/** Statutory-style service time limits (days), used to compute every deadline. */
export const SLA_DAYS = { patta: 30, grievance: { water: 3, electricity: 2, sanitation: 7, road: 15, patta: 30, ration: 7, other: 15 } } as const;

/** 1 cent = 40.4686 m², 1 are = 100 m². Tamil Nadu patta shows hectare–ares. */
export const centsToAres = (cents: number) => Math.round(cents * 40.4686) / 100;
export const formatHectareAres = (cents: number) => {
  const ares = centsToAres(cents);
  return `${Math.floor(ares / 100)} - ${(ares % 100).toFixed(2).padStart(5, "0")}`;
};
export const aresToCents = (ares: number) => Math.round((ares * 100) / 40.4686);

/** What the citizen typed in the online form (= the application's "On application" values). */
export const applicationValues = (c: PattaCase) => ({
  seller: c.seller.name,
  buyer: c.typed?.buyer ?? c.buyer.name,
  surveyNo: c.surveyNo,
  extentCents: c.typed?.extentCents ?? c.deed.extentCents,
  saleDeedNo: c.deed.no,
  taxReceiptNo: c.tax.receiptNo,
});

/** File extension the citizen's copy has, by how it looks. PDFs also get a .png preview for thumbnails. */
export const lookExt = (look: Look) => (look === "pdf" ? "pdf" : look === "phone_photo" || look === "photocopy" || look === "blurry" ? "jpg" : "png");
/** Public URL of a seeded document (files live in public/case-docs/<ref>/). */
export const docUrl = (ref: string, kind: DocKind, look: Look) => `/case-docs/${ref}/${kind}.${lookExt(look)}`;
export const previewUrl = (ref: string, kind: DocKind, look: Look) =>
  look === "pdf" ? `/case-docs/${ref}/${kind}.preview.png` : docUrl(ref, kind, look);
