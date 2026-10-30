import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, documents } from "@/db/schema";
import { currentCitizen, currentOfficer } from "@/lib/auth";

/** Serves an uploaded document (stored in the database): to officers, or to the citizen whose application it is. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const officer = await currentOfficer();
  const citizen = officer ? null : await currentCitizen();
  if (!officer && !citizen) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [d] = await db
    .select({ data: documents.data, mime: documents.mime, fileName: documents.fileName, owner: applications.citizenId })
    .from(documents).innerJoin(applications, eq(documents.applicationId, applications.id)).where(eq(documents.id, id));
  if (!d?.data || (citizen && d.owner !== citizen.id)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(d.data), {
    headers: { "content-type": d.mime, "content-disposition": `inline; filename="${encodeURIComponent(d.fileName)}"`, "cache-control": "private, max-age=3600" },
  });
}
