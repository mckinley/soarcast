#!/bin/bash
# Ralph orchestrator with Telegram notifications
# Usage: ./scripts/ralph/run-ralph.sh [--tool claude|amp] [max_iterations] [--label "Phase 4"]
# Runs Ralph, notifies Bronson on Telegram when done (success or failure)

set -e

TOOL="claude"
MAX_ITERATIONS=30
LABEL=""
NOTIFY_TARGET="1970469399"  # Bronson's Telegram chat ID

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool) TOOL="$2"; shift 2 ;;
    --tool=*) TOOL="${1#*=}"; shift ;;
    --label) LABEL="$2"; shift 2 ;;
    --label=*) LABEL="${1#*=}"; shift ;;
    *) if [[ "$1" =~ ^[0-9]+$ ]]; then MAX_ITERATIONS="$1"; fi; shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$SCRIPT_DIR/ralph-run.log"
START_TIME=$(date +%s)

notify() {
  local msg="$1"
  openclaw message send \
    --channel telegram \
    --target "$NOTIFY_TARGET" \
    --message "$msg" 2>/dev/null || echo "[notify failed] $msg"
}

# ── Preflight checks ──────────────────────────────────────────────────────────
if ! bd ready --json >/dev/null 2>&1; then
  notify "🔴 Ralph failed to start: Beads/dolt server not reachable. Run: launchctl start com.beads.dolt-server"
  exit 1
fi

READY_COUNT=$(bd ready --json 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
if [[ "$READY_COUNT" == "0" ]]; then
  notify "🔴 Ralph: No tasks ready to work on. Check 'bd list' to see all issues."
  exit 0
fi

BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
TAG="${LABEL:+$LABEL · }${BRANCH}"

# ── Notify start ──────────────────────────────────────────────────────────────
notify "🤖 Ralph starting — $TAG
Branch: $BRANCH
Tasks ready: $READY_COUNT
Max iterations: $MAX_ITERATIONS"

echo "$(date): Starting Ralph — $TAG" | tee "$LOG_FILE"

# ── Run Ralph ─────────────────────────────────────────────────────────────────
EXIT_CODE=0
"$SCRIPT_DIR/ralph.sh" --tool "$TOOL" "$MAX_ITERATIONS" 2>&1 | tee -a "$LOG_FILE" || EXIT_CODE=$?

END_TIME=$(date +%s)
ELAPSED=$(( (END_TIME - START_TIME) / 60 ))

# ── Collect results ──────────────────────────────────────────────────────────
CLOSED=$(bd list --status closed --json 2>/dev/null | python3 -c "import json,sys; tasks=json.load(sys.stdin); print(len([t for t in tasks if t.get('status')=='closed']))" 2>/dev/null || echo "?")
REMAINING=$(bd ready --json 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")

# ── Notify result ─────────────────────────────────────────────────────────────
if [[ $EXIT_CODE -eq 0 && "$REMAINING" == "0" ]]; then
  # ── All tasks done: deploy + smoke test ────────────────────────────────────
  notify "🚀 Ralph complete — $TAG
All $CLOSED tasks done in ${ELAPSED}m
Deploying to production..."

  cd "$PROJECT_ROOT"
  DEPLOY_LOG=$(vercel --prod --yes 2>&1)
  DEPLOY_EXIT=$?
  DEPLOY_URL=$(echo "$DEPLOY_LOG" | grep "Aliased:" | grep -o 'https://[^ ]*' | head -1)
  DEPLOY_URL="${DEPLOY_URL:-https://soarcast.vercel.app}"

  if [[ $DEPLOY_EXIT -ne 0 ]]; then
    notify "⚠️ Deploy failed after $TAG
Check: vercel --prod --yes"
  else
    # ── Smoke test ────────────────────────────────────────────────────────────
    sleep 5  # Let deployment settle
    SMOKE_OUT=$("$SCRIPT_DIR/smoke-test.sh" "$DEPLOY_URL" 2>&1)
    SMOKE_EXIT=$?

    if [[ $SMOKE_EXIT -eq 0 ]]; then
      notify "✅ Done — $TAG
$CLOSED tasks • ${ELAPSED}m build • deployed + smoke tests passed
🌐 $DEPLOY_URL"
    else
      SMOKE_ISSUES=$(echo "$SMOKE_OUT" | grep "❌" | head -5 | tr '\n' ' ')
      notify "⚠️ Deployed but smoke tests FAILED — $TAG
$SMOKE_ISSUES
Check: $DEPLOY_URL"
    fi
  fi

elif [[ $EXIT_CODE -eq 0 ]]; then
  notify "⚠️ Ralph stopped — $TAG
Ran for ${ELAPSED}m — reached max iterations ($MAX_ITERATIONS)
Tasks remaining: $REMAINING • Tasks closed: $CLOSED
Run again to continue."

else
  LAST_LOG=$(tail -5 "$LOG_FILE" | tr '\n' ' ' | cut -c1-200)
  notify "❌ Ralph failed — $TAG
Exit code: $EXIT_CODE after ${ELAPSED}m
Last output: $LAST_LOG
Check: $LOG_FILE"
fi
