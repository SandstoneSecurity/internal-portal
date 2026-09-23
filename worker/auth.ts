import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Cloudflare Access sits in front of this Worker and handles sign-in (email
// one-time PIN). This middleware is the second layer: every request must carry
// a valid Access JWT for this application, issued to an allow-listed email.
// If Access is ever switched off or misconfigured, or the config below is
// missing, requests are refused rather than served.

export interface AccessEnv {
  /** Zero Trust team domain, e.g. "sandstone.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Comma-separated list of emails allowed in. */
  ALLOWED_EMAILS?: string;
}

export type AuthVariables = { userEmail: string };

const jwksByIssuer = new Map<string, JWTVerifyGetKey>();

function jwksFor(issuer: string): JWTVerifyGetKey {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

function issuerFor(teamDomain: string): string {
  const host = teamDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}`;
}

export const requireAccess = createMiddleware<{ Bindings: AccessEnv; Variables: AuthVariables }>(async (c, next) => {
  const deny = (status: 401 | 403 | 503, reason: string) => {
    console.warn(`access denied (${status}): ${reason}`);
    if (c.req.path.startsWith("/api/")) return c.json({ error: "Access denied" }, status);
    return c.text("Access denied.", status);
  };

  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAILS } = c.env;
  const allowed = (ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD || allowed.length === 0) {
    return deny(503, "Access is not configured (ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAILS)");
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return deny(401, "missing Cf-Access-Jwt-Assertion header");

  const issuer = issuerFor(ACCESS_TEAM_DOMAIN);
  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwksFor(issuer), { issuer, audience: ACCESS_AUD });
    email = payload.email;
  } catch (err) {
    return deny(403, `invalid Access token: ${(err as Error).message}`);
  }

  if (typeof email !== "string" || !allowed.includes(email.toLowerCase())) {
    return deny(403, `email not allow-listed: ${String(email)}`);
  }

  c.set("userEmail", email);
  await next();
});
