import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { hierarchy } from "d3-hierarchy";
import { flextree } from "d3-flextree";
import { select } from "d3-selection";
import { zoom, zoomIdentity, ZoomTransform } from "d3-zoom";
import type CreativeBuddyPlugin from "../main";
import { buildMindmapData, MindmapNode, MindmapData } from "./layout";
import { CollapseStore } from "./collapse-store";
import { renderDigestForGraph } from "../agent/digest";

export const MINDMAP_VIEW_TYPE = "creative-buddy-mindmap";
const NODE_HEIGHT = 28;
const CHAR_WIDTH = 7.2;
const H_GAP = 48;

export class MindmapView extends ItemView {
  private graphDir: string | null = null;
  private collapse = new CollapseStore();
  private offChange: (() => void) | null = null;
  private redrawTimer: number | null = null;
  private lastTransform: ZoomTransform | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CreativeBuddyPlugin) {
    super(leaf);
  }

  getViewType(): string { return MINDMAP_VIEW_TYPE; }
  getDisplayText(): string { return "Graph mindmap"; }
  getIcon(): string { return "git-fork"; }

  getState(): Record<string, unknown> {
    return { graphDir: this.graphDir, collapse: this.collapse.toJSON() };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as { graphDir?: string | null; collapse?: Record<string, string[]> };
    this.graphDir = s.graphDir ?? null;
    this.collapse = CollapseStore.fromJSON(s.collapse);
    this.redraw();
    await super.setState(state as never, result as never);
  }

  async onOpen(): Promise<void> {
    // Via onModelReady so a view opened before indexing finishes still wakes
    // up — subscribing directly to a null model would sleep forever. The
    // disposer is registered so closing the tab mid-indexing cancels it.
    this.register(
      this.plugin.onModelReady(() => {
        this.offChange = this.plugin.model?.onChange(() => this.scheduleRedraw()) ?? null;
        this.redraw();
      }),
    );
    this.redraw();
  }

  async onClose(): Promise<void> {
    this.offChange?.();
    if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
  }

  private scheduleRedraw(): void {
    if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => this.redraw(), 300);
  }

  private today(): { y: number; m: number; d: number } {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }

  private redraw(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("cb-mindmap");
    const model = this.plugin.model;
    if (model === null) {
      container.createEl("p", { text: "Creative Buddy is still indexing the vault…" });
      return;
    }

    const graphs = model.graphs();
    const header = container.createDiv({ cls: "cb-mm-header" });
    const selector = header.createEl("select");
    for (const dir of graphs) {
      const option = selector.createEl("option", { text: dir === "" ? "(vault root)" : dir });
      option.value = dir;
    }
    if (this.graphDir === null && graphs.length > 0) this.graphDir = graphs[0]!;
    // A persisted graphDir can outlive its folder (rename); fall back rather
    // than render a blank selector over an empty map.
    if (this.graphDir !== null && !graphs.includes(this.graphDir)) this.graphDir = graphs[0] ?? null;
    if (this.graphDir !== null) selector.value = this.graphDir;
    selector.onchange = () => {
      this.graphDir = selector.value;
      this.lastTransform = null;
      this.app.workspace.requestSaveLayout();
      this.redraw();
    };

    if (this.graphDir === null) {
      container.createEl("p", { text: "No graphs found in this vault." });
      return;
    }

    const data = buildMindmapData(model, this.graphDir, this.today(), this.collapse.collapsedSet(this.graphDir));
    const stats = data.stats;
    const hubWarn = stats !== null && stats.hubChildren >= 10 ? " cb-mm-flat" : "";
    header.createSpan({
      cls: `cb-mm-stats${hubWarn}`,
      text: stats === null ? "no hub found" : `${stats.nodes} nodes · ${stats.hubChildren} off the hub`,
    });

    this.drawTree(container, data);
    this.drawTray(container, data);
    this.drawObligationsPanel(container);
  }

  private drawTree(container: HTMLElement, data: MindmapData): void {
    if (data.root === null) return;
    const host = container.createDiv({ cls: "cb-mm-svg-host" });
    const svg = select(host).append("svg").attr("class", "cb-mm-svg");
    const canvas = svg.append("g");

    const layout = flextree<MindmapNode>().nodeSize((n) => [NODE_HEIGHT + 8, n.data.stem.length * CHAR_WIDTH + 24 + H_GAP]).spacing(6);
    const root = layout(hierarchy(data.root, (d) => d.children));

    const byPath = new Map<string, { x: number; y: number; data: MindmapNode }>();
    root.each((n) => byPath.set(n.data.path, { x: n.x, y: n.y, data: n.data }));

    // parent edges
    root.links().forEach((link) => {
      canvas
        .append("path")
        .attr("class", "cb-mm-edge")
        .attr("d", `M${link.source.y},${link.source.x} C${(link.source.y + link.target.y) / 2},${link.source.x} ${(link.source.y + link.target.y) / 2},${link.target.x} ${link.target.y},${link.target.x}`);
    });

    // cross-links (faint)
    for (const cross of data.crossLinks) {
      const from = byPath.get(cross.from);
      const to = byPath.get(cross.to);
      if (from === undefined || to === undefined) continue;
      canvas
        .append("path")
        .attr("class", "cb-mm-crosslink")
        .attr("d", `M${from.y},${from.x} Q${(from.y + to.y) / 2},${(from.x + to.x) / 2 - 40} ${to.y},${to.x}`);
    }

    // nodes
    root.each((n) => {
      const g = canvas.append("g").attr("class", "cb-mm-node").attr("transform", `translate(${n.y},${n.x})`);
      const width = n.data.stem.length * CHAR_WIDTH + 24;
      const rect = g
        .append("rect")
        .attr("x", 0)
        .attr("y", -NODE_HEIGHT / 2)
        .attr("width", width)
        .attr("height", NODE_HEIGHT)
        .attr("rx", 6)
        .attr("class", n.data.problemKinds.length > 0 ? "cb-mm-box cb-mm-problem" : "cb-mm-box");
      g.append("text").attr("x", 12).attr("y", 5).text(n.data.stem + (n.data.collapsedChildren > 0 ? ` (+${n.data.collapsedChildren})` : ""));
      if (n.data.obligationCount > 0) g.append("circle").attr("class", "cb-mm-dot").attr("cx", width - 6).attr("cy", -NODE_HEIGHT / 2 + 6).attr("r", 4);
      g.append("title").text(
        [
          n.data.stem,
          n.data.kind !== null ? `kind: ${n.data.kind}` : null,
          n.data.status !== null ? `status: ${n.data.status}` : null,
          n.data.obligationCount > 0 ? `${n.data.obligationCount} open` : null,
          ...n.data.problemKinds.map((k) => `⚠ ${k}`),
          n.data.children.length > 0 || n.data.collapsedChildren > 0 ? "alt-click to open" : null,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      );
      rect.on("click", (event: MouseEvent) => {
        if (event.altKey || n.data.children.length > 0 || n.data.collapsedChildren > 0) {
          if (event.altKey) return this.openNote(n.data.path);
          this.collapse.toggle(this.graphDir!, n.data.path);
          this.app.workspace.requestSaveLayout();
          this.redraw();
          return;
        }
        this.openNote(n.data.path);
      });
    });

    const zoomBehavior = zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 2.5]).on("zoom", (event) => {
      this.lastTransform = event.transform as ZoomTransform;
      canvas.attr("transform", String(event.transform));
    });
    // Reuse the last pan/zoom so live-update redraws don't snap back to origin;
    // on first draw the host may not be laid out yet, so guard clientHeight 0.
    const centerY = host.clientHeight > 0 ? host.clientHeight / 2 : 240;
    svg.call(zoomBehavior).call(zoomBehavior.transform, this.lastTransform ?? zoomIdentity.translate(40, centerY));
  }

  private drawTray(container: HTMLElement, data: MindmapData): void {
    if (data.unreachable.length === 0) return;
    const tray = container.createDiv({ cls: "cb-mm-tray" });
    tray.createEl("h4", { text: "Not reachable from the hub" });
    for (const item of data.unreachable) {
      const row = tray.createDiv({ cls: "cb-mm-tray-row" });
      const link = row.createEl("a", { text: item.stem });
      link.onclick = () => this.openNote(item.path);
      row.createSpan({ text: item.parent !== null ? ` — parent '${item.parent}'` : " — no parent" });
    }
  }

  private drawObligationsPanel(container: HTMLElement): void {
    const model = this.plugin.model;
    if (model === null) return;
    const lines = renderDigestForGraph(model.obligations(this.today()), ""); // "" = every graph
    const panel = container.createDiv({ cls: "cb-mm-obligations" });
    panel.createEl("h4", { text: "Obligations (all graphs)" });
    panel.createEl("pre", { text: lines.length > 0 ? lines.join("\n") : "Nothing is due or owed today." });
  }

  private openNote(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf("split").openFile(file);
  }
}
