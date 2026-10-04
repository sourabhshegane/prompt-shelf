# Re-recording the demo GIFs

`demo.gif` comes from `demo.steps.mjs`: halfway through a prompt, Ctrl+F parks it, a short
question goes to `--model haiku`, Ctrl+Q brings the draft back, then a glance at the skills and a
shelf. One story, numbered captions. Seed the data folder first, from inside the demo folder:
`stash add --shelf Common "<prompt>"` for two or three prompts.

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

`record.mjs` drives a real Claude Code session through a PTY and saves an asciicast with caption
markers (and `fastForward` markers around waits on the agent). `render.mjs` blanks account
usage lines and Claude's feedback banner, shortens pauses, plays fast-forwarded stretches at
4x, and draws each caption as a box with its own background just above where the action is
(input box, toast, picker or list), following it as the screen changes.
