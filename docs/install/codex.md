# prompt-shelf with Codex CLI

## Setup

`npm i -g prompt-shelf` puts a shim at `~/.prompt-shelf/bin/codex` and adds that
folder to your PATH. Open a new terminal and run `codex` as usual.

If `stash doctor` says `on PATH: no`, add the line it prints to your shell rc
file and open a new terminal. If it says `codex: shim missing`, Codex CLI wasn't
on your PATH when prompt-shelf was installed; run `stash enable`.

`STASH_OFF=1 codex` runs the real codex without the wrapper.

## Keys Codex CLI keeps

prompt-shelf never takes these keys; they go straight to Codex CLI:

`Ctrl+T`, `Ctrl+C`, `Ctrl+D`, `Ctrl+J`, `Ctrl+R`, `Ctrl+G`

`stash hotkey` and `stash hotkey list` refuse them. If you hand-edit
`~/.prompt-shelf/config.json` to one of them, prompt-shelf won't start and
tells you to pick another key.

## Checklist

- [ ] `codex` starts normally and `stash doctor` shows the shim on PATH
- [ ] type text, `Ctrl+F` → box clears, `stashed (n)` appears
- [ ] empty box, `Ctrl+F` → `nothing to stash`
- [ ] same while Codex CLI is busy answering → still stashes
- [ ] multi-line draft → stashed with the line break (`stash list` shows `⏎`)
- [ ] paste 1500+ characters so Codex shows `[Pasted Content … chars]`, `Ctrl+F` → stashed with the full text
- [ ] type text, `Ctrl+Q` → list opens and your text stays; `Enter` adds the entry on a new line after it
- [ ] in the list: `j`/`k` move, `a` keeps the entry, `d` `y` deletes, `/` searches, `Tab` switches repo / all
- [ ] `Esc` closes the list and Codex CLI's screen comes back intact
- [ ] `stash hotkey f2` → in a new session `F2` stashes; `stash hotkey ctrl+f` puts it back
- [ ] Codex's own `Ctrl+T` and `Esc` still work through the wrapper
