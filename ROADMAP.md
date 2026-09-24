# Roadmap

Rough order, not promises. Want one of these sooner, or have a different idea?
Open an issue.

## Next

- **Prompt library with groups.** The stash is for things you'll use once. A
  library would hold prompts you reuse, sorted into groups you name, like
  `Skills`, `Features` or `Common prompts`. Picking one from the library adds
  it to the box and keeps it there. The list gets two tabs: Stash and Library.
  You could also move a stash entry into a group once you know you'll need it
  again.
- **Choose what the list shows.** Today the list opens on the current git
  repo's entries and `Tab` shows everything. A setting (and more `Tab` stops)
  would let you pick the default:
  - **per session**: only what you stashed in this Claude/Codex session
  - **per repo**: the current git repo, as now
  - **per branch**: the current repo and git branch
  - **per agent**: only Claude's or only Codex's entries
  - **everything**: all entries on this machine
- **Linux testing.** It should work already; it just hasn't been checked on a
  real machine.

## Later

- **More agents.** Gemini CLI, Aider, OpenCode and others. Each one needs a
  small adapter that knows what its input box looks like (see
  [CONTRIBUTING.md](CONTRIBUTING.md#adding-an-agent)).
- **Windows.** The shims are written as `.cmd` files but nothing has been
  tested there.
- **Export and import.** Move your stash and library between machines, or
  share a library with a team.

## Done

- Multi-slot stash that survives sessions (`Ctrl+F`)
- List opens on the current git repo's entries, from any subfolder; `Tab` shows all
- Separate list key that keeps what you've typed (`Ctrl+Q`)
- Long pastes that Claude or Codex collapse are stashed with the real text
- Codex CLI support
