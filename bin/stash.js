#!/usr/bin/env node
import('../dist/cli.js')
  .then(({ main }) => main(process.argv.slice(2)))
  .then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`prompt-shelf: ${String(err?.message ?? err)}\n`);
      process.exit(1);
    },
  );
