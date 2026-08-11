import { describe, it, expect } from "vitest";
import { badTitleChars, normalizeFsPath, vaultRelative, isInsidePath, decideToolUse } from "../src/agent/permissions";

const CTX = {
  vaultRoot: "C:/vaults/General",
  graphDir: "Noir game", // vault-relative; "" would mean the whole vault is the graph
};

describe("badTitleChars", () => {
  it("finds every forbidden character", () => {
    expect(badTitleChars('a:b/c\\d|e?f*g"h<i>j')).toEqual([":", "/", "\\", "|", "?", "*", '"', "<", ">"]);
    expect(badTitleChars("Heavy Rain")).toEqual([]);
  });
});

describe("path helpers", () => {
  it("normalizes backslashes and resolves relative segments", () => {
    expect(normalizeFsPath("C:\\vaults\\General\\Noir game\\..\\Noir game\\x.md")).toBe("C:/vaults/General/Noir game/x.md");
  });
  it("vaultRelative is case-insensitive about the root and null outside it", () => {
    expect(vaultRelative(CTX.vaultRoot, "c:\\Vaults\\general\\Noir game\\x.md")).toBe("Noir game/x.md");
    expect(vaultRelative(CTX.vaultRoot, "C:/elsewhere/x.md")).toBeNull();
  });
  it("vaultRelative tolerates a trailing slash on the root", () => {
    expect(vaultRelative("C:/vaults/General/", "C:/vaults/General/Noir game/x.md")).toBe("Noir game/x.md");
  });
  it("isInsidePath treats '' as everything and matches whole segments", () => {
    expect(isInsidePath("Noir game/References/x.md", "Noir game")).toBe(true);
    expect(isInsidePath("Noir game II/x.md", "Noir game")).toBe(false);
    expect(isInsidePath("anything/x.md", "")).toBe(true);
  });
});

describe("decideToolUse", () => {
  it("allows reads anywhere in the vault", () => {
    for (const tool of ["Read", "Glob", "Grep"]) {
      const d = decideToolUse(tool, { file_path: "C:/vaults/General/Здоровье/note.md", path: "C:/vaults/General" }, CTX);
      expect(d.behavior).toBe("allow");
    }
  });

  it("asks for reads outside the vault", () => {
    const d = decideToolUse("Read", { file_path: "C:/elsewhere/secrets.md" }, CTX);
    expect(d.behavior).toBe("ask");
  });

  it("allows in-graph writes with sane filenames", () => {
    const d = decideToolUse("Write", { file_path: "C:/vaults/General/Noir game/References/New Note.md", content: "x" }, CTX);
    expect(d.behavior).toBe("allow");
  });

  it("denies in-graph writes whose title carries filesystem-hostile characters, with a corrective message", () => {
    const d = decideToolUse("Write", { file_path: 'C:/vaults/General/Noir game/Who: me?.md', content: "x" }, CTX);
    expect(d.behavior).toBe("deny");
    if (d.behavior === "deny") {
      expect(d.message).toContain('":"');
      expect(d.message).toContain('"?"');
      expect(d.message).toContain("aliases");
    }
  });

  it("checks every new directory segment, not just the basename", () => {
    const d = decideToolUse("Write", { file_path: "C:/vaults/General/Noir game/Act: One/x.md", content: "x" }, CTX);
    expect(d.behavior).toBe("deny");
  });

  it("asks for writes inside the vault but outside the bound graph", () => {
    const d = decideToolUse("Edit", { file_path: "C:/vaults/General/Здоровье/note.md", old_string: "a", new_string: "b" }, CTX);
    expect(d.behavior).toBe("ask");
  });

  it("asks for writes outside the vault entirely", () => {
    const d = decideToolUse("Write", { file_path: "C:/elsewhere/x.md", content: "x" }, CTX);
    expect(d.behavior).toBe("ask");
  });

  it("allows editing the graph hub itself (the folder's own <FolderName>.md, per spec)", () => {
    const d = decideToolUse(
      "Edit",
      { file_path: "C:/vaults/General/Noir game/Noir game.md", old_string: "a", new_string: "b" },
      CTX
    );
    expect(d.behavior).toBe("allow");
  });

  it("asks when a write's target is the vault root itself, with no bound graph reached", () => {
    const d = decideToolUse("Write", { file_path: "C:/vaults/General", content: "x" }, CTX);
    expect(d.behavior).toBe("ask");
  });

  it("denies tools that are not part of the contract", () => {
    for (const tool of ["Bash", "WebFetch", "WebSearch", "NotebookEdit"]) {
      expect(decideToolUse(tool, {}, CTX).behavior).toBe("deny");
    }
  });

  it("allows the subagent dispatch tool (kg-scout rides on it)", () => {
    expect(decideToolUse("Task", { description: "scout", prompt: "q", subagent_type: "kg-scout" }, CTX).behavior).toBe("allow");
  });

  it("Glob/Grep with no path default to the working directory (the vault) and are allowed", () => {
    expect(decideToolUse("Grep", { pattern: "parent:" }, CTX).behavior).toBe("allow");
    expect(decideToolUse("Glob", { pattern: "**/*.md" }, CTX).behavior).toBe("allow");
  });
});
