#!/bin/sh
# Fills PROMPT_SHELF_DIR with older drafts and saved prompts for the demo, so the list looks lived in.
# Run from inside the demo folder: drafts belong to the repo they were stashed in.
set -e
stash=${STASH:-stash}
for draft in \
  "look into the memory spike on large files" \
  "write docs for the new upload API" \
  "move the retry constants into config" \
  "add a --dry-run flag to the sync script" \
  "check why the upload test is flaky on CI" \
  "rename fetchData to loadUploads everywhere"; do
  $stash add "$draft"
done
for prompt in \
  "check this diff for security issues" \
  "find dead code in this folder" \
  "summarize what changed on this branch" \
  "add tests for the function I just changed" \
  "explain this error and suggest the smallest fix" \
  "write a commit message for the staged changes" \
  "review my staged changes for bugs and missing tests"; do
  $stash add --shelf Common "$prompt" 2>/dev/null
done
