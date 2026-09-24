# Re-recording the demo GIF

Needs `agg` and `ffmpeg` (`brew install agg ffmpeg`) and a folder Claude Code
already trusts, e.g. `~/Documents/personal-projects/demo-app`. Seed the stash
with a few example entries first so the list isn't empty.

```sh
DEMO_CWD=~/Documents/personal-projects/demo-app node docs/demo/record.mjs "$PWD/docs/demo/demo.steps.mjs" /tmp/demo.cast
node docs/demo/render.mjs /tmp/demo.cast docs/demo/demo.gif
```

`record.mjs` drives a real Claude Code session through a PTY (the demo uses
`--model haiku` and sends two small read-only prompts) and saves an asciicast
with caption markers. `render.mjs` blanks account usage lines, shortens pauses,
renders the terminal with agg, and adds each caption just above the input box
with ffmpeg, dimming the transcript behind it so the caption and the action
stand out, and zooms in on the prompt and stash list between the first and
last caption.
