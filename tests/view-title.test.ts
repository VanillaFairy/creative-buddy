import { describe, it, expect } from "vitest";
import { projectName, tabTitle } from "../src/view-title";

describe("projectName", () => {
  it("is the folder name for a graph in a subfolder", () => {
    expect(projectName("Projects/Novel", "MyVault")).toBe("Novel");
  });

  it("falls back to the vault name for a graph at the vault root", () => {
    expect(projectName("", "MyVault")).toBe("MyVault");
  });

  it("is null when no graph is bound", () => {
    expect(projectName(null, "MyVault")).toBeNull();
  });
});

describe("tabTitle", () => {
  it("appends the project name", () => {
    expect(tabTitle("Creative Buddy map", "Projects/Novel", "MyVault")).toBe("Creative Buddy map: Novel");
  });

  it("is the bare prefix when no graph is bound", () => {
    expect(tabTitle("Creative buddy chat", null, "MyVault")).toBe("Creative buddy chat");
  });
});
