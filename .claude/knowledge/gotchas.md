# Gotchas

## Git hook noise on every commit
Every `git commit` prints `ERROR: Failed to parse repository information` twice. It comes from the user-global hooks path (`core.hooksPath`), not from this repo; commits land fine. Verify with `git log`, don't chase the error.

## esbuild import.meta patch is load-bearing
`esbuild.config.mjs` defines `import.meta.url` → `__IMPORT_META_URL__` plus a banner declaring it from `pathToFileURL(__filename)`. The bundled Agent SDK reads `import.meta.url` to locate its runtime; without the patch the CJS bundle throws `ERR_INVALID_ARG_VALUE` at require time. Do not remove.

## NODE_ENV define picks the React build
Obsidian leaves `process.env.NODE_ENV` unset, so React would run its development build at runtime. The esbuild `define` pins it (`"production"` for prod builds) — dropping it costs ~1MB of bundle and dev-mode React.

## tests/expected line endings
`tests/expected/*.json` are written by Python with `newline="\n"` and stored LF in git via attributes. If a regeneration shows a full-file diff, suspect line endings before suspecting the port.

## Green vitest does not mean it compiles
Vitest transpiles TS with esbuild, which strips types without checking them, so a strict-mode violation runs green in the suite and only fails at `tsc --noEmit`. `tsconfig` has `noUncheckedIndexedAccess` on, so `arr[0]` is `T | undefined` — the usual source of a green-tests/red-build split. Run `npm run build` before calling any change done, not just `npx vitest run`.

## Windows worktree removal can hit file locks
`git worktree remove` may fail with "Device or resource busy" while a node/claude child process lingers. `git worktree prune` clears the registration; the directory becomes deletable once the process exits. Never kill node.exe indiscriminately to free it — other sessions run on node too.
