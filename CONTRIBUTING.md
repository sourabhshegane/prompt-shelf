# Contributing

Thanks for helping. Bug reports, agent adapters and small fixes are all
welcome. For anything bigger, open an issue first so we can agree on the
approach before you spend time on it.

## Setup

```bash
git clone https://github.com/sourabhshegane/prompt-shelf.git
cd prompt-shelf
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run build       # tsup -> dist/
```

Run your local build without installing it globally:

```bash
node bin/stash.js claude
```

`dist/` is committed so that installs from git need no build step. Run
`npm run build` and commit `dist/` together with your source change.

## Reporting a bug

Please include:

- your OS, terminal app (e.g. iTerm2, Warp, Terminal.app) and Node version
- the agent and its version (`claude --version`, `codex --version`)
- what you pressed, what you expected and what happened
- a screenshot of the input box if the draft was read wrong

A screen dump helps most. Run `stash --record claude`, press the hotkey where
it goes wrong, and attach the `record-*.txt` file it writes to
`~/.prompt-shelf/` (check it for anything private first).

## Adding an agent

Each agent has a small adapter in `src/adapters/` that knows how to find and
read its input box on screen.

1. Copy `src/adapters/codex.ts` to `src/adapters/<agent>.ts`. Set `command`,
   the keys the agent uses itself (`reservedKeys`), and the regexes that match
   the input box's first line, continuation lines and the border under it.
2. Register it in `src/adapters/index.ts`.
3. Record real screens with `stash --record <agent>`: an empty box, one line,
   several lines, and while the agent is busy. Put them in
   `tests/adapters/fixtures/`.
4. Add tests in `tests/adapters/` that run `readDraft` against those fixtures.
5. Try it live: stash, open the list, unstash, and check the agent's own keys
   still work.

## Pull requests

- Keep each PR to one change, with tests.
- `npm test` and `npm run typecheck` must pass.
- Match the style of the code around your change.
- Say which terminal and agent version you tested with.

## Releasing (maintainers)

Publishing is automated with npm trusted publishing, so no npm token or OTP is
needed:

1. Bump `version` in `package.json` (and `package-lock.json`) and push to `main`.
2. Tag it and push the tag: `git tag v0.1.2 && git push origin v0.1.2`.

The Release workflow checks the tag matches `package.json`, runs typecheck,
tests and build, publishes to npm and creates the GitHub release.

## Code of conduct

Be kind and assume good intent. Harassment isn't tolerated.
