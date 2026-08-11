import { describe, it, expect } from "vitest";
import { KG_SCOUT } from "../src/agent/kg-scout";

describe("kg-scout definition", () => {
  it("is read-only, cheap, and carries the vaulted prompt", () => {
    expect(KG_SCOUT.tools).toEqual(["Read", "Grep", "Glob"]);
    expect(KG_SCOUT.model).toBe("haiku");
    expect(KG_SCOUT.description).toContain("Read-only reader");
    expect(KG_SCOUT.prompt).toContain("You read one knowledge-graph folder");
    expect(KG_SCOUT.prompt).not.toContain("---\nname:"); // frontmatter stripped
  });
});
