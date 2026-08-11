import fs from "node:fs";
import path from "node:path";
import type { Vault } from "../../src/graph/types";

export type { Vault };

export function loadFixtureVault(name: string): Vault {
  const root = path.join(__dirname, "..", "fixtures", name);
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.set(path.relative(root, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return { rootName: name, files };
}

export function loadExpected(name: string, kind: "graph-check" | "obligations"): unknown {
  const p = path.join(__dirname, "..", "expected", `${name}.${kind}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
