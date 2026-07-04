/** Runtime user config. The LIFTLOG_USERS Worker secret (set once with
 * `wrangler secret put LIFTLOG_USERS`) survives every deploy — CI builds
 * from the clean repo no longer ship placeholder users. Local dev falls
 * back to the build-time env from .env.local. */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

export async function GET() {
  const { env } = getCloudflareContext();
  // Prod: `wrangler secret put LIFTLOG_USERS`. Dev: LIFTLOG_USERS in
  // .dev.vars (loaded by initOpenNextCloudflareForDev). No build-time path.
  const raw = (env as { LIFTLOG_USERS?: string }).LIFTLOG_USERS ?? null;

  if (!raw) return Response.json({ users: null });
  try {
    return Response.json({ users: JSON.parse(raw) });
  } catch {
    return Response.json({ users: null });
  }
}
