#!/bin/sh
# prompt-shelf installer: curl -fsSL https://raw.githubusercontent.com/sourabhshegane/prompt-shelf/main/install.sh | sh
# Installs the npm package globally and sets up the `claude` / `codex` shims.
set -eu

say() { printf '%s\n' "$*"; }
fail() { say "prompt-shelf: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js 20 or newer is required. Install it with 'brew install node' or from https://nodejs.org, then run this again."
command -v npm >/dev/null 2>&1 || fail "npm is required (it comes with Node.js)."

major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 20 ] || fail "Node.js 20 or newer is required (found $(node --version))."

say "Installing prompt-shelf with npm..."
NPM_CONFIG_UPDATE_NOTIFIER=false npm install -g prompt-shelf --no-fund --no-audit --loglevel=error >/dev/null || fail "npm install -g failed. If it's a permissions error, see https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"

stash=$(command -v stash 2>/dev/null || true)
[ -n "$stash" ] || stash="$(npm prefix -g)/bin/stash"
[ -x "$stash" ] || fail "installed, but the stash command was not found. Open a new terminal tab and run: stash enable"

"$stash" enable

say ""
say "prompt-shelf $("$stash" --version) is installed."
say "Open a new terminal tab, then run claude or codex as usual."
say "Ctrl+F stashes a draft, Ctrl+Q brings it back. Check the setup with: stash doctor"
