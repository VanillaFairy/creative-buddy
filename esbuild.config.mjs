import esbuild from "esbuild";
import path from "node:path";
import process from "node:process";

const prod = process.argv[2] === "production";

// Every `events` import in the bundle goes through src/agent/node-events.ts, which
// lets the SDK hand setMaxListeners the DOM AbortSignal Obsidian's renderer has.
const nodeEventsShim = path.resolve("src/agent/node-events.ts");
const nodeEvents = {
  name: "node-events",
  setup(build) {
    build.onResolve({ filter: /^(node:)?events$/ }, (args) =>
      path.resolve(args.importer) === nodeEventsShim ? undefined : { path: nodeEventsShim });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2022",
  platform: "node",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  loader: { ".md": "text" },
  plugins: [nodeEvents],
  // The bundled Agent SDK reads `import.meta.url` to locate its own runtime; in a
  // CJS bundle that expression is invalid and require() throws ERR_INVALID_ARG_VALUE.
  define: {
    "import.meta.url": "__IMPORT_META_URL__",
    // Obsidian leaves NODE_ENV unset, which makes React pick its development
    // build at runtime; pin it so production bundles get production React.
    "process.env.NODE_ENV": prod ? '"production"' : '"development"',
  },
  banner: { js: "const __IMPORT_META_URL__ = require('url').pathToFileURL(__filename).href;" },
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
