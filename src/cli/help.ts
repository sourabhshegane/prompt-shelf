import { adapterNames } from '../adapters/index.js';
import { DEFAULT_CONFIG } from '../storage/config.js';

export const helpText = (version: string): string => `prompt-shelf ${version}

Usage:
  stash <agent> [agent args...]   run an agent with stash support (${adapterNames.join(', ')})
  stash --record <agent>          run, but the hotkey dumps the screen to ~/.prompt-shelf/ (for adapter tuning)
  stash list [--all]              print entries stashed in this repo (--all: every repo)
  stash add <text>                stash text from the command line
  stash pop [n] [--all]           print entry n of that listing (1 = newest) and remove it
  stash rm <n> [--all]            remove entry n of that listing

Shelves (named lists of prompts you reuse; using one keeps it):
  stash shelves                   list your shelves (starred first)
  stash shelf new <name>          create a shelf
  stash shelf star <name>         star or unstar a shelf; starred shelves come first
  stash shelf rename <old> <new>  rename a shelf
  stash shelf rm <name> [--force] delete a shelf (--force also deletes its prompts)
  stash add --shelf <name> <text> save a prompt on a shelf (created if needed)
  stash list --shelf <name>       print the prompts on a shelf
  stash rm <n> --shelf <name>     remove prompt n from a shelf

Setup:
  stash enable                    install shims so plain ${adapterNames.join(' / ')} run through stash
  stash disable                   remove the shims and the PATH line
  stash doctor                    show versions, paths, shims and real agent binaries
  stash statusline                print a status-line line (drafts parked here, or the keys); see README
  stash hotkey [key]              show both hotkeys, or set the stash hotkey (ctrl+<letter> or f1..f12), e.g. stash hotkey f2
  stash hotkey list [key]         show or set the list hotkey

Env:
  STASH_OFF=1 <agent>             run the real binary directly (no wrapper)
  STASH_RECORD=1 <agent>          same as stash --record <agent>
  PROMPT_SHELF_DIR=<dir>          keep prompts, shelves and settings in <dir>
  PROMPT_SHELF_DEBUG=1            write a debug log to ~/.prompt-shelf/debug.log (or =<file>)

Hotkeys:
  ${DEFAULT_CONFIG.hotkey}  save what is in the box: enter keeps it in the stash, ←→ picks a shelf
  ${DEFAULT_CONFIG.listHotkey}  open the list (stash, skills, shelves); what you pick goes after what you typed
Config: ~/.prompt-shelf/config.json  ${JSON.stringify(DEFAULT_CONFIG).replace(/,/g, ', ').replace(/:/g, ': ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}
`;
