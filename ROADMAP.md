# Roadmap

Rough order, not promises. Each item has an issue: 👍 the ones you want most,
or open a new issue with a different idea.

## Next

- **Choose what the list shows.** ([#2](https://github.com/sourabhshegane/prompt-shelf/issues/2)) Today the list opens on the current git
  repo's entries and `Tab` shows everything. A setting (and more `Tab` stops)
  would let you pick the default:
  - **per session**: only what you stashed in this Claude/Codex session
  - **per repo**: the current git repo, as now
  - **per branch**: the current repo and git branch
  - **per agent**: only Claude's or only Codex's entries
  - **everything**: all entries on this machine

## Later

- **More agents.** ([#4](https://github.com/sourabhshegane/prompt-shelf/issues/4)) Gemini CLI, Aider, OpenCode and others. Each one needs a
  small adapter that knows what its input box looks like (see
  [CONTRIBUTING.md](CONTRIBUTING.md#adding-an-agent)).

## Done

- Shelves: named lists of prompts you reuse, picked from the list and kept
  after use; save to one from `Ctrl+F`, rename (`r`) or delete (`D`) in the list
  ([#1](https://github.com/sourabhshegane/prompt-shelf/issues/1), 0.2.0)
- Skills tab: the skills the agent can use here, one `Enter` away (0.2.0)
- A start-up notice and a Claude Code status line say prompt-shelf is on (0.2.0)

- Multi-slot stash that survives sessions (`Ctrl+F`)
- List opens on the current git repo's entries, from any subfolder; `Tab` shows all
- Separate list key that keeps what you've typed (`Ctrl+Q`)
- Long pastes that Claude or Codex collapse are stashed with the real text
- Codex CLI support
