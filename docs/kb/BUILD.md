# Build

## Typecheck and build
```
npx tsc --noEmit
npm run build
```
First is a fast typecheck, no output files. Second repeats the typecheck and produces the esbuild production bundle (`main.js`).

## Regenerate oracle fixtures
```
npm run oracle
```
Runs `python oracle/gen_expected.py`, regenerating `tests/expected/*.json`. Run after any fixture change and commit the JSON. `git diff --exit-code tests/expected` proves the committed expectations still match.

## Deploy into a vault
```
npm run build && deploy.bat
deploy.bat "D:\Some other vault\.obsidian\plugins\creative-buddy"
```
Copies `main.js`, `manifest.json`, `styles.css` into the vault plugin folder,
overwriting, and prints each file's timestamp — those are *build* times, since
`copy` preserves them, so a stale bundle is visible in the output. Never copies
`data.json`; that is the plugin's own settings and lives in the vault. Refuses
to copy anything if the build output is missing. Default target is set at the
top of the script and can be overridden by the first argument or
`CB_PLUGIN_DIR`. Obsidian does not hot-reload — toggle the plugin off and on
after deploying.
