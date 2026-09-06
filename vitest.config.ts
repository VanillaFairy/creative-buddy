import { defineConfig, defaultExclude } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

export default defineConfig({
  plugins: [
    {
      name: "md-as-text",
      enforce: "pre",
      load(id) {
        if (id.endsWith(".md")) {
          return `export default ${JSON.stringify(fs.readFileSync(id, "utf8"))};`;
        }
      },
    },
  ],
  // The chat components reach through settings.ts for the model list, which
  // imports Obsidian's runtime. Nothing under test touches it — see the stub.
  resolve: { alias: { obsidian: path.resolve("tests/helpers/obsidian-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // tests/live/** spends real subscription usage — it only runs via vitest.live.config.ts.
    exclude: [...defaultExclude, "tests/live/**"],
  },
});
