#!/usr/bin/env bash
# Configures Cloudflare Access in front of the portal. Safe to re-run: it
# converges to the same state each time.
#
#  1. Ensures the One-time PIN login method (emailed code) exists.
#  2. Creates or updates a self-hosted Access application covering every
#     hostname in ACCESS_HOSTNAMES, signing in with One-time PIN only, and
#     allowing only the emails in wrangler.jsonc's ALLOWED_EMAILS.
#  3. Prints the application's AUD tag, which goes in wrangler.jsonc's
#     ACCESS_AUD so the Worker accepts its sign-ins.
#
# Expects CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (exported by
# cloudflare-preflight.sh) and ACCESS_HOSTNAMES (comma-separated). The token
# needs "Access: Apps and Policies Edit" and "Access: Organizations, Identity
# Providers, and Groups Edit".
set -euo pipefail

APP_NAME="Sandstone internal portal"
POLICY_NAME="Allow-listed emails"

fail() {
  echo "::error::$1"
  exit 1
}

# Calls the account-scoped Cloudflare API and leaves the parsed response in
# API_RESP. It fails the run with Cloudflare's own error messages.
API_RESP=""
api() {
  local method=$1 path=$2 body=${3:-}
  local args=(-sS -X "$method"
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}${path}"
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
  if [ -n "$body" ]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  local raw status
  raw="$(curl -w '\n%{http_code}' "${args[@]}")" || fail "Could not reach the Cloudflare API ($method $path)."
  status="${raw##*$'\n'}"
  API_RESP="${raw%$'\n'*}"
  if [ "$(jq -r '.success' <<<"$API_RESP" 2>/dev/null)" != "true" ]; then
    echo "Cloudflare rejected $method $path (HTTP $status):"
    jq -r '.errors[]? | "  [\(.code)] \(.message // "(no message)")"' <<<"$API_RESP" 2>/dev/null || echo "  $API_RESP"
    if [ "$status" = 401 ] || [ "$status" = 403 ] \
      || jq -e '.errors[]? | select(.code == 10000 or .code == 9109 or ((.message // "") | test("auth|permission|not allowed"; "i")))' <<<"$API_RESP" >/dev/null 2>&1; then
      fail "The Cloudflare token isn't allowed to $method $path. Give it \"Access: Apps and Policies Edit\" and \"Access: Organizations, Identity Providers, and Groups Edit\"."
    fi
    fail "Cloudflare rejected $method $path with HTTP $status (errors above)."
  fi
}

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] \
  || fail "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not set (run cloudflare-preflight.sh first)."

hosts_json="$(jq -cn --arg raw "${ACCESS_HOSTNAMES:-}" \
  '[$raw | split(",")[] | gsub("^\\s+|\\s+$"; "") | select(length > 0)]')"
[ "$(jq 'length' <<<"$hosts_json")" -gt 0 ] || fail "ACCESS_HOSTNAMES is empty."

# The allow-list lives in wrangler.jsonc so the Worker's own check and the
# Access policy can't drift apart. TypeScript's parser understands JSONC.
emails_json="$(node -e '
  const ts = require("typescript");
  const fs = require("fs");
  const { config, error } = ts.parseConfigFileTextToJson("wrangler.jsonc", fs.readFileSync("wrangler.jsonc", "utf8"));
  if (error) { console.error("could not parse wrangler.jsonc"); process.exit(1); }
  const emails = String(config?.vars?.ALLOWED_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  console.log(JSON.stringify(emails));
')" || fail "Could not read ALLOWED_EMAILS from wrangler.jsonc."
[ "$(jq 'length' <<<"$emails_json")" -gt 0 ] || fail "ALLOWED_EMAILS in wrangler.jsonc is empty."

echo "Hostnames: $(jq -r 'join(", ")' <<<"$hosts_json")"
echo "Allowed:   $(jq -r 'join(", ")' <<<"$emails_json")"

# 1. One-time PIN login method.
api GET "/access/identity_providers"
otp_id="$(jq -r '[.result[]? | select(.type == "onetimepin")][0].id // empty' <<<"$API_RESP")"
if [ -z "$otp_id" ]; then
  api POST "/access/identity_providers" '{"name":"One-time PIN","type":"onetimepin","config":{}}'
  otp_id="$(jq -r '.result.id' <<<"$API_RESP")"
  echo "Created the One-time PIN login method ($otp_id)."
else
  echo "One-time PIN login method already exists ($otp_id)."
fi

# 2. Self-hosted application for the portal's hostnames.
body="$(jq -n \
  --arg name "$APP_NAME" \
  --arg policy "$POLICY_NAME" \
  --arg idp "$otp_id" \
  --argjson hosts "$hosts_json" \
  --argjson emails "$emails_json" '{
    name: $name,
    type: "self_hosted",
    domain: $hosts[0],
    destinations: [$hosts[] | {type: "public", uri: .}],
    allowed_idps: [$idp],
    auto_redirect_to_identity: true,
    app_launcher_visible: false,
    session_duration: "24h",
    policies: [{
      name: $policy,
      decision: "allow",
      precedence: 1,
      include: [$emails[] | {email: {email: .}}]
    }]
  }')"

api GET "/access/apps?per_page=1000"
app_id="$(jq -r --arg n "$APP_NAME" '[.result[]? | select(.name == $n)][0].id // empty' <<<"$API_RESP")"
if [ -z "$app_id" ]; then
  api POST "/access/apps" "$body"
  echo "Created Access application \"$APP_NAME\"."
else
  api PUT "/access/apps/$app_id" "$body"
  echo "Updated Access application \"$APP_NAME\" ($app_id)."
fi

aud="$(jq -r '.result.aud // empty' <<<"$API_RESP")"
[ -n "$aud" ] || fail "Cloudflare didn't return the application's AUD tag."

echo
echo "Application AUD tag: $aud"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Cloudflare Access configured"
    echo
    echo "- Application: **$APP_NAME**"
    echo "- Hostnames: $(jq -r 'map("`" + . + "`") | join(", ")' <<<"$hosts_json")"
    echo "- Login: One-time PIN (emailed code)"
    echo "- Allowed: $(jq -r 'join(", ")' <<<"$emails_json")"
    echo "- **AUD tag:** \`$aud\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi
