
/** Field descriptions are the extraction "prompt" for Sarvam Extract (the API requires one per field). */
export const DEED_SCHEMA = {
  type: "object",
  properties: {
    deed_no: { type: "string", description: "Sale deed number exactly as printed, e.g. SD/0104/2026" },
    seller: { type: "string", description: "Seller (விற்பவர்) name exactly as written, in the script used in the document, without father's name" },
    buyer: { type: "string", description: "Buyer (வாங்குபவர்) name exactly as written, in the script used in the document, without father's name" },
    survey_no: { type: "string", description: "Survey number (சர்வே எண்), e.g. 201/7" },
    extent_cents: { type: "number", description: "Land extent (பரப்பு) in cents, number only" },
    registration_date: { type: "string", description: "Registration date (பதிவு நாள்) as YYYY-MM-DD" },
    sale_amount_inr: { type: "number", description: "Sale consideration (கிரையத் தொகை) in rupees, number only" },
  },
};

export const DOC_CATEGORIES = [
  { type: "sale_deed", description: "Tamil sale deed (கிரையப் பத்திரம்) transferring land from a seller to a buyer, with survey number and extent" },
  { type: "ration_card", description: "Family ration card (குடும்ப அட்டை) listing household members" },
  { type: "tax_receipt", description: "Property tax payment receipt with amount paid and year" },
];

export const isTamil = (s: string) => /[஀-௿]/.test(s);

/**
 * Confidence only of the fields the checks use. Excludes the date: Extract scored correct dates
 * ~0.13 on 12 of 20 eval docs because it reformats DD-MM-YYYY to YYYY-MM-DD, so that score is noise.
 */
const CHECKED = ["deed_no", "seller", "buyer", "survey_no", "extent_cents"];
export function checkedConfidences(annotations?: Record<string, { confidence: number | null }>, keys: string[] = CHECKED): number[] {
  return keys.map((k) => annotations?.[k]?.confidence).filter((x): x is number => typeof x === "number");
}
