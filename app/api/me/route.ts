/** Who is logged in, per Cloudflare Access. The edge injects the identity
 * header after the user passes the Access policy. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const email =
    req.headers.get("cf-access-authenticated-user-email") ??
    (process.env.NODE_ENV === "development"
      ? req.headers.get("x-liftlog-dev-user")
      : null);
  return Response.json({ email });
}
