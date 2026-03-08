#!/bin/bash
# Ralph - Autonomous AI Agent Loop (Beads edition)
# Usage: ./scripts/ralph/ralph.sh [--tool amp|claude] [max_iterations]

set -e

# Parse arguments
TOOL="claude"  # Default to claude code
MAX_ITERATIONS=20

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"

# ── Preflight: dolt server check ─────────────────────────────────────────────
echo "Checking Beads (dolt) server..."
if ! bd ready --json >/dev/null 2>&1; then
  echo ""
  echo "ERROR: Beads dolt server is not running or bd is misconfigured."
  echo "Start it with: launchctl start com.beads.dolt-server"
  echo "Or manually: cd ~/.beads-dolt && dolt sql-server --port 3307 &"
  exit 1
fi
echo "✓ Beads server OK"

# ── Check for ready tasks ─────────────────────────────────────────────────────
READY=$(bd ready --json 2>/dev/null)
if [[ "$READY" == "[]" || -z "$READY" ]]; then
  echo ""
  echo "No tasks ready to work on. Check 'bd list' to see all issues."
  echo "Use 'bd ready' to see what's blocked."
  exit 0
fi

echo "Tasks ready: $(echo "$READY" | python3 -c "import json,sys; tasks=json.load(sys.stdin); print(len(tasks))" 2>/dev/null || echo "?")"

# ── Archive previous progress if this is a new feature run ───────────────────
LAST_RUN_FILE="$SCRIPT_DIR/.last-run-id"
CURRENT_BRANCH=$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

if [ -f "$LAST_RUN_FILE" ]; then
  LAST_BRANCH=$(cat "$LAST_RUN_FILE" 2>/dev/null || echo "")
  if [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ] && [ -f "$PROGRESS_FILE" ]; then
    DATE=$(date +%Y-%m-%d)
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "Archived previous progress to: $ARCHIVE_FOLDER"
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date) on branch: $CURRENT_BRANCH" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi
echo "$CURRENT_BRANCH" > "$LAST_RUN_FILE"

# ── Initialize progress file if needed ───────────────────────────────────────
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date) on branch: $CURRENT_BRANCH" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# ── Main loop ─────────────────────────────────────────────────────────────────
echo ""
echo "Starting Ralph — Tool: $TOOL — Max iterations: $MAX_ITERATIONS"
echo "Branch: $CURRENT_BRANCH"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "================================================================"
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "================================================================"

  # Quick check: any work left?
  READY_CHECK=$(bd ready --json 2>/dev/null || echo "[]")
  if [[ "$READY_CHECK" == "[]" ]]; then
    echo ""
    echo "✓ All tasks complete! (detected before iteration)"
    exit 0
  fi

  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat "$SCRIPT_DIR/prompt.md" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee /dev/stderr) || true
  fi

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "✓ Ralph completed all tasks! (iteration $i of $MAX_ITERATIONS)"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS). Some tasks may remain."
echo "Run 'bd ready' to see what's left."
exit 1
