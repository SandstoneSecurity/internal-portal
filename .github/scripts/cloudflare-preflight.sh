#!/usr/bin/env bash
# Validates the CLOUDFLARE_API secret and resolves the Cloudflare account ID,
# exporting CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for later steps.
# Never prints the token itself.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

token="${RAW_TOKEN:-}"
# Trim surrounding whitespace/newlines picked up when pasting the secret.
token="${token#"${token%%[![:space:]]*}"}"
token="${token%"${token##*[![:space:]]}"}"
# Tolerate a pasted "Bearer " prefix.
token="${token#Bearer }"

[ -n "$token" ] || fail "The CLOUDFLARE_API secret is empty or missing."
echo "::add-mask::$token"

if [ "$token" != "${RAW_TOKEN}" ]; then
  echo "::warning::CLOUDFLARE_API had surrounding whitespace or a 'Bearer ' prefix; stripped it."
fi
case "$token" in
  *[[:space:]]*) fail "CLOUDFLARE_API contains spaces or line breaks. It should be only the token value, copied from Cloudflare when the token was created." ;;
esac
if [[ "$token" =~ ^[0-9a-f]{37}$ ]]; then
  fail "CLOUDFLARE_API looks like a Global API Key, not an API token. Create an API token (My Profile → API Tokens) with Workers Scripts:Edit and D1:Edit."
fi
echo "Token length: ${#token} characters"

resp="$(curl -sS https://api.cloudflare.com/client/v4/accounts \
  -H "Authorization: Bearer $token")" || fail "Could not reach the Cloudflare API."

if [ "$(jq -r '.success' <<<"$resp")" != "true" ]; then
  echo "Cloudflare rejected the token:"
  jq -r '.errors[]? | "  [\(.code)] \(.message)"' <<<"$resp"
  fail "The CLOUDFLARE_API token is not valid. Roll or recreate it in Cloudflare and update the secret with the full token value."
fi

accounts="$(jq -r '.result[] | "\(.id)  \(.name)"' <<<"$resp")"
count="$(jq '.result | length' <<<"$resp")"
echo "Token is valid; it can access $count account(s):"
echo "$accounts" | sed 's/^/  /'

if [ -n "${PINNED_ACCOUNT_ID:-}" ]; then
  account_id="$PINNED_ACCOUNT_ID"
  jq -e --arg id "$account_id" '.result[] | select(.id == $id)' <<<"$resp" >/dev/null \
    || fail "CLOUDFLARE_ACCOUNT_ID ($account_id) is not one of the accounts this token can access."
elif [ "$count" -eq 1 ]; then
  account_id="$(jq -r '.result[0].id' <<<"$resp")"
elif [ "$count" -eq 0 ]; then
  fail "The token is valid but has no account access. Give it Account-level Workers Scripts:Edit and D1:Edit permissions."
else
  fail "The token can access several accounts. Add a CLOUDFLARE_ACCOUNT_ID repository secret with the ID of the account to deploy to (listed above)."
fi

echo "Deploying to account $account_id"
{
  echo "CLOUDFLARE_API_TOKEN=$token"
  echo "CLOUDFLARE_ACCOUNT_ID=$account_id"
} >>"$GITHUB_ENV"
