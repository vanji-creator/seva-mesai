/* Fictional deeds with known ground truth. Matches seed cases PT-0101/0103/0104/0107. */
import type { PattaPayload } from "@/lib/types";

export interface DeedFields {
  deedNo: string;
  seller: string;
  buyer: string;
  surveyNo: string;
  extentCents: number;
  registrationDate: string; // YYYY-MM-DD
  saleAmount: number;
}

export interface EvalCase {
  id: string;
  /** What the citizen typed in the application form. */
  application: PattaPayload;
  /** What the (fictional) deed actually says = ground truth for extraction. */
  deed: DeedFields;
  sellerParent: string;
  buyerParent: string;
  village: string;
  /** Current patta holder in the revenue record. */
  landOwner: string;
  /** Roman spellings, for the "names in English letters" variant. */
  roman: { seller: string; buyer: string; sellerParent: string; buyerParent: string };
  note: string;
}

const app = (d: DeedFields, over: Partial<PattaPayload> = {}): PattaPayload => ({
  seller: d.seller,
  buyer: d.buyer,
  surveyNo: d.surveyNo,
  extentCents: d.extentCents,
  saleDeedNo: d.deedNo,
  taxReceiptNo: `TX/${d.deedNo.split("/")[1]}`,
  ...over,
});

const D1: DeedFields = { deedNo: "SD/0101/2026", seller: "முருகன்", buyer: "செல்வம்", surveyNo: "123/4", extentCents: 50, registrationDate: "2026-09-03", saleAmount: 950000 };
const D2: DeedFields = { deedNo: "SD/0103/2026", seller: "அண்ணாமலை", buyer: "கார்த்திக்கேயன்", surveyNo: "45/1", extentCents: 120, registrationDate: "2026-08-21", saleAmount: 2400000 };
const D3: DeedFields = { deedNo: "SD/0104/2026", seller: "கோவிந்தன்", buyer: "மீனா", surveyNo: "201/7", extentCents: 62, registrationDate: "2026-09-12", saleAmount: 1860000 };
const D4: DeedFields = { deedNo: "SD/0107/2026", seller: "வேலு", buyer: "ராஜேஷ்", surveyNo: "66/3", extentCents: 60, registrationDate: "2026-08-02", saleAmount: 1500000 };

export const CASES: EvalCase[] = [
  {
    id: "PT-2026-0101", application: app(D1), deed: D1, sellerParent: "சுப்பையா", buyerParent: "கந்தசாமி", village: "பொன்னேரி", landOwner: "முருகன்",
    roman: { seller: "Murugan", buyer: "Selvam", sellerParent: "Subbaiah", buyerParent: "Kandasamy" },
    note: "Clean file – everything matches",
  },
  {
    id: "PT-2026-0103", application: app(D2, { buyer: "கார்த்திகேயன்" }), deed: D2, sellerParent: "பெருமாள்", buyerParent: "சுப்பிரமணி", village: "கும்மிடிப்பூண்டி", landOwner: "அண்ணாமலை",
    roman: { seller: "Annamalai", buyer: "Karthikkeyan", sellerParent: "Perumal", buyerParent: "Subramani" },
    note: "Buyer name spelled differently on application vs deed",
  },
  {
    id: "PT-2026-0104", application: app(D3, { extentCents: 80 }), deed: D3, sellerParent: "ராமசாமி", buyerParent: "பாலு", village: "பொன்னேரி", landOwner: "கோவிந்தன்",
    roman: { seller: "Govindan", buyer: "Meena", sellerParent: "Ramasamy", buyerParent: "Balu" },
    note: "Application claims 80 cents, deed says 62",
  },
  {
    id: "PT-2026-0107", application: app(D4), deed: D4, sellerParent: "முனுசாமி", buyerParent: "தெய்வசிகாமணி", village: "கும்மிடிப்பூண்டி", landOwner: "பழனிசாமி",
    roman: { seller: "Velu", buyer: "Rajesh", sellerParent: "Munusamy", buyerParent: "Deivasigamani" },
    note: "Seller is not the current patta holder",
  },
];

export const VARIANTS = [
  { id: "typed_values", label: "Correct values entered directly (ceiling)", labelTa: "சரியான மதிப்புகள் நேரடியாக", file: null },
  { id: "pdf_typed", label: "Typed PDF (selectable text)", labelTa: "தட்டச்சு PDF", file: "pdf" },
  { id: "scan_clean", label: "Clean scan (image)", labelTa: "தெளிவான ஸ்கேன்", file: "png" },
  { id: "phone_photo", label: "Phone photo – skew, shadow, blur", labelTa: "கைப்பேசி புகைப்படம்", file: "jpg" },
  { id: "handwritten_form", label: "Printed form, handwritten fill-ins", labelTa: "கையால் நிரப்பிய படிவம்", file: "png" },
  { id: "photocopy", label: "Poor photocopy – grey, noisy, low-res", labelTa: "மங்கிய நகல்", file: "jpg" },
  { id: "english_names", label: "Names in English letters", labelTa: "ஆங்கில எழுத்தில் பெயர்கள்", file: "png" },
  { id: "stamp_paper", label: "Stamp paper with seal over text", labelTa: "முத்திரைத்தாள் + முத்திரை", file: "png" },
] as const;
export type VariantId = (typeof VARIANTS)[number]["id"];

/** Wrong uploads used only for the Classify gate. */
export const WRONG_DOCS = [
  { id: "wrong_ration_card", expectedType: "ration_card" },
  { id: "wrong_tax_receipt", expectedType: "tax_receipt" },
] as const;
