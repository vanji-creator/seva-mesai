import type { Finding, GrievancePayload, Suggestion } from "@/lib/types";

export type Category = "water" | "road" | "electricity" | "sanitation" | "patta" | "ration" | "other";

interface Rule {
  category: Category;
  department: { ta: string; en: string };
  slaDays: number;
  keywords: string[];
}

/** Keyword rules: the offline fallback AND the cheap intake pre-classifier. */
export const RULES: Rule[] = [
  { category: "water", department: { ta: "குடிநீர் வடிகால் வாரியம்", en: "Water Supply Board" }, slaDays: 3, keywords: ["குடிநீர்", "தண்ணீர்", "குழாய்", "water"] },
  { category: "electricity", department: { ta: "மின்வாரியம்", en: "Electricity Board" }, slaDays: 2, keywords: ["மின்", "மின்சாரம்", "கம்பம்", "transformer"] },
  { category: "road", department: { ta: "நெடுஞ்சாலைத் துறை", en: "Highways" }, slaDays: 15, keywords: ["சாலை", "குழி", "road"] },
  { category: "sanitation", department: { ta: "ஊராட்சி – தூய்மைப் பணி", en: "Panchayat Sanitation" }, slaDays: 7, keywords: ["குப்பை", "கழிவு", "சாக்கடை", "கொசு"] },
  { category: "patta", department: { ta: "வருவாய்த்துறை", en: "Revenue" }, slaDays: 30, keywords: ["பட்டா", "சிட்டா", "நிலம்"] },
  { category: "ration", department: { ta: "உணவுப் பொருள் வழங்கல்", en: "Civil Supplies" }, slaDays: 7, keywords: ["ரேஷன்", "அரிசி", "குடும்ப அட்டை"] },
];

const URGENT = ["நோய்", "விபத்து", "ஆபத்து", "உடனடி", "குழந்தை", "காய்ச்சல்", "நாட்களாக"];

export interface GrievanceClass {
  category: Category;
  department: { ta: string; en: string };
  slaDays: number;
  urgency: 1 | 2 | 3;
}

export function classifyGrievance(p: Pick<GrievancePayload, "text" | "repeatCount">): GrievanceClass {
  const t = p.text.toLowerCase();
  const rule = RULES.find((r) => r.keywords.some((k) => t.includes(k.toLowerCase())));
  const base = rule ?? { category: "other" as const, department: { ta: "மாவட்ட ஆட்சியர் அலுவலகம்", en: "Collectorate" }, slaDays: 15 };
  let urgency = URGENT.some((k) => p.text.includes(k)) ? 3 : 1;
  if (p.repeatCount >= 2) urgency = Math.min(3, urgency + 1);
  return { category: base.category, department: base.department, slaDays: base.slaDays, urgency: urgency as 1 | 2 | 3 };
}

export function verifyGrievance(p: GrievancePayload): {
  findings: Finding[];
  blockers: number;
  warnings: number;
  suggestion: Suggestion;
  cls: GrievanceClass;
} {
  const cls = classifyGrievance(p);
  const findings: Finding[] = [];
  if (cls.category === "other") {
    findings.push({
      code: "CATEGORY_UNKNOWN",
      severity: "warning",
      ta: "புகாரின் வகையை உறுதி செய்ய முடியவில்லை",
      en: "Could not determine grievance category",
    });
  }
  if (cls.urgency === 3) {
    findings.push({
      code: "URGENT",
      // A priority signal, not a defect: it must never push the suggestion towards reject.
      // Queue ranking already uses the `urgency` column.
      severity: "warning",
      ta: "அவசரப் புகார் – உடனடி நடவடிக்கை தேவை",
      en: "Urgent grievance – immediate action needed",
    });
  }
  if (p.repeatCount >= 2) {
    findings.push({
      code: "REPEAT_COMPLAINT",
      severity: "warning",
      ta: `இதே இடத்தில் இது ${p.repeatCount}-வது புகார்`,
      en: `This is complaint #${p.repeatCount} for the same location`,
    });
  }
  if (p.location.trim().length < 3) {
    findings.push({
      code: "LOCATION_MISSING",
      severity: "warning",
      ta: "இடம் தெளிவாக இல்லை",
      en: "Location is unclear",
    });
  }
  if (!findings.length) {
    findings.push({ code: "ALL_CLEAR", severity: "ok", ta: "புகார் தெளிவாக உள்ளது", en: "Grievance is clear" });
  }
  const blockers = findings.filter((x) => x.severity === "blocker").length;
  const warnings = findings.filter((x) => x.severity === "warning").length;
  const suggestion: Suggestion = p.location.trim().length < 3 || cls.category === "other" ? "return" : "approve";
  return { findings, blockers, warnings, suggestion, cls };
}
