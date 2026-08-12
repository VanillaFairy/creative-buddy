# Gotchas

## Git hook noise on every commit
Every `git commit` prints `ERROR: Failed to parse repository information` twice. It comes from the user-global hooks path (`core.hooksPath`), not from this repo; commits land fine. Verify with `git log`, don't chase the error.

## esbuild import.meta patch is load-bearing
`esbuild.config.mjs` defines `import.meta.url` → `__IMPORT_META_URL__` plus a banner declaring it from `pathToFileURL(__filename)`. The bundled Agent SDK reads `import.meta.url` to locate its runtime; without the patch the CJS bundle throws `ERR_INVALID_ARG_VALUE` at require time. Do not remove.

## NODE_ENV define picks the React build
Obsidian leaves `process.env.NODE_ENV` unset, so React would run its development build at runtime. The esbuild `define` pins it (`"production"` for prod builds) — dropping it costs ~1MB of bundle and dev-mode React.

## tests/expected line endings
`tests/expected/*.json` are written by Python with `newline="\n"` and stored LF in git via attributes. If a regeneration shows a full-file diff, suspect line endings before suspecting the port.

## Obsidian's button styles outrank single-class selectors
Obsidian's app.css styles `button:not(.clickable-icon)`, which is specificity (0,1,1) — a lone `.my-button {}` reset is (0,1,0) and silently loses, so the element keeps Obsidian's background, radius, padding and shadow. The CSS reads correctly in the file and does nothing in the app. Scope any button reset to a parent (`.cb-activity > .cb-activity-head`) and cover `:hover`/`:active` too, since those carry the same qualifier. `c:/tmp/cb-panel-harness.html` reproduces the rule for testing CSS outside Obsidian.

## Seeing the CSS without launching Obsidian
```bash
cp styles.css c:/tmp/styles.css
cd c:/tmp && (python -m http.server 8899 --bind 127.0.0.1 >/dev/null 2>&1 &)
# then browse http://127.0.0.1:8899/cb-design-harness.html
```
Playwright refuses the `file:` protocol, so a harness opened straight off disk
never loads — it has to be served, which also means `styles.css` must be copied
into the served directory and re-copied after every edit (the harness links it
relatively). The harness must declare Obsidian's variables *and* re-state its
aggressive bare-element rules (`button:not(.clickable-icon)`, `select`,
`textarea`) or specificity bugs stay invisible until the plugin is installed.
`c:/tmp/cb-design-harness.html` covers the chat and map surfaces;
`cb-states-harness.html` covers the empty, picker and no-hub states. Screenshot
at ~330px pane width too — sidebar docking is where the layouts break first.

## Flexbox eats two layout rules that look like CSS bugs
`text-overflow: ellipsis` does nothing on a bare text node inside a
`display: flex` element: the text becomes an anonymous flex item, and the
property does not apply to it. The text clips mid-word instead. If an element
only ever holds text, leave it a block.

A flex item defaults to `min-width: auto`, which floors it at its content
width — so a sibling with a large `flex-shrink` never gets to yield and
whatever sits last in the row is clipped out of the container. Any flex item
that should be allowed to compress needs an explicit `min-width: 0`.

## A background leaf holds a DeferredView, not your view
Since Obsidian 1.7.2 a leaf sitting in the background — another sidebar tab in front of it, say — has a `DeferredView` as its `view`, not the registered `ItemView`. So `leaf.view instanceof ChatView` is **false** for a panel that is merely not on top, and any code shaped like `if (leaf.view instanceof ChatView) leaf.view.doThing()` silently does nothing. It looks like a dead command rather than a bug, because revealing the panel by hand then makes everything work.

`await workspace.revealLeaf(leaf)` is not enough on its own. Await `leaf.loadIfDeferred()` before touching `leaf.view` — it is a no-op on an already-loaded leaf, so one call at the end of a reveal-or-create helper covers every path. Related: `sharedGraphs` reads other panels' *serialized* state rather than their views for the same reason.

## Green vitest does not mean it compiles
Vitest transpiles TS with esbuild, which strips types without checking them, so a strict-mode violation runs green in the suite and only fails at `tsc --noEmit`. `tsconfig` has `noUncheckedIndexedAccess` on, so `arr[0]` is `T | undefined` — the usual source of a green-tests/red-build split. Run `npm run build` before calling any change done, not just `npx vitest run`.

## Windows worktree removal can hit file locks
`git worktree remove` may fail with "Device or resource busy" while a node/claude child process lingers. `git worktree prune` clears the registration; the directory becomes deletable once the process exits. Never kill node.exe indiscriminately to free it — other sessions run on node too.
