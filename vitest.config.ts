import { defineConfig, defaultExclude } from "vitest/config";
import fs from "node:fs";

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
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // tests/live/** spends real subscription usage — it only runs via vitest.live.config.ts.
    exclude: [...defaultExclude, "tests/live/**"],
  },
});
