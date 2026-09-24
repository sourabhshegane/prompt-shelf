# prompt-shelf with Claude Code

## Setup

`npm i -g prompt-shelf` puts a shim at `~/.prompt-shelf/bin/claude` and adds that
folder to your PATH. Open a new terminal and run `claude` as usual.

If `stash doctor` says `on PATH: no`, add the line it prints to your shell rc
file and open a new terminal. If it says `claude: shim missing`, Claude Code wasn't
on your PATH when prompt-shelf was installed; run `stash enable`.

`STASH_OFF=1 claude` runs the real claude without the wrapper.

## Keys Claude Code keeps

prompt-shelf never takes these keys; they go straight to Claude Code:

`Ctrl+S`, `Ctrl+G`, `Ctrl+T`, `Ctrl+O`, `Ctrl+R`, `Ctrl+L`, `Ctrl+J`, `Ctrl+V`, `Ctrl+X`, `Ctrl+B`, `Ctrl+E`, `Ctrl+C`, `Ctrl+D`

`stash hotkey` and `stash hotkey list` refuse them. If you hand-edit
`~/.prompt-shelf/config.json` to one of them, prompt-shelf won't start and
tells you to pick another key.

## Checklist

- [ ] `claude` starts normally and `stash doctor` shows the shim on PATH
- [ ] type text, `Ctrl+F` → box clears, `stashed (n)` appears
- [ ] empty box, `Ctrl+F` → `nothing to stash`
- [ ] same while Claude Code is busy answering → still stashes
- [ ] multi-line draft → stashed with the line break (`stash list` shows `⏎`)
- [ ] paste 5+ lines so Claude shows `[Pasted text #1 …]`, `Ctrl+F` → stashed with the full text
- [ ] type text, `Ctrl+Q` → list opens and your text stays; `Enter` adds the entry on a new line after it
- [ ] in the list: `j`/`k` move, `a` keeps the entry, `d` `y` deletes, `/` searches, `Tab` switches repo / all
- [ ] `Esc` closes the list and Claude Code's screen comes back intact
- [ ] `stash hotkey f2` → in a new session `F2` stashes; `stash hotkey ctrl+f` puts it back
- [ ] Claude's own `Ctrl+S`, `Ctrl+R`, `Shift+Tab` and `Esc` still work through the wrapper
