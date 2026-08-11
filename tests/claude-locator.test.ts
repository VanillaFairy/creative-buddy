import { describe, it, expect } from "vitest";
import { candidateClaudePaths, findClaudeExecutable } from "../src/claude-locator";

describe("claude-locator", () => {
  it("probes PATH entries and known install dirs for claude executables", () => {
    const candidates = candidateClaudePaths({
      platform: "win32",
      env: { PATH: "C:\\tools;C:\\other", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
    });
    expect(candidates).toContain("C:/tools/claude.exe");
    expect(candidates.some((c) => c.toLowerCase().includes("appdata/local"))).toBe(true);
  });

  it("returns the first existing candidate", () => {
    const exists = (p: string) => p === "C:/other/claude.exe";
    const found = findClaudeExecutable(
      { platform: "win32", env: { PATH: "C:\\tools;C:\\other" } },
      exists,
    );
    expect(found).toBe("C:/other/claude.exe");
  });

  it("returns null when nothing exists", () => {
    expect(findClaudeExecutable({ platform: "win32", env: {} }, () => false)).toBeNull();
  });
});
