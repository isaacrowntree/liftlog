/** Sync endpoint: forwards push/pull to the caller's own SyncJournal
 * Durable Object, addressed by their Access identity. */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

interface JournalStub {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}
interface JournalNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): JournalStub;
}

function journalFor(req: Request): JournalStub | Response {
  const email =
    req.headers.get("cf-access-authenticated-user-email") ??
    (process.env.NODE_ENV === "development"
      ? req.headers.get("x-liftlog-dev-user")
      : null);
  if (!email) {
    return Response.json({ error: "No authenticated identity" }, { status: 401 });
  }
  const { env } = getCloudflareContext();
  const ns = (env as { SYNC_JOURNAL?: JournalNamespace }).SYNC_JOURNAL;
  if (!ns) {
    return Response.json({ error: "Sync not configured" }, { status: 503 });
  }
  return ns.get(ns.idFromName(email.toLowerCase()));
}

export async function POST(req: Request) {
  const journal = journalFor(req);
  if (journal instanceof Response) return journal;
  return journal.fetch("https://journal/push", {
    method: "POST",
    body: await req.text(),
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: Request) {
  const journal = journalFor(req);
  if (journal instanceof Response) return journal;
  const since = new URL(req.url).searchParams.get("since") ?? "0";
  return journal.fetch(`https://journal/pull?since=${encodeURIComponent(since)}`);
}
