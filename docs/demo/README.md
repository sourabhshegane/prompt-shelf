# Re-recording the demo GIFs

`demo.gif` comes from `demo.steps.mjs`: the whole idea in under 20 seconds. A half-written
prompt, Ctrl+F parks it, Ctrl+Q brings it back, then a list of saved prompts. The terminal is
80x16 so the list (11 rows) opens right on top of the input box, and nothing is sent to the
model. Seed the data folder first, from inside the demo folder, so the list is full:
`STASH=stash sh docs/demo/seed.sh` (path relative to this repo).

Needs `agg` and `ffmpeg` (`brew install agg ffmpeg`) and a folder Claude Code already trusts,
e.g. `~/Documents/personal-projects/demo-app`. Record with `PROMPT_SHELF_DIR` pointing at an
empty folder so your own stash stays out of the GIF. If the list shows the Skills tab, it
lists your personal skills too; switch them off for the demo folder only with
`skillOverrides` in its `.claude/settings.local.json`.

```sh
export PROMPT_SHELF_DIR=$(mktemp -d)
DEMO_CWD=~/Documents/personal-projects/demo-app node docs/demo/record.mjs "$PWD/docs/demo/demo.steps.mjs" /tmp/demo.cast
node docs/demo/render.mjs /tmp/demo.cast docs/demo/demo.gif
```

`record.mjs` drives a real Claude Code session through a PTY and saves an asciicast with markers:
captions, key names, holds, `trimStart` (skip the agent's start-up) and `fastForward`.
`render.mjs` blanks account usage lines and Claude's feedback banner, shortens pauses, adds the
holds, and shows a 7-row camera window that sits on whatever is acting (the input box, or the top
of the list while it is open) and pans between them. Each caption is a card shown in that same
window before its step, so the message appears where the viewer is already looking, and a badge
in the window's corner names each key as it is pressed.
