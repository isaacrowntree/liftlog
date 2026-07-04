/** Cloud backup endpoint. Runs on the Worker; the R2 bucket holds one
 * namespace per Cloudflare Access identity. Access sits in front of the
 * whole app, so these routes are already authenticated — we just read the
 * identity header Access injects. */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  storeBackup,
  fetchLatestBackup,
  type BackupBucket,
} from "@/server/backupStore";

export const dynamic = "force-dynamic";

function identityFrom(req: Request): string | null {
  const email = req.headers.get("cf-access-authenticated-user-email");
  if (email) return email;
  // Local dev has no Access in front; accept a dev header there only.
  if (process.env.NODE_ENV === "development") {
    return req.headers.get("x-liftlog-dev-user");
  }
  return null;
}

function bucket(): BackupBucket | null {
  const { env } = getCloudflareContext();
  return (env as { BACKUPS?: BackupBucket }).BACKUPS ?? null;
}

export async function POST(req: Request) {
  const email = identityFrom(req);
  if (!email) {
    return Response.json({ error: "No authenticated identity" }, { status: 401 });
  }
  const backups = bucket();
  if (!backups) {
    return Response.json({ error: "Backup storage not configured" }, { status: 503 });
  }
  try {
    const summary = await storeBackup(backups, email, await req.text(), new Date());
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid backup" },
      { status: 400 },
    );
  }
}

export async function GET(req: Request) {
  const email = identityFrom(req);
  if (!email) {
    return Response.json({ error: "No authenticated identity" }, { status: 401 });
  }
  const backups = bucket();
  if (!backups) {
    return Response.json({ error: "Backup storage not configured" }, { status: 503 });
  }
  const json = await fetchLatestBackup(backups, email);
  if (json === null) {
    return Response.json({ error: "No cloud backup yet" }, { status: 404 });
  }
  return new Response(json, {
    headers: { "content-type": "application/json" },
  });
}
