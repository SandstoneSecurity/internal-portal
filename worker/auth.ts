import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, decodeJwt, errors, jwtVerify, type JWTVerifyGetKey } from "jose";

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

// Cloudflare Access session logout, handled at the edge (never reaches the Worker).
const SIGN_OUT_URL = "/cdn-cgi/access/logout";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/** Last few characters of an AUD tag: enough to tell two apart, not worth hiding (it's in wrangler.jsonc). */
function audTail(aud: unknown): string {
  const first = Array.isArray(aud) ? aud[0] : aud;
  return typeof first === "string" ? `…${first.slice(-6)}` : "(none)";
}

/**
 * Explains a rejected token without trusting it: claims are decoded, not
 * verified, and only echoed back to the person who already holds the token.
 */
function explainRejectedToken(token: string, err: unknown, issuer: string, audience: string): string {
  let claims: Record<string, unknown> = {};
  try {
    claims = decodeJwt(token);
  } catch {
    return "The sign-in token couldn't be read.";
  }
  // Compare the token's own claims first: jose checks the signature before the
  // issuer, so a token from another team would otherwise surface as a bare
  // signature failure.
  if (claims.iss !== issuer) {
    return `The sign-in came from a different Zero Trust team (${String(claims.iss)}; this portal expects ${issuer}).`;
  }
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(audience)) {
    return `The sign-in came from a different Cloudflare Access application (audience ${audTail(claims.aud)}; this portal expects ${audTail(audience)}).`;
  }
  if (err instanceof errors.JWTExpired) return "Your sign-in has expired.";
  if (err instanceof errors.JWKSTimeout) return "Couldn't reach Cloudflare to verify the sign-in. Try again.";
  return "The sign-in token's signature couldn't be verified.";
}

function denialPage(message: string, email?: string): string {
  const who = email ? `<p>Signed in as <strong>${escapeHtml(email)}</strong>.</p>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Access denied · Sandstone</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #f4efe6; color: #2b2723; font: 15px/1.5 system-ui, sans-serif; padding: 16px; box-sizing: border-box; }
  main { max-width: 440px; background: #fff; border: 1px solid #d9d0c1; padding: 32px; }
  h1 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 12px; }
  a { color: #96774c; }
</style>
</head>
<body>
<main>
  <h1>Access denied</h1>
  <p>${escapeHtml(message)}</p>
  ${who}
  <p><a href="${SIGN_OUT_URL}">Sign out and try again</a> with an authorised account.</p>
</main>
</body>
</html>`;
}

function issuerFor(teamDomain: string): string {
  const host = teamDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}`;
}

export const requireAccess = createMiddleware<{ Bindings: AccessEnv; Variables: AuthVariables }>(async (c, next) => {
  // `message` is shown to the person being refused, so it only ever describes
  // their own sign-in; `reason` (logs only) may carry more detail.
  const deny = (status: 401 | 403 | 503, message: string, reason: string, email?: string) => {
    console.warn(`access denied (${status}): ${reason}`);
    if (c.req.path.startsWith("/api/")) return c.json({ error: "Access denied", message }, status);
    return c.html(denialPage(message, email), status);
  };

  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAILS } = c.env;
  const allowed = (ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD || allowed.length === 0) {
    return deny(
      503,
      "The portal's sign-in isn't configured yet.",
      "Access is not configured (ACCESS_TEAM_DOMAIN, ACCESS_AUD, ALLOWED_EMAILS)",
    );
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) {
    return deny(
      401,
      "This request didn't come through Cloudflare Access sign-in, so Access may not be switched on for this address.",
      "missing Cf-Access-Jwt-Assertion header",
    );
  }

  const issuer = issuerFor(ACCESS_TEAM_DOMAIN);
  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwksFor(issuer), { issuer, audience: ACCESS_AUD });
    email = payload.email;
  } catch (err) {
    return deny(
      403,
      explainRejectedToken(token, err, issuer, ACCESS_AUD),
      `invalid Access token: ${(err as Error).message}`,
    );
  }

  if (typeof email !== "string") {
    return deny(403, "The sign-in didn't include an email address.", "token has no email claim");
  }
  if (!allowed.includes(email.toLowerCase())) {
    return deny(403, "This account isn't authorised to use the portal.", `email not allow-listed: ${email}`, email);
  }

  c.set("userEmail", email);
  await next();
});
