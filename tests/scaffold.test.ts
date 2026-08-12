import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("scaffold", () => {
  it("manifest is desktop-only and ids match", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
    expect(manifest.id).toBe("creative-buddy");
    expect(manifest.isDesktopOnly).toBe(true);
  });

  it("md-as-text loading works", async () => {
    const mod = await import("../assets/prompts/grill.md");
    expect(mod.default).toContain("Pull-write");
  });
});
