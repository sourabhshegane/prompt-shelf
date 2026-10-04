# Re-recording the demo GIFs

Two GIFs, each from its own steps file:

- `demo.gif` (`demo.steps.mjs`): park a half-written prompt with Ctrl+F, steer Claude, bring
  the draft back with Ctrl+Q. Sends two small prompts to `--model haiku`.
- `lists.gif` (`lists.steps.mjs`): a tour of the list (stash, skills, shelves). Sends nothing.

Needs `agg` and `ffmpeg` (`brew install agg ffmpeg`) and a folder Claude Code already trusts,
e.g. `~/Documents/personal-projects/demo-app`. Record with `PROMPT_SHELF_DIR` pointing at an
empty folder so your own stash stays out of the GIF. For `lists.gif`, seed that folder first
from inside the demo folder: one draft (`stash add ...`) and a few prompts on the Ideas,
To explore and Common shelves (`stash add --shelf Common ...`).

The Skills tab lists every skill Claude can use in the folder, including your personal ones.
To keep those out, switch them off for the demo folder only with `skillOverrides` in its
`.claude/settings.local.json` and put a few generic skills in its `.claude/skills/`.

```sh
export PROMPT_SHELF_DIR=$(mktemp -d)
DEMO_CWD=~/Documents/personal-projects/demo-app node docs/demo/record.mjs "$PWD/docs/demo/demo.steps.mjs" /tmp/demo.cast
node docs/demo/render.mjs /tmp/demo.cast docs/demo/demo.gif
```

`record.mjs` drives a real Claude Code session through a PTY and saves an asciicast with caption
markers. `render.mjs` blanks account usage lines and Claude's feedback banner, shortens pauses,
renders the terminal with agg, and adds each caption just above the input box with ffmpeg,
dimming the transcript behind it and zooming in on the prompt and the list.
