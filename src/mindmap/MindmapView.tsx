import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { hierarchy } from "d3-hierarchy";
import { flextree } from "d3-flextree";
import { select } from "d3-selection";
import { zoom, zoomIdentity, ZoomTransform } from "d3-zoom";
import type CreativeBuddyPlugin from "../main";
import { buildMindmapData, MindmapNode, MindmapData } from "./layout";
import { Box, Measure, childRegionPath, edgeWeight, fitTransform, inspectorLine, nodeBox } from "./geometry";
import { heatClass } from "./heat";
import { CollapseStore } from "./collapse-store";
import { tabTitle } from "../view-title";
import type { GraphModel } from "../graph/graph-model";
import { PICKER_EMPTY, noteCount, projectRowLabel, projectRows } from "../project-list";

export const MINDMAP_VIEW_TYPE = "creative-buddy-mindmap";
const H_GAP = 48;
const ROW_GAP = 8;
const INSPECTOR_HINT = "Click a note to open it, a branch to fold it. Alt-click always opens.";

export class MindmapView extends ItemView {
  private graphDir: string | null = null;
  private heatmap = false;
  private collapse = new CollapseStore();
  private offChange: (() => void) | null = null;
  private redrawTimer: number | null = null;
  private lastTransform: ZoomTransform | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CreativeBuddyPlugin) {
    super(leaf);
  }

  getViewType(): string { return MINDMAP_VIEW_TYPE; }
  getDisplayText(): string { return tabTitle("Creative Buddy map", this.graphDir, this.app.vault.getName()); }
  getIcon(): string { return "git-fork"; }

  getState(): Record<string, unknown> {
    return { graphDir: this.graphDir, collapse: this.collapse.toJSON(), heatmap: this.heatmap };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as {
      graphDir?: string | null;
      collapse?: Record<string, string[]>;
      heatmap?: boolean;
    };
    this.graphDir = s.graphDir ?? null;
    this.heatmap = s.heatmap === true;
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

  /**
   * Draw another project. The stored transform belongs to the one on screen, so
   * it is dropped — a new project gets fitted rather than inheriting somebody
   * else's pan and opening somewhere off in the white.
   */
  showGraph(graphDir: string): void {
    this.graphDir = graphDir;
    this.lastTransform = null;
    this.app.workspace.requestSaveLayout();
    this.redraw();
  }

  /**
   * The map's resting state when it does not know what to draw. A twin of the
   * chat's React GraphPicker — same class names, same rows, same words — built
   * in plain DOM because this view is d3 all the way down and its redraw empties
   * the container out from under anything React would be holding.
   */
  private drawPicker(container: HTMLElement, model: GraphModel): void {
    const picker = container.createDiv({ cls: "cb-picker" });
    picker.createEl("h3", { cls: "cb-picker-question", text: "Which project should I draw?" });
    const rows = projectRows(model);
    if (rows.length === 0) {
      picker.createEl("p", { text: PICKER_EMPTY });
      return;
    }
    const list = picker.createDiv({ cls: "cb-picker-graphs" });
    for (const row of rows) {
      const button = list.createEl("button", { cls: "cb-picker-graph", attr: { "aria-label": projectRowLabel(row) } });
      button.createSpan({ cls: "cb-picker-name", text: row.name });
      if (row.location !== null) button.createSpan({ cls: "cb-picker-where", text: row.location });
      const state = button.createSpan({ cls: "cb-picker-state", attr: { "aria-hidden": "true" } });
      state.createSpan({ text: noteCount(row.notes) });
      button.onclick = () => this.showGraph(row.dir);
    }
  }

  private scheduleRedraw(): void {
    if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => this.redraw(), 300);
  }

  private redraw(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("cb-mindmap");
    const model = this.plugin.model;
    if (model === null) {
      container.createEl("p", { cls: "cb-mm-empty", text: "Creative Buddy is still indexing the vault…" });
      return;
    }

    const graphs = model.graphs();
    // A persisted graphDir can outlive its folder (rename). Drawing whichever
    // graph happens to sort first would be a map of something nobody asked for,
    // so an unresolvable one falls back to asking.
    if (this.graphDir !== null && !graphs.includes(this.graphDir)) this.graphDir = null;
    if (this.graphDir === null) {
      this.drawPicker(container, model);
      return;
    }

    const header = container.createDiv({ cls: "cb-mm-header" });
    const selector = header.createEl("select", { cls: "cb-quiet-control" });
    for (const dir of graphs) {
      const option = selector.createEl("option", { text: dir === "" ? "(vault root)" : dir });
      option.value = dir;
    }
    selector.value = this.graphDir;
    selector.onchange = () => this.showGraph(selector.value);

    const data = buildMindmapData(model, this.graphDir, this.collapse.collapsedSet(this.graphDir));
    const stats = data.stats;
    const hubWarn = stats !== null && stats.hubChildren >= 10 ? " cb-mm-flat" : "";
    header.createSpan({
      cls: `cb-mm-stats${hubWarn}`,
      text: stats === null ? "no hub found" : `${stats.nodes} notes · ${stats.hubChildren} off the hub`,
    });

    // Heat is a way of reading the map, not a fact about the graph, so the
    // switch rides in the header beside the project picker rather than in
    // plugin settings.
    const heatToggle = header.createEl("label", { cls: "cb-mm-heat-toggle" });
    const heatInput = heatToggle.createEl("input", { type: "checkbox" });
    heatInput.checked = this.heatmap;
    heatToggle.createSpan({ text: "Heat" });
    heatInput.addEventListener("change", () => {
      this.heatmap = heatInput.checked;
      this.app.workspace.requestSaveLayout();
      this.redraw();
    });

    // Stage first, then the inspector below it, then the dock inside the stage:
    // the readout has to exist before the tree can wire hover into it.
    const stage = container.createDiv({ cls: "cb-mm-stage" });
    const inspector = container.createDiv({ cls: "cb-mm-inspector cb-mm-inspector-idle", text: INSPECTOR_HINT });
    const report = (node: MindmapNode | null): void => {
      const line = node === null ? null : inspectorLine(node);
      inspector.setText(line ?? INSPECTOR_HINT);
      inspector.toggleClass("cb-mm-inspector-idle", line === null);
    };

    this.drawTree(stage, data, report);
    const dock = stage.createDiv({ cls: "cb-mm-dock" });
    this.drawTray(dock, data);
  }

  /**
   * Measures labels in the faces they actually render in. The geometry module
   * owns every rule about width; all it needs from the shell is a ruler.
   */
  private measurers(host: HTMLElement): { node: Measure; hub: Measure } {
    const style = getComputedStyle(host);
    const family = style.getPropertyValue("--font-interface").trim() || style.fontFamily;
    const small = style.getPropertyValue("--font-ui-small").trim() || "13px";
    const medium = style.getPropertyValue("--font-ui-medium").trim() || "15px";
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) {
      // No canvas in this environment — fall back to an average advance, which
      // is what the map used to do for every label.
      const rough = (size: number): Measure => (text) => [...text].length * size * 0.55;
      return { node: rough(13), hub: rough(15) };
    }
    const at = (font: string): Measure => (text) => {
      context.font = font;
      return context.measureText(text).width;
    };
    return { node: at(`${small} ${family}`), hub: at(`600 ${medium} ${family}`) };
  }

  private drawTree(stage: HTMLElement, data: MindmapData, report: (node: MindmapNode | null) => void): void {
    if (data.root === null) {
      stage.createEl("p", { cls: "cb-mm-empty", text: "This graph has no hub note — a hub is the note whose body carries a ## Charter heading." });
      return;
    }
    const host = stage.createDiv({ cls: "cb-mm-svg-host" });
    const svg = select(host).append("svg").attr("class", "cb-mm-svg");
    const canvas = svg.append("g");

    const hubPath = data.root.path;
    const measure = this.measurers(host);
    const boxes = new Map<string, Box>();
    const boxOf = (node: MindmapNode): Box => {
      const cached = boxes.get(node.path);
      if (cached !== undefined) return cached;
      const isHub = node.path === hubPath;
      const box = nodeBox(node.stem, isHub ? measure.hub : measure.node, {
        isHub,
        suffix: node.collapsedChildren > 0 ? `+${node.collapsedChildren}` : null,
      });
      boxes.set(node.path, box);
      return box;
    };

    const layout = flextree<MindmapNode>()
      .nodeSize((n) => [boxOf(n.data).height + ROW_GAP, boxOf(n.data).width + H_GAP])
      .spacing(6);
    const root = layout(hierarchy(data.root, (d) => d.children));

    const byPath = new Map<string, { x: number; y: number; data: MindmapNode }>();
    root.each((n) => byPath.set(n.data.path, { x: n.x, y: n.y, data: n.data }));

    // Parent edges leave from the parent's right edge rather than its anchor,
    // so the curve spans the gap it is meant to span instead of starting under
    // the parent's own box and being drawn over.
    root.links().forEach((link) => {
      const weight = edgeWeight(link.source.depth);
      const startX = link.source.y + boxOf(link.source.data).width;
      const midX = (startX + link.target.y) / 2;
      canvas
        .append("path")
        .attr("class", "cb-mm-edge")
        .attr("stroke-width", weight.width)
        .attr("opacity", weight.opacity)
        .attr("d", `M${startX},${link.source.x} C${midX},${link.source.x} ${midX},${link.target.x} ${link.target.y},${link.target.x}`);
    });

    // Cross-links sit at a texture's weight and light up only for the node
    // under the pointer or the keyboard. A real graph draws dozens of them,
    // and at a readable weight they scribble over the tree they annotate;
    // indexed by both ends, either end can call its own out of the mesh.
    const crossByPath = new Map<string, SVGPathElement[]>();
    for (const cross of data.crossLinks) {
      const from = byPath.get(cross.from);
      const to = byPath.get(cross.to);
      if (from === undefined || to === undefined) continue;
      const startX = from.y + boxOf(from.data).width;
      const path = canvas
        .append("path")
        .attr("class", "cb-mm-crosslink")
        .attr("d", `M${startX},${from.x} Q${(startX + to.y) / 2},${(from.x + to.x) / 2 - 40} ${to.y},${to.x}`)
        .node();
      if (path === null) continue;
      for (const end of [cross.from, cross.to]) {
        const list = crossByPath.get(end) ?? [];
        list.push(path);
        crossByPath.set(end, list);
      }
    }

    let lit: SVGPathElement[] = [];
    const setActive = (node: MindmapNode | null): void => {
      for (const path of lit) path.classList.remove("cb-mm-crosslink-live");
      lit = node === null ? [] : crossByPath.get(node.path) ?? [];
      for (const path of lit) path.classList.add("cb-mm-crosslink-live");
      report(node);
    };

    root.each((n) => {
      const node = n.data;
      const isHub = node.path === hubPath;
      const box = boxOf(node);
      const facts = inspectorLine(node);
      const g = canvas
        .append("g")
        .attr("class", isHub ? "cb-mm-node cb-mm-hub" : "cb-mm-node")
        .attr("transform", `translate(${n.y},${n.x})`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", facts ?? node.stem);

      // A node's colour is its own questions; the child-ref area behind the
      // divider carries what a collapse is hiding. Off, both classes are absent
      // and every colour falls back to the flat palette.
      const ownHeat = this.heatmap ? ` ${heatClass(node.openQuestions)}` : "";
      const hiddenHeat = this.heatmap ? ` ${heatClass(node.hiddenOpenQuestions)}` : "";
      const problem = node.problemKinds.length > 0;

      // The hub carries the charter and is what the rest hangs off, so it is a
      // title over a spine; every other note is a discrete claim in a box.
      if (isHub) {
        const spine = problem ? "cb-mm-hub-spine cb-mm-hub-spine-problem" : "cb-mm-hub-spine";
        // Folded, the spine splits where the box would: own heat, then hidden.
        const ownEnd = box.dividerX ?? box.width;
        g.append("rect")
          .attr("class", `${spine}${ownHeat}`)
          .attr("x", 0)
          .attr("y", 8)
          .attr("width", ownEnd)
          .attr("height", 2.5)
          .attr("rx", 1.25);
        if (box.dividerX !== null) {
          g.append("rect")
            .attr("class", `${spine}${hiddenHeat}`)
            .attr("x", box.dividerX)
            .attr("y", 8)
            .attr("width", box.width - box.dividerX)
            .attr("height", 2.5)
            .attr("rx", 1.25);
        }
      } else {
        g.append("rect")
          .attr("class", `${problem ? "cb-mm-box cb-mm-problem" : "cb-mm-box"}${ownHeat}`)
          .attr("x", 0)
          .attr("y", -box.height / 2)
          .attr("width", box.width)
          .attr("height", box.height)
          .attr("rx", 6);
        // One path does three jobs: the child-ref fill, the shared right-hand
        // outline, and — where it closes — the divider itself.
        const region = childRegionPath(box);
        if (region !== null) {
          g.append("path").attr("class", `cb-mm-child-region${hiddenHeat}`).attr("d", region);
        }
      }

      const textY = isHub ? -6 : 0;
      g.append("text").attr("x", box.labelX).attr("y", textY).text(box.label);
      if (box.suffix !== null && box.suffixX !== null) {
        g.append("text").attr("class", "cb-mm-fold").attr("x", box.suffixX).attr("y", textY).text(box.suffix);
      }
      const foldable = node.children.length > 0 || node.collapsedChildren > 0;
      const fold = (): void => {
        this.collapse.toggle(this.graphDir!, node.path);
        this.app.workspace.requestSaveLayout();
        this.redraw();
      };
      g.on("click", (event: MouseEvent) => {
        if (event.altKey || !foldable) return this.openNote(node.path);
        fold();
      });
      // Enter opens and Space folds, mirroring what the two clicks do.
      g.on("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.openNote(node.path);
        } else if (event.key === " " && foldable) {
          event.preventDefault();
          fold();
        }
      });
      g.on("mouseenter", () => setActive(node));
      g.on("focus", () => setActive(node));
      g.on("mouseleave", () => setActive(null));
      g.on("blur", () => setActive(null));
    });

    const zoomBehavior = zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 2.5]).on("zoom", (event) => {
      this.lastTransform = event.transform as ZoomTransform;
      canvas.attr("transform", String(event.transform));
    });
    svg.call(zoomBehavior);

    // A live-update redraw keeps the pan/zoom you had; a first draw or a graph
    // switch fits the whole graph instead of opening on its top-left corner.
    // Deferred a frame because the host has no size until layout has run.
    const applyFit = (): void => {
      if (!host.isConnected) return;
      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      root.each((n) => {
        const box = boxOf(n.data);
        bounds.minX = Math.min(bounds.minX, n.y);
        bounds.maxX = Math.max(bounds.maxX, n.y + box.width);
        bounds.minY = Math.min(bounds.minY, n.x - box.height / 2);
        bounds.maxY = Math.max(bounds.maxY, n.x + box.height / 2);
      });
      const fit = fitTransform(bounds, { width: host.clientWidth, height: host.clientHeight });
      svg.call(zoomBehavior.transform, zoomIdentity.translate(fit.x, fit.y).scale(fit.k));
    };
    if (this.lastTransform !== null) svg.call(zoomBehavior.transform, this.lastTransform);
    else window.requestAnimationFrame(applyFit);
  }

  private drawTray(dock: HTMLElement, data: MindmapData): void {
    if (data.unreachable.length === 0) return;
    // Closed, with the count in the bar: the number is the news, the list is
    // the detail, and an opened list covers the map you came here to read.
    const panel = dock.createEl("details", { cls: "cb-mm-panel cb-mm-panel-alert" });
    panel.createEl("summary", { text: `Not reachable from the hub · ${data.unreachable.length}` });
    const body = panel.createDiv({ cls: "cb-mm-panel-body" });
    for (const item of data.unreachable) {
      const row = body.createDiv({ cls: "cb-mm-tray-row" });
      const link = row.createEl("a", { text: item.stem });
      link.onclick = () => this.openNote(item.path);
      row.createSpan({ text: item.parent !== null ? ` — parent '${item.parent}'` : " — no parent" });
    }
  }

  /**
   * Notes open in the main pane you last worked in, not in a split off the
   * map. getLeaf(false) hands back an existing navigable leaf — from a sidebar
   * view that means the main area — and only makes one when there is none,
   * which is how the built-in search and backlinks panels behave.
   */
  private openNote(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
  }
}
