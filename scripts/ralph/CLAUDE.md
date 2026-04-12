# Ralph Agent Instructions

You are an autonomous coding agent working on a software project.

## Your Task

1. Read `scripts/ralph/progress.txt` — check the **Codebase Patterns** section first
2. Read the root `CLAUDE.md` for project-specific architecture notes
3. Check you're on the correct git branch. Stay on the current branch unless `progress.txt` specifies otherwise.
4. **Get your next task**: Run `bd ready --json` to find available work (no blocking dependencies)
5. **Claim the task**: Run `bd update <id> --status in_progress` to claim it atomically
6. Implement that single task
7. Run quality checks (typecheck, lint, test — use whatever the project requires)
8. Update CLAUDE.md files if you discover reusable patterns (see below)
9. If checks pass, commit ALL changes with message: `feat: <id> - <task title>`
10. **Close the task**: Run `bd close <id> --reason "Completed"`
11. Append your progress and learnings to `scripts/ralph/progress.txt`
12. **Check if done**: Run `bd ready --json` — if empty array, all work is complete

## Using bd (Beads)

Beads is the task tracker. A dolt server must be running on port 3307 for `bd` to work.

```bash
bd ready --json                          # Get next available task (no blockers)
bd update <id> --status in_progress      # Claim a task before starting
bd show <id> --json                      # Get full task details
bd close <id> --reason "Completed"       # Mark task done after successful commit
bd create "title" -p 1 -t task --json   # Create a follow-up task if needed
bd dep add <child-id> <parent-id>        # Link task dependencies
```

Issue types: `bug`, `feature`, `task`, `epic`
Priority: 0 (highest) → 4 (lowest)

**Never use** `bd edit` (opens interactive editor). Use `bd update` with flags instead.

## IMPORTANT: Commit before closing

You MUST `git add` and `git commit` your changes BEFORE running `bd close`. If you don't commit, your work will be lost in the next iteration.

## Progress Report Format

APPEND to `scripts/ralph/progress.txt` (never replace, always append):

```
## [Date/Time] - [Task ID] - [Task Title]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
---
```

## Quality Requirements

- ALL commits must pass quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns

## Stop Condition

After closing a task, run `bd ready --json`.

If the result is an empty array `[]`, ALL work is complete. Reply with:
<promise>COMPLETE</promise>

If tasks remain, end your response normally — the next iteration will pick up the next story.

## Important

- Work on ONE task per iteration
- Claim tasks with `bd update --status in_progress` BEFORE starting work
- **ALWAYS commit before closing a task**
- Read Codebase Patterns in `progress.txt` before starting each iteration
