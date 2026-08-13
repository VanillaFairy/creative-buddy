# Gotchas

## Git hook noise on every commit
Every `git commit` prints `ERROR: Failed to parse repository information` twice. It comes from the user-global hooks path (`core.hooksPath`), not from this repo; commits land fine. Verify with `git log`, don't chase the error.

## esbuild import.meta patch is load-bearing
`esbuild.config.mjs` defines `import.meta.url` → `__IMPORT_META_URL__` plus a banner declaring it from `pathToFileURL(__filename)`. The bundled Agent SDK reads `import.meta.url` to locate its runtime; without the patch the CJS bundle throws `ERR_INVALID_ARG_VALUE` at require time. Do not remove.

## NODE_ENV define picks the React build
Obsidian leaves `process.env.NODE_ENV` unset, so React would run its development build at runtime. The esbuild `define` pins it (`"production"` for prod builds) — dropping it costs ~1MB of bundle and dev-mode React.

## src/mindmap/layout.ts is a binary file to git
It contains two literal NUL bytes — a separator inside the cross-link dedup key,
written as a raw `\x00` character in the template literal rather than an escape:
```
const key = note.path < resolved.path ? `${note.path}\x00${resolved.path}` : …
```
One NUL anywhere makes git classify the whole file as binary, so every commit
touching it shows `Bin 4656 -> 5913 bytes` with no line diff, `git log -p` tells
you nothing, and a review of that file's history is impossible. The code is
correct and the runtime key is fine; it is the file's reviewability that is
lost. Writing the separator as `\u0000` would produce the identical string and
make the file text again. Until then, read `layout.ts` at the two revisions
rather than expecting a diff.

## tests/expected line endings
`tests/expected/*.json` are written by Python with `newline="\n"` and stored LF in git via attributes. If a regeneration shows a full-file diff, suspect line endings before suspecting the port.

## Obsidian's button styles outrank single-class selectors
Obsidian's app.css styles `button:not(.clickable-icon)`, which is specificity (0,1,1) — a lone `.my-button {}` reset is (0,1,0) and silently loses, so the element keeps Obsidian's background, radius, padding and shadow. The CSS reads correctly in the file and does nothing in the app. Scope any button reset to a parent (`.cb-activity > .cb-activity-head`) and cover `:hover`/`:active` too, since those carry the same qualifier. `c:/tmp/cb-panel-harness.html` reproduces the rule for testing CSS outside Obsidian.

## Seeing the CSS without launching Obsidian
Two separate things refuse `file:`, so a harness opened straight off disk never
shows the real CSS: Playwright blocks the protocol outright, and the in-app
preview pane renders the page as a `data:` snapshot whose `<link
rel="stylesheet" href="file://…">` silently never arrives — the page loads
*unstyled* rather than erroring, which reads as "my CSS is broken".

Inlining the stylesheet beats copying it, because a copy goes stale the moment
you edit and the harness gives no sign that it has:
```bash
node -e "const f=require('fs'),c=f.readFileSync('styles.css','utf8');
  f.writeFileSync('c:/tmp/cb-standalone.html',
    f.readFileSync('c:/tmp/cb-chat-harness.html','utf8')
     .replace(/<link rel=\"stylesheet\"[^>]*>/, '<style>'+c+'</style>'))"
python -m http.server 8732 --bind 127.0.0.1 -d /c/tmp   # -d beats cd'ing
```
Then drive it with the Playwright MCP over `http://127.0.0.1:8732/…`. Note
Playwright writes its screenshots and a `.playwright-mcp/` directory into the
**project root**, not the served directory — clear them before committing.

The harness must declare Obsidian's variables *and* re-state its aggressive
bare-element rules (`button:not(.clickable-icon)`, `select`, `textarea`) or
specificity bugs stay invisible until the plugin is installed. Variables the
chat needs beyond the obvious: `--color-accent-hsl` (three bare components, not
a colour), the `--radius-*` and `--size-*` scales, and `--font-text` vs
`--font-interface` set to visibly different families, or the two voices look
identical when they are not.

`c:/tmp/cb-design-harness.html` covers the chat and map surfaces;
`cb-states-harness.html` covers the empty, picker and no-hub states;
`cb-composer-harness.html` covers the composer, the send/stop swap and the
queued-message bubble in both themes; `cb-chat-harness.html` covers the
transcript across all four surfaces it can land on — sidebar vs main tab ×
dark vs light. Screenshot at ~330px pane width too — sidebar docking is where
the layouts break first.

## The chat panel sits on two different backgrounds
`main.ts` opens both surfaces in the **right sidebar**, which Obsidian paints in
`--background-secondary` — but the `openInMainTab` setting, and any drag,
put the same panel on `--background-primary`. So any opaque fill picked to
stand out against one of them disappears against the other, and the default
position is the sidebar, which is the easy one to forget to check. Tint with a
translucent value instead (`--background-modifier-hover`, or
`hsla(var(--color-accent-hsl), <alpha>)` for something accent-coloured): a wash
reads against whatever is underneath it. `.cb-msg-user`'s bubble is the live
example.

Note that a `var()` naming a **missing** custom property fails at computed-value
time and resolves to `unset`, which does *not* fall back to an earlier
declaration of the same property — the two-declaration fallback trick only
rescues parse-time errors. Put the fallback inside the `var()` or don't bother.

## `--text-faint` is not one step quieter than a border colour
In a dark theme `--text-faint` (~#6e6e6e) is **lighter** than
`--background-modifier-border` (~#3f3f3f) — they are tints for different jobs,
not two stops on one scale. So fading an element by painting its border with
the text token makes the dead thing louder than the live one next to it, which
is exactly backwards and easy to miss when reading the CSS. Fade text with the
text tokens (`--text-muted` → `--text-faint`) and borders with the border
tokens, and look at both themes: their relative order flips in light.

`--text-faint` on a light background is about 2.9:1, under the WCAG AA floor.
That is fine for incidental metadata (a turn's cost, a caption) and wrong for
anything the user is meant to read or copy.

## Isolating a React view without launching Obsidian
`src/chat/components.tsx` imports nothing from `obsidian`, so `ChatSurface` can
be bundled standalone and driven by Playwright — which is the only way to tell a
CSS problem from a React one:
```bash
npx esbuild probe.tsx --bundle --outfile=c:/tmp/cb-probe.js \
  --alias:obsidian=./stub.js --alias:node:child_process=./cp-stub.js \
  --define:process.env.NODE_ENV='"development"' --format=iife --platform=browser
```
Both stubs are needed because `components.tsx` reaches `settings.ts` for
`MODEL_CHOICES`, and that file imports `obsidian` and `node:child_process`.
`--external:` is the wrong tool — it leaves a runtime `require` that throws in
the browser; alias to a stub instead. Have the probe's wrapper re-render with
fresh props on a timer, the way `ChatView.render()` does, or the test proves
nothing about the case that actually matters. Obsidian's own bare-element rules
have to be copied into the probe page (see the harness note above).

## Mixing border-box measurements with content-box limits
`getBoundingClientRect().height` is *always* the border box, while
`getComputedStyle(el).minHeight` / `maxHeight` / `height` are whichever box
`box-sizing` names. Measure with one and clamp against the other and every step
of a repeated resize drifts by the padding — a keyboard resize with a 24px step
moved the box by 21px, then 20px, then 19px. Read the current size with
`getComputedStyle(el).height` so all three values are in one coordinate system.
It only shows up under `box-sizing: content-box`, so a probe page that omits
Obsidian's `border-box` reset is the harsher and more useful test.

## A shrinkable flex row silently undoes `resize`
`resize: vertical` sets an inline `height` when the user drags. If that
element's row is a flex item at the default `flex: 0 1 auto`, the parent's next
layout pass is free to shrink it again — so the handle moves and the box springs
straight back, but only once the column is tight enough to need the space. It
reads as "resize is broken" while the CSS looks correct, and it works fine in a
roomy pane. The row that should hold its size needs `flex: none`, and some
sibling has to be able to yield instead (a scroll container can: `overflow-y:
auto` makes its `min-height: auto` resolve to 0).

The trade is that a `flex: none` row cannot be squeezed, so its own cap has to
stay under the pane height or its contents get pushed out of view. Percentages
will not do it — a `max-height: %` resolves against the parent's height, and the
parent here is auto-height, so it computes to `none`. `vh` is the practical
answer and is what Obsidian uses in its own textareas.

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

## MarkdownRenderer.render leaves its links dead
Obsidian wires link clicks **per container**, not globally: `MarkdownPreviewRenderer.registerDomEvents(el, handler)` is called in exactly three places in `app.js` — the reading view's preview sizer, a markdown embed, and the CodeMirror `contentDOM`. The static `MarkdownRenderer.render(...)` parses, appends, post-processes and loads embeds, and registers nothing. So `a.internal-link` in a plugin's own view is an anchor with no `target` and no handler: clicking it does nothing at all, with no console error to explain it. (`belongsToMe` also stops the walk at any `.markdown-preview-view`, so nesting under one would not help.) A view rendering markdown has to delegate its own clicks — `ChatView.openLink` + `src/chat/links.ts`. External links are fine unhandled: the renderer gives those `target="_blank"`, so Electron opens them in the browser.

Note that `WorkspaceLeaf.openLinkText` **creates the file** when the linktext resolves to nothing. In a transcript that means a click on a name the interviewer got wrong would add a note to the vault, so resolve with `metadataCache.getFirstLinkpathDest` first and refuse.

## Reading what Obsidian actually does
```bash
node -e 'const f=require("fs"),
  a=f.readFileSync(process.env.LOCALAPPDATA+"/Programs/Obsidian/resources/obsidian.asar"),
  e=JSON.parse(a.subarray(16,16+a.readUInt32LE(12)).toString()).files["app.js"],
  s=8+a.readUInt32LE(4)+Number(e.offset);
  f.writeFileSync("c:/tmp/obsidian-app.js",a.subarray(s,s+e.size))'
```
`obsidian.d.ts` is types only — it cannot answer "does Obsidian handle this for me?". The asar is a plain header-plus-blobs format, so app.js falls out in a few lines and settles those questions in minutes. It is minified onto a handful of enormous lines, so `grep` is useless: search it with `indexOf` in a loop and print a character window around each hit. Faster and far more reliable than reasoning from memory about core behaviour.

## Green vitest does not mean it compiles
Vitest transpiles TS with esbuild, which strips types without checking them, so a strict-mode violation runs green in the suite and only fails at `tsc --noEmit`. `tsconfig` has `noUncheckedIndexedAccess` on, so `arr[0]` is `T | undefined` — the usual source of a green-tests/red-build split. Run `npm run build` before calling any change done, not just `npx vitest run`.

## Windows worktree removal can hit file locks
`git worktree remove` may fail with "Device or resource busy" while a node/claude child process lingers. `git worktree prune` clears the registration; the directory becomes deletable once the process exits. Never kill node.exe indiscriminately to free it — other sessions run on node too.
