#!/usr/bin/env node
// main() prints expected errors itself and returns an exit code; anything that reaches here is a bug.
import('../dist/cli.js')
  .then(({ main }) => main(process.argv.slice(2)))
  .then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(
        `prompt-shelf: ${String(err?.message ?? err)}\n` +
          'This looks like a bug. Rerun with PROMPT_SHELF_DEBUG=1 and report it with ~/.prompt-shelf/debug.log:\n' +
          'https://github.com/sourabhshegane/prompt-shelf/issues\n',
      );
      process.exit(1);
    },
  );
