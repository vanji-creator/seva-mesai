import { applicationValues, centsToAres, type DocKind, type PattaCase } from "@/db/cases";
import type { DocReading } from "@/lib/docs/read";
import type { CaseInput, RegistryRecord } from "@/lib/verify/caseCheck";

/**
 * What a perfect reader would extract from a case's documents, and what the departments
 * hold — straight from the case definition. Used by tests (rules without OCR noise) and by
 * the seed for the simulated department records.
 */

const reading = (docType: DocKind, values: Record<string, unknown>): DocReading => ({
  docType, classifyConfidence: 1, reviewRequired: false, values, minConfidence: 1, engine: "truth", readAt: "",
});

export function truthReadings(c: PattaCase): Partial<Record<DocKind, DocReading>> {
  const a = applicationValues(c);
  const all: Partial<Record<DocKind, DocReading>> = {
    application_form: reading("application_form", { applicationNo: c.ref, seller: a.seller, buyer: a.buyer, surveyNo: a.surveyNo, extentCents: a.extentCents, deedNo: a.saleDeedNo, taxReceiptNo: a.taxReceiptNo }),
    sale_deed: reading("sale_deed", { deedNo: c.deed.no, seller: c.seller.name, buyer: c.buyer.name, surveyNo: c.surveyNo, extentCents: c.deedCopy?.extentCents ?? c.deed.extentCents, registrationDate: c.deed.date, saleAmount: c.deed.amount }),
    patta: reading("patta", { pattaNo: c.patta.no, owner: c.patta.owner, surveyNo: c.surveyNo, extentAres: centsToAres(c.deed.extentCents), village: c.village.ta }),
    ec: reading("ec", { surveyNo: c.surveyNo, periodTo: c.submittedOn, entries: c.ec.map((e) => ({ date: e.date, nature: e.nature, docNo: e.docNo, parties: e.parties, detail: e.detail })) }),
    tax_receipt: reading("tax_receipt", { receiptNo: c.tax.receiptNo, surveyNo: c.surveyNo, payer: c.seller.name, paidUpTo: c.tax.paidUpTo, paidAmount: c.tax.paidAmount, dues: c.tax.dues }),
    id_proof: reading("id_proof", { name: c.idProof.name, idNumber: c.idProof.number, dob: c.idProof.dob }),
  };
  return Object.fromEntries(Object.entries(all).filter(([k]) => k in c.docs));
}

/** The simulated department databases for a case (always the genuine values). */
export function registryFor(c: PattaCase): RegistryRecord {
  const open = c.ec.filter((e) => e.nature === "mortgage").length > c.ec.filter((e) => e.nature === "release").length;
  const court = c.ec.find((e) => e.nature === "court_attachment");
  return {
    deed: { deedNo: c.deed.no, seller: c.seller.name, buyer: c.buyer.name, surveyNo: c.surveyNo, extentCents: c.deed.extentCents },
    land: { currentOwner: c.patta.owner, extentCents: c.deed.extentCents, pattaNo: c.patta.no },
    tax: { paidUpToYear: Number(c.tax.paidUpTo.slice(0, 4)), duesAmount: c.tax.dues },
    encumbrances: [
      ...(open ? [{ kind: "mortgage" as const, detail: c.ec.filter((e) => e.nature === "mortgage").at(-1)!.detail }] : []),
      ...(court ? [{ kind: "litigation" as const, detail: court.detail }] : []),
    ],
  };
}

export const truthInput = (c: PattaCase, fyStart = 2026): CaseInput => ({
  application: applicationValues(c),
  docs: truthReadings(c),
  unrelated: [],
  registry: registryFor(c),
  fyStart,
});
