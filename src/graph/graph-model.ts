import { Vault, VaultView } from "./types";
import { buildValidationReport, ValidationReport, graphStats, GraphStats, loadGraphNotes } from "./validation";
import { findGraphs, hubPath } from "./discovery";
import { Note } from "./notes";

/**
 * The stateful deterministic core. Holds the vault snapshot, absorbs file
 * events, recomputes lazily, and notifies listeners on every mutation.
 * Debouncing is the caller's concern (the Obsidian adapter debounces; tests
 * do not).
 */
export class GraphModel {
  readonly rootName: string;
  private readonly files: Map<string, string>;
  private readonly listeners = new Set<() => void>();
  private cachedView: VaultView | null = null;
  private cachedValidation: ValidationReport | null = null;
  private cachedGraphs: string[] | null = null;

  constructor(rootName: string, initial?: ReadonlyMap<string, string>) {
    this.rootName = rootName;
    this.files = new Map(initial ?? []);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
    this.invalidate();
  }

  deleteFile(path: string): void {
    this.files.delete(path);
    this.invalidate();
  }

  renameFile(oldPath: string, newPath: string): void {
    const content = this.files.get(oldPath);
    this.files.delete(oldPath);
    if (content !== undefined) this.files.set(newPath, content);
    this.invalidate();
  }

  snapshotFiles(): Map<string, string> {
    return new Map(this.files);
  }

  private invalidate(): void {
    this.cachedView = null;
    this.cachedValidation = null;
    this.cachedGraphs = null;
    // Snapshot before notifying: a listener that subscribes another mid-notification
    // (JS Set iteration would otherwise visit it live) must not see it fire for this
    // same mutation — only for the next one.
    for (const listener of [...this.listeners]) listener();
  }

  private view(): VaultView {
    if (this.cachedView === null) {
      const vault: Vault = { rootName: this.rootName, files: this.files };
      this.cachedView = new VaultView(vault);
    }
    return this.cachedView;
  }

  graphs(): string[] {
    if (this.cachedGraphs === null) this.cachedGraphs = findGraphs(this.view());
    return this.cachedGraphs;
  }

  hubPathOf(graphDir: string): string {
    return hubPath(this.view(), graphDir);
  }

  validation(): ValidationReport {
    if (this.cachedValidation === null) this.cachedValidation = buildValidationReport(this.view());
    return this.cachedValidation;
  }

  stats(graphDir: string): GraphStats | null {
    return graphStats(this.view(), graphDir);
  }

  notes(graphDir: string): Note[] {
    return loadGraphNotes(this.view(), graphDir);
  }
}
