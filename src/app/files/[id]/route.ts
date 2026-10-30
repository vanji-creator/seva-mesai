import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documents } from "@/db/schema";
import { currentOfficer } from "@/lib/auth";

/** Serves a document an officer uploaded (stored in the database). Signed-in officers only. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentOfficer())) return new Response("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return new Response("Not found", { status: 404 });
  const [d] = await db.select({ data: documents.data, mime: documents.mime, fileName: documents.fileName }).from(documents).where(eq(documents.id, id));
  if (!d?.data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(d.data), {
    headers: { "content-type": d.mime, "content-disposition": `inline; filename="${encodeURIComponent(d.fileName)}"`, "cache-control": "private, max-age=3600" },
  });
}
