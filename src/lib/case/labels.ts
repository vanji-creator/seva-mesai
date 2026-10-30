import type { Locale } from "@/lib/types";

/** Labels for every field the reader extracts, so "what was read" is shown in plain words. */
const FIELD: Record<string, { ta: string; en: string }> = {
  applicationNo: { ta: "விண்ணப்ப எண்", en: "Application no." },
  deedNo: { ta: "பத்திர எண்", en: "Deed no." },
  seller: { ta: "விற்பவர்", en: "Seller" },
  buyer: { ta: "வாங்குபவர்", en: "Buyer" },
  surveyNo: { ta: "சர்வே எண்", en: "Survey no." },
  extentCents: { ta: "பரப்பு (சென்ட்)", en: "Extent (cents)" },
  registrationDate: { ta: "பதிவு நாள்", en: "Registered on" },
  saleAmount: { ta: "கிரையத் தொகை (₹)", en: "Sale amount (₹)" },
  taxReceiptNo: { ta: "வரி ரசீது எண்", en: "Tax receipt no." },
  pattaNo: { ta: "பட்டா எண்", en: "Patta no." },
  owner: { ta: "உரிமையாளர்", en: "Owner" },
  extentAres: { ta: "பரப்பு (ஏர்ஸ்)", en: "Extent (ares)" },
  village: { ta: "கிராமம்", en: "Village" },
  periodTo: { ta: "தேடல் காலம் வரை", en: "Searched up to" },
  entries: { ta: "பதிவுகள்", en: "Entries" },
  receiptNo: { ta: "ரசீது எண்", en: "Receipt no." },
  payer: { ta: "செலுத்தியவர்", en: "Paid by" },
  paidUpTo: { ta: "செலுத்திய ஆண்டு வரை", en: "Paid up to" },
  paidAmount: { ta: "செலுத்திய தொகை (₹)", en: "Amount paid (₹)" },
  dues: { ta: "நிலுவை (₹)", en: "Dues (₹)" },
  name: { ta: "பெயர்", en: "Name" },
  idNumber: { ta: "அட்டை எண்", en: "ID no." },
  dob: { ta: "பிறந்த நாள்", en: "Date of birth" },
};
export const fieldLabel = (k: string, l: Locale) => FIELD[k]?.[l] ?? k;

export const EC_NATURE: Record<string, { ta: string; en: string }> = {
  sale: { ta: "கிரையம்", en: "Sale" },
  mortgage: { ta: "அடமானம்", en: "Mortgage" },
  release: { ta: "அடமான விடுவிப்பு", en: "Release" },
  court_attachment: { ta: "நீதிமன்ற ஜப்தி", en: "Court attachment" },
  other: { ta: "பிற", en: "Other" },
};

export const CATEGORY: Record<string, { ta: string; en: string }> = {
  water: { ta: "குடிநீர்", en: "Drinking water" },
  electricity: { ta: "மின்சாரம்", en: "Electricity" },
  road: { ta: "சாலை", en: "Road" },
  sanitation: { ta: "தூய்மை", en: "Sanitation" },
  patta: { ta: "பட்டா", en: "Patta" },
  ration: { ta: "ரேஷன்", en: "Ration" },
  other: { ta: "வகைப்படுத்த முடியவில்லை", en: "Unclassified" },
};

/** Order fields roughly as they appear on the document. */
export const FIELD_ORDER = [
  "applicationNo", "receiptNo", "pattaNo", "deedNo", "name", "owner", "seller", "buyer", "payer", "village", "surveyNo",
  "extentCents", "extentAres", "registrationDate", "saleAmount", "taxReceiptNo", "paidUpTo", "paidAmount", "dues", "idNumber", "dob", "periodTo",
];
export const byFieldOrder = (a: string, b: string) =>
  (FIELD_ORDER.indexOf(a) + 1 || 99) - (FIELD_ORDER.indexOf(b) + 1 || 99);
