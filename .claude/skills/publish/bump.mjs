// Bumps the plugin version everywhere it is recorded and prints the new version.
// Usage: node .claude/skills/publish/bump.mjs <major|minor|patch>
import { readFileSync, writeFileSync } from "node:fs";

const LEVELS = ["major", "minor", "patch"];
const level = process.argv[2];
if (!LEVELS.includes(level)) {
  console.error(`usage: bump.mjs <${LEVELS.join("|")}>`);
  process.exit(1);
}

function edit(path, change) {
  const text = readFileSync(path, "utf8");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const data = JSON.parse(text);
  change(data);
  writeFileSync(path, (JSON.stringify(data, null, 2) + "\n").replaceAll("\n", eol));
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const [major, minor, patch] = manifest.version.split(".").map(Number);
const next = {
  major: `${major + 1}.0.0`,
  minor: `${major}.${minor + 1}.0`,
  patch: `${major}.${minor}.${patch + 1}`,
}[level];

edit("manifest.json", (m) => { m.version = next; });
edit("package.json", (p) => { p.version = next; });
edit("package-lock.json", (l) => { l.version = next; l.packages[""].version = next; });
edit("versions.json", (v) => { v[next] = manifest.minAppVersion; });

console.log(next);
