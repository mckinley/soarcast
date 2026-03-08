#!/bin/bash
# Production smoke test — run after every deploy
# Usage: ./scripts/ralph/smoke-test.sh [base_url]
# Returns 0 if all checks pass, 1 if any fail

BASE_URL="${1:-https://soarcast.vercel.app}"
PASS=0
FAIL=0
ISSUES=()

check() {
  local name="$1"
  local url="$2"
  local expect_status="${3:-200}"
  local expect_body="$4"

  RESPONSE=$(curl -s -o /tmp/smoke-body.txt -w "%{http_code}" \
    -L --max-time 15 \
    -A "SoarCast-SmokeTest/1.0" \
    "$url" 2>/dev/null)

  if [[ "$RESPONSE" != "$expect_status" ]]; then
    FAIL=$((FAIL+1))
    ISSUES+=("❌ $name: expected HTTP $expect_status, got $RESPONSE ($url)")
    return 1
  fi

  if [[ -n "$expect_body" ]]; then
    if ! grep -q "$expect_body" /tmp/smoke-body.txt 2>/dev/null; then
      FAIL=$((FAIL+1))
      ISSUES+=("❌ $name: body missing '$expect_body' ($url)")
      return 1
    fi
  fi

  PASS=$((PASS+1))
  echo "  ✓ $name"
  return 0
}

echo "🔍 Smoke testing $BASE_URL ..."
echo ""

# ── Core pages ────────────────────────────────────────────────────────────────
check "Landing page loads"        "$BASE_URL/"                      200 "SoarCast"
check "Auth signin page"          "$BASE_URL/auth/signin"           200 "Sign"
check "Browse sites page"         "$BASE_URL/sites/browse"          200
check "Dashboard (redirects)"     "$BASE_URL/dashboard"             200

# ── API health ────────────────────────────────────────────────────────────────
check "Sites API"                 "$BASE_URL/api/sites"             200
check "Weather profile API"       "$BASE_URL/api/weather/profile?lat=47.5&lng=-121.9&days=1" 200

# ── Auth provider config ──────────────────────────────────────────────────────
# Check that the GitHub OAuth callback URL returns the right redirect (not a GitHub error)
AUTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -L --max-time 10 \
  "$BASE_URL/api/auth/providers" 2>/dev/null)
if [[ "$AUTH_RESPONSE" == "200" ]]; then
  PASS=$((PASS+1))
  echo "  ✓ Auth providers endpoint"
else
  FAIL=$((FAIL+1))
  ISSUES+=("❌ Auth providers: HTTP $AUTH_RESPONSE ($BASE_URL/api/auth/providers)")
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [[ ${#ISSUES[@]} -gt 0 ]]; then
  echo ""
  for issue in "${ISSUES[@]}"; do
    echo "$issue"
  done
  exit 1
fi

echo "✅ All checks passed"
exit 0
