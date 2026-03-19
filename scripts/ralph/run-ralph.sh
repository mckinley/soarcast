#!/bin/bash
# Thin wrapper — delegates to canonical Ralph in ~/Projects/Tools/ralph/
# Edit ralph.config in this directory to set project-specific defaults.
exec "$HOME/Projects/Tools/ralph/run-ralph.sh" "$@"
