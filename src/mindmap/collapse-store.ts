export class CollapseStore {
  private readonly byGraph = new Map<string, Set<string>>();

  isCollapsed(graphDir: string, path: string): boolean {
    return this.byGraph.get(graphDir)?.has(path) ?? false;
  }

  toggle(graphDir: string, path: string): void {
    let set = this.byGraph.get(graphDir);
    if (set === undefined) {
      set = new Set();
      this.byGraph.set(graphDir, set);
    }
    if (set.has(path)) set.delete(path);
    else set.add(path);
  }

  collapsedSet(graphDir: string): Set<string> {
    return new Set(this.byGraph.get(graphDir) ?? []);
  }

  toJSON(): Record<string, string[]> {
    return Object.fromEntries([...this.byGraph.entries()].map(([g, set]) => [g, [...set]]));
  }

  static fromJSON(json: Record<string, string[]> | undefined): CollapseStore {
    const store = new CollapseStore();
    for (const [graph, paths] of Object.entries(json ?? {})) store.byGraph.set(graph, new Set(paths));
    return store;
  }
}
