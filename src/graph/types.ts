import { casefold } from "./py-compat";

/** A vault snapshot: rootName is the vault folder's basename; keys are vault-relative posix paths. */
export interface Vault {
  rootName: string;
  files: Map<string, string>;
}

/** Path equality with the filesystem's own case rules (the oracle runs on NTFS). */
export function samePath(a: string, b: string): boolean {
  return casefold(a) === casefold(b);
}

export function baseName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

export function dirName(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/** Python Path.stem: strip the last suffix; a leading dot alone is not a suffix. */
export function stemOf(p: string): string {
  const b = baseName(p);
  const i = b.lastIndexOf(".");
  return i <= 0 ? b : b.slice(0, i);
}

/** Read-facade over a Vault with the case-insensitive lookups NTFS gives Python. */
export class VaultView {
  readonly rootName: string;
  private readonly byPath: Map<string, string>;
  private readonly byNorm: Map<string, string>;

  constructor(vault: Vault) {
    this.rootName = vault.rootName;
    this.byPath = vault.files;
    this.byNorm = new Map();
    for (const p of vault.files.keys()) this.byNorm.set(casefold(p), p);
  }

  get(path: string): string | undefined {
    const exact = this.byPath.get(path);
    if (exact !== undefined) return exact;
    const real = this.byNorm.get(casefold(path));
    return real === undefined ? undefined : this.byPath.get(real);
  }

  paths(): IterableIterator<string> {
    return this.byPath.keys();
  }
}
