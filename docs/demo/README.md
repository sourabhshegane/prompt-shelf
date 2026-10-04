# Re-recording the demo GIFs

`demo.gif` comes from `demo.steps.mjs`: the whole idea in about 13 seconds. A half-written
prompt, Ctrl+F parks it, Ctrl+Q brings it back, in a small terminal (80x18) so the input box is
the picture. Nothing is sent to the model. Seed the data folder first, from inside the demo
folder: `stash add --shelf Common "<prompt>"` for a prompt or two.

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
holds, and draws each caption as a quiet box just above the action (or in the list's empty rows
when the list fills the screen), with a badge naming each key as it is pressed.
