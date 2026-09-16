import { ItemView, WorkspaceLeaf, TFile, setIcon, Menu } from "obsidian";
import { hierarchy } from "d3-hierarchy";
import { flextree } from "d3-flextree";
import { select } from "d3-selection";
import type { Selection } from "d3-selection";
import { zoom, zoomIdentity, ZoomTransform } from "d3-zoom";
import type CreativeBuddyPlugin from "../main";
import { buildMindmapData, MindmapNode, MindmapData } from "./layout";
import { Box, Bounds, Measure, DOT_RADIUS, childRegionPath, edgeOpacity, fitTransform, inspectorLine, nodeBox } from "./geometry";
import { isService, serviceBox } from "./service";
import { radialLayout, radialLinkPath, crossLinkPath, reachFor, CAPTION_GAP, HIDDEN_RING_GAP } from "./radial";
import type { Reaching } from "./radial";
import { foldMark, hiddenIfFolded } from "./fold";
import { heatClass } from "./heat";
import { CollapseStore } from "./collapse-store";
import { tabTitle } from "../view-title";
import type { GraphModel } from "../graph/graph-model";
import { PICKER_EMPTY, folderOffer, noteCount, offerLabel, projectRowLabel, projectRows } from "../project-list";
import { Highlight, Links, add, drawnLit, edgeLit, extend, menuFor, prune, remove, toggle } from "./highlight";

export const MINDMAP_VIEW_TYPE = "creative-buddy-mindmap";
const H_GAP = 48;
const ROW_GAP = 8;
const INSPECTOR_HINT = "Click a note to open it, a branch to fold it. Alt-click always opens.";

/**
 * How close the rings sit. Only the least room between rings is being set here:
 * a crowded ring is sized by what stands on it and will not come in past that,
 * so on a busy circle the tighter settings show mostly in the inner rings.
 */
const DENSITY: ReadonlyArray<{ id: Density; label: string; ringGap: number }> = [
  { id: "near", label: "Near", ringGap: 90 },
  { id: "mid", label: "Medium", ringGap: 130 },
  { id: "far", label: "Far", ringGap: 170 },
];

export type Density = "near" | "mid" | "far";

export class MindmapView extends ItemView {
  private graphDir: string | null = null;
  private heatmap = false;
  private radial = false;
  private density: Density = "mid";
  /** Whether the settings panel is up. A view's mood, not a saved preference. */
  private settingsOpen = false;
  private settingsRoot: HTMLElement | null = null;
  private collapse = new CollapseStore();
  private offChange: (() => void) | null = null;
  private redrawTimer: number | null = null;
  private lastTransform: ZoomTransform | null = null;
  // Highlight is a way of exploring, not a saved view: a stored path could
  // outlive its note across a restart, so it stays out of getState/setState.
  private highlight: Highlight | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CreativeBuddyPlugin) {
    super(leaf);
  }

  getViewType(): string { return MINDMAP_VIEW_TYPE; }
  getDisplayText(): string { return tabTitle("Creative Buddy map", this.graphDir, this.app.vault.getName()); }
  getIcon(): string { return "git-fork"; }

  getState(): Record<string, unknown> {
    return { graphDir: this.graphDir, collapse: this.collapse.toJSON(), heatmap: this.heatmap, radial: this.radial, density: this.density };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as {
      graphDir?: string | null;
      collapse?: Record<string, string[]>;
      heatmap?: boolean;
      radial?: boolean;
      density?: Density;
    };
    this.graphDir = s.graphDir ?? null;
    this.heatmap = s.heatmap === true;
    this.radial = s.radial === true;
    this.density = DENSITY.some((d) => d.id === s.density) ? s.density! : "mid";
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
    this.registerDomEvent(document, "pointerdown", (event) => {
      if (!this.settingsOpen || this.settingsRoot === null) return;
      if (this.settingsRoot.contains(event.target as Node)) return;
      this.settingsOpen = false;
      this.redraw();
    });
    this.registerDomEvent(document, "keydown", (event) => {
      if (event.key !== "Escape" || !this.settingsOpen) return;
      this.settingsOpen = false;
      this.redraw();
    });
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
    this.highlight = null;
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
    const offer = folderOffer(model, this.plugin.activeFolderDir());
    if (rows.length === 0 && offer === null) {
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
    if (offer === null) return;

    const adopt = list.createEl("button", {
      cls: "cb-picker-graph cb-picker-offer",
      attr: { "aria-label": offerLabel(offer) },
    });
    adopt.createSpan({ cls: "cb-picker-name", text: offerLabel(offer) });
    if (offer.location !== null) adopt.createSpan({ cls: "cb-picker-where", text: offer.location });
    if (offer.refusal !== null) {
      adopt.disabled = true;
      adopt.createSpan({ cls: "cb-picker-state", attr: { "aria-hidden": "true" } }).createSpan({ text: offer.refusal });
      return;
    }
    adopt.onclick = () => {
      void this.plugin.createProjectFrom(offer.dir).then((done) => {
        if (done) this.showGraph(offer.dir);
      });
    };
  }

  private scheduleRedraw(): void {
    if (this.redrawTimer !== null) window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => this.redraw(), 300);
  }

  /**
   * How the map is read, behind one button. These settings belong beside the
   * map rather than in the vault's settings pane — they are ways of looking at
   * a graph, not facts about the plugin — but there are enough of them now that
   * a row of checkboxes was eating the header a project name has to fit in.
   *
   * Density is offered only in radial mode, because it is the only shape with
   * rings to space.
   */
  /**
   * How the map is read, behind one button. These settings belong beside the
   * map rather than in the vault's settings pane — they are ways of looking at
   * a graph, not facts about the plugin — but there are enough of them now that
   * a row of controls was eating the header a project name has to fit in.
   *
   * A panel rather than an Obsidian `Menu`, because Density is a choice among
   * three and reads as a dropdown; a menu can only offer it as three ticks, and
   * this Obsidian's `Menu` has no submenus to nest it in either.
   */
  private settingsMenu(host: HTMLElement): void {
    const anchor = host.createDiv({ cls: "cb-mm-settings-anchor" });
    const gear = anchor.createEl("button", {
      cls: "cb-mm-gear clickable-icon",
      attr: { "aria-label": "Map settings", "aria-expanded": String(this.settingsOpen) },
    });
    setIcon(gear, "settings-2");

    const panel = anchor.createDiv({ cls: "cb-mm-settings" });
    this.settingsRoot = anchor;
    panel.hidden = !this.settingsOpen;

    // A redraw rebuilds this whole header, so the panel has to be told to come
    // back up — otherwise changing one setting closes the panel you were about
    // to change the next one in.
    const apply = (change: () => void): void => {
      change();
      this.app.workspace.requestSaveLayout();
      this.redraw();
    };

    gear.onclick = () => {
      this.settingsOpen = !this.settingsOpen;
      panel.hidden = !this.settingsOpen;
      gear.setAttr("aria-expanded", String(this.settingsOpen));
    };

    const check = (label: string, on: boolean, set: (value: boolean) => void): void => {
      const row = panel.createEl("label", { cls: "cb-mm-setting" });
      const input = row.createEl("input", { type: "checkbox" });
      input.checked = on;
      row.createSpan({ text: label });
      input.addEventListener("change", () => apply(() => set(input.checked)));
    };

    check("Radial", this.radial, (on) => {
      this.radial = on;
      // The stored pan and zoom belong to whichever shape was on screen; the
      // other would open somewhere off in the white with it.
      this.lastTransform = null;
    });
    check("Heat", this.heatmap, (on) => { this.heatmap = on; });

    // Only the radial map has rings to space.
    if (!this.radial) return;
    const row = panel.createEl("label", { cls: "cb-mm-setting cb-mm-setting-pick" });
    row.createSpan({ text: "Density" });
    const select = row.createEl("select", { cls: "cb-quiet-control" });
    for (const step of DENSITY) {
      const option = select.createEl("option", { text: step.label });
      option.value = step.id;
    }
    select.value = this.density;
    select.addEventListener("change", () => apply(() => { this.density = select.value as Density; }));
  }

  private ringGap(): number {
    return DENSITY.find((step) => step.id === this.density)!.ringGap;
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
    if (this.graphDir !== null && !graphs.includes(this.graphDir)) {
      this.graphDir = null;
      this.highlight = null;
    }
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

    const notes = model.notes(this.graphDir);
    this.highlight = prune(this.highlight, new Set(notes.map((note) => note.path)));

    // The circle asks for the whole tree and draws part of it. Pruning would
    // repack the ring on every fold and throw the reader's place away; laid out
    // whole, a fold leaves a gap exactly where the branch was and moves nothing.
    const data = buildMindmapData(model, this.graphDir, this.collapse.collapsedSet(this.graphDir), {
      prune: !this.radial,
    });
    const stats = data.stats;
    header.createSpan({
      cls: "cb-mm-stats",
      text: stats === null ? "no hub found" : `${stats.nodes} notes`,
    });

    if (this.highlight !== null) {
      const center = this.highlight.center;
      const stem = notes.find((note) => note.path === center)?.stem ?? center;
      const chip = header.createDiv({ cls: "cb-mm-highlight" });
      chip.createSpan({ cls: "cb-mm-highlight-name", text: `Highlight: ${stem}`, attr: { title: center } });
      const close = chip.createEl("button", {
        cls: "cb-mm-highlight-close clickable-icon",
        attr: { "aria-label": "Turn Highlight off" },
      });
      setIcon(close, "x");
      close.onclick = () => {
        this.highlight = null;
        this.redraw();
      };
    }

    // Radial and Heat are ways of reading the map, not facts about the graph,
    // so both switches ride in the header beside the project picker rather
    // than in plugin settings.
    this.settingsMenu(header);

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

    // Cross-links sit at a texture's weight and light up only for the node
    // under the pointer or the keyboard. A real graph draws dozens of them,
    // and at a readable weight they scribble over the tree they annotate;
    // indexed by both ends, either end can call its own out of the mesh.
    const crossByPath = new Map<string, SVGPathElement[]>();
    let lit: SVGPathElement[] = [];
    const setActive = (node: MindmapNode | null): void => {
      for (const path of lit) path.classList.remove("cb-mm-crosslink-live");
      lit = node === null ? [] : crossByPath.get(node.path) ?? [];
      for (const path of lit) path.classList.add("cb-mm-crosslink-live");
      report(node);
    };

    // Named apart from the cross-link hover state above (also `lit` in its own
    // right, but of paths under the pointer, not notes in the Highlight).
    const highlightLit = this.highlight === null
      ? null
      : drawnLit(this.highlight, data.parentOf, this.collapse.collapsedSet(this.graphDir!));

    const bounds = this.radial
      ? this.paintRadial(canvas, data, hubPath, measure, setActive, crossByPath, highlightLit)
      : this.paintCartesian(canvas, data, hubPath, measure, setActive, crossByPath, highlightLit);

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
      const fit = fitTransform(bounds, { width: host.clientWidth, height: host.clientHeight });
      svg.call(zoomBehavior.transform, zoomIdentity.translate(fit.x, fit.y).scale(fit.k));
    };
    if (this.lastTransform !== null) svg.call(zoomBehavior.transform, this.lastTransform);
    else window.requestAnimationFrame(applyFit);
  }

  /** Click folds a branch and opens a leaf; alt-click always opens; Enter opens; Space folds. */
  private wireNode(
    g: Selection<SVGGElement, unknown, null, undefined>,
    node: MindmapNode,
    setActive: (node: MindmapNode | null) => void,
    links: Links,
  ): void {
    const foldable = foldMark(node) !== null;
    const fold = (): void => {
      this.collapse.toggle(this.graphDir!, node.path);
      this.app.workspace.requestSaveLayout();
      this.redraw();
    };
    g.on("click", (event: MouseEvent) => {
      if (event.altKey || !foldable) return this.openNote(node.path);
      fold();
    });
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
    g.on("contextmenu", (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const apply = (next: Highlight | null): void => {
        this.highlight = next;
        this.redraw();
      };
      const on = this.highlight;
      const offer = menuFor(on, node.path);
      const menu = new Menu();
      menu.addItem((item) =>
        item.setTitle("Highlight").setChecked(offer.checked).onClick(() => apply(toggle(on, links, node.path))),
      );
      if (on !== null && offer.membership === "add") {
        menu.addItem((item) => item.setTitle("Add to Highlight").onClick(() => apply(add(on, node.path))));
      }
      if (on !== null && offer.membership === "remove") {
        menu.addItem((item) => item.setTitle("Remove from Highlight").onClick(() => apply(remove(on, node.path))));
      }
      if (on !== null && offer.extend) {
        menu.addItem((item) => item.setTitle("Extend Highlight").onClick(() => apply(extend(on, links, node.path))));
      }
      // A menu raised from the keyboard can arrive without a pointer position, so it
      // opens beside the node instead of in the corner of the window.
      if (event.clientX === 0 && event.clientY === 0) {
        const rect = (event.currentTarget as Element).getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
      } else {
        menu.showAtMouseEvent(event);
      }
    });
  }

  private paintCartesian(
    canvas: Selection<SVGGElement, unknown, null, undefined>,
    data: MindmapData,
    hubPath: string,
    measure: { node: Measure; hub: Measure },
    setActive: (node: MindmapNode | null) => void,
    crossByPath: Map<string, SVGPathElement[]>,
    lit: ReadonlySet<string> | null,
  ): Bounds {
    const dimmed = (path: string): boolean => lit !== null && !lit.has(path);
    const dimmedLink = (a: string, b: string): boolean => lit !== null && !edgeLit(lit, a, b);
    const boxes = new Map<string, Box>();
    const boxOf = (node: MindmapNode): Box => {
      const cached = boxes.get(node.path);
      if (cached !== undefined) return cached;
      const isHub = node.path === hubPath;
      const suffix = node.collapsedChildren > 0 ? `+${node.collapsedChildren}` : null;
      // However it is filed, the hub carries the charter and is never drawn as
      // something you file past.
      const box =
        !isHub && isService(node.kind)
          ? serviceBox(node.stem, measure.node, { suffix })
          : nodeBox(node.stem, isHub ? measure.hub : measure.node, { isHub, suffix });
      boxes.set(node.path, box);
      return box;
    };

    const layout = flextree<MindmapNode>()
      .nodeSize((n) => [boxOf(n.data).height + ROW_GAP, boxOf(n.data).width + H_GAP])
      .spacing(6);
    const root = layout(hierarchy(data.root!, (d) => d.children));

    const byPath = new Map<string, { x: number; y: number; data: MindmapNode }>();
    root.each((n) => byPath.set(n.data.path, { x: n.x, y: n.y, data: n.data }));

    // Parent edges leave from the parent's right edge rather than its anchor,
    // so the curve spans the gap it is meant to span instead of starting under
    // the parent's own box and being drawn over.
    root.links().forEach((link) => {
      const startX = link.source.y + boxOf(link.source.data).width;
      const midX = (startX + link.target.y) / 2;
      canvas
        .append("path")
        .attr("class", "cb-mm-edge")
        .classed("cb-mm-dimmed", dimmed(link.source.data.path) || dimmed(link.target.data.path))
        .attr("opacity", edgeOpacity(link.source.depth))
        .attr("d", `M${startX},${link.source.x} C${midX},${link.source.x} ${midX},${link.target.x} ${link.target.y},${link.target.x}`);
    });

    for (const cross of data.crossLinks) {
      const from = byPath.get(cross.from);
      const to = byPath.get(cross.to);
      if (from === undefined || to === undefined) continue;
      const startX = from.y + boxOf(from.data).width;
      const path = canvas
        .append("path")
        .attr("class", "cb-mm-crosslink")
        .classed("cb-mm-dimmed", dimmedLink(cross.from, cross.to))
        .attr("d", `M${startX},${from.x} Q${(startX + to.y) / 2},${(from.x + to.x) / 2 - 40} ${to.y},${to.x}`)
        .node();
      if (path === null) continue;
      for (const end of [cross.from, cross.to]) {
        const list = crossByPath.get(end) ?? [];
        list.push(path);
        crossByPath.set(end, list);
      }
    }

    root.each((n) => {
      const node = n.data;
      const isHub = node.path === hubPath;
      const box = boxOf(node);
      const facts = inspectorLine(node);
      const g = canvas
        .append("g")
        .attr("class", isHub ? "cb-mm-node cb-mm-hub" : "cb-mm-node")
        .classed("cb-mm-dimmed", dimmed(node.path))
        .attr("transform", `translate(${n.y},${n.x})`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", facts ?? node.stem);

      // The colour is a fact about the graph; Heat is a way of reading it. The
      // stylesheet keeps them in that order, so nothing here asks which is on.
      if (node.color !== null) g.style("--cb-tint", node.color);

      // A node's colour is its own questions; the child-ref area behind the
      // divider carries what a collapse is hiding. Off, both classes are absent
      // and every colour falls back to the flat palette.
      const ownHeat = this.heatmap ? ` ${heatClass(node.openQuestions)}` : "";
      const hiddenHeat = this.heatmap ? ` ${heatClass(node.hiddenOpenQuestions)}` : "";

      // The hub carries the charter and is what the rest hangs off, so it is a
      // title over a spine; every other note is a discrete claim in a box.
      if (isHub) {
        const spine = "cb-mm-hub-spine";
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
      } else if (isService(node.kind)) {
        // Infrastructure rather than content: it takes the radial map's shape in
        // the flat tree too, so it reads as a note you file past rather than one
        // you stop and read. `serviceBox` already left the room for it.
        g.append("circle")
          .attr("class", `cb-mm-dot cb-mm-service${ownHeat}`)
          .attr("cx", DOT_RADIUS)
          .attr("cy", 0)
          .attr("r", DOT_RADIUS);
      } else {
        g.append("rect")
          .attr("class", `cb-mm-box${ownHeat}`)
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
      this.wireNode(g, node, setActive, data);
    });

    const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    root.each((n) => {
      const box = boxOf(n.data);
      bounds.minX = Math.min(bounds.minX, n.y);
      bounds.maxX = Math.max(bounds.maxX, n.y + box.width);
      bounds.minY = Math.min(bounds.minY, n.x - box.height / 2);
      bounds.maxY = Math.max(bounds.maxY, n.x + box.height / 2);
    });
    return bounds;
  }

  private paintRadial(
    canvas: Selection<SVGGElement, unknown, null, undefined>,
    data: MindmapData,
    hubPath: string,
    measure: { node: Measure; hub: Measure },
    setActive: (node: MindmapNode | null) => void,
    crossByPath: Map<string, SVGPathElement[]>,
    lit: ReadonlySet<string> | null,
  ): Bounds {
    const dimmed = (path: string): boolean => lit !== null && !lit.has(path);
    const dimmedLink = (a: string, b: string): boolean => lit !== null && !edgeLit(lit, a, b);
    // `reachOf` is d3-flextree's contour walk re-reading the same node's size
    // many times over — measured at ~11 calls per node on a real graph — and
    // this one measures text on a canvas, so it is cached the way
    // `paintCartesian`'s `boxOf` already caches `Box`.
    const reaching = new Map<string, Reaching>();
    const reachOf = (node: MindmapNode) => {
      const cached = reaching.get(node.path);
      if (cached !== undefined) return cached.reach;
      const isHub = node.path === hubPath;
      // Measured against the count this note would show if it were folded, not
      // the one it shows now: a note that widens by a `+12` the moment you fold
      // it would shove its whole ring along, which is the jumping this mode
      // exists to avoid. The count is reserved always and drawn only when real.
      const computed = reachFor(node.stem, isHub, hiddenIfFolded(node), isHub ? measure.hub : measure.node);
      reaching.set(node.path, computed);
      return computed.reach;
    };

    const layout = radialLayout(data.root!, reachOf, { ringGap: this.ringGap() });
    const byPath = new Map(layout.nodes.map((n) => [n.path, n] as const));

    // Everything below asks this before it draws. The layout holds every note
    // so that folding moves nothing; what a fold hides simply goes undrawn.
    const shown = (path: string): boolean => !data.hiddenPaths.has(path);

    // Edges under nodes: parent edges first, then cross-links, then the dots
    // and captions drawn on top of both.
    for (const link of layout.links) {
      if (!shown(link.target.path)) continue;
      canvas
        .append("path")
        .attr("class", "cb-mm-edge")
        .classed("cb-mm-dimmed", dimmed(link.source.path) || dimmed(link.target.path))
        .attr("opacity", edgeOpacity(link.source.depth))
        .attr("d", radialLinkPath(link.source, link.target));
    }

    for (const cross of data.crossLinks) {
      const from = byPath.get(cross.from);
      const to = byPath.get(cross.to);
      if (from === undefined || to === undefined) continue;
      if (!shown(cross.from) || !shown(cross.to)) continue;
      const path = canvas
        .append("path")
        .attr("class", "cb-mm-crosslink cb-mm-crosslink-chord")
        .classed("cb-mm-dimmed", dimmedLink(cross.from, cross.to))
        .attr("d", crossLinkPath(from, to))
        .node();
      if (path === null) continue;
      for (const end of [cross.from, cross.to]) {
        const list = crossByPath.get(end) ?? [];
        list.push(path);
        crossByPath.set(end, list);
      }
    }

    for (const radialNode of layout.nodes) {
      if (!shown(radialNode.path)) continue;
      const node = radialNode.data;
      const isHub = radialNode.path === hubPath;
      const { reach, caption } = reaching.get(radialNode.path)!;
      const facts = inspectorLine(node);
      const g = canvas
        .append("g")
        .attr("class", isHub ? "cb-mm-node cb-mm-hub" : "cb-mm-node")
        .classed("cb-mm-dimmed", dimmed(radialNode.path))
        .attr("transform", `translate(${radialNode.x},${radialNode.y})`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", facts ?? node.stem);

      if (node.color !== null) g.style("--cb-tint", node.color);

      const ownHeat = this.heatmap ? ` ${heatClass(node.openQuestions)}` : "";
      const base = "cb-mm-dot";

      // What a collapse is hiding, in the only shape a circle has for it: a
      // second ring outside the dot, coloured by the heat it is hiding. Drawn
      // before the dot so the dot can keep the mark as its next sibling, which
      // is how the stylesheet reveals one without reaching for `:has`.
      if (node.collapsedChildren > 0 && this.heatmap) {
        g.append("circle")
          .attr("class", `cb-mm-dot-hidden ${heatClass(node.hiddenOpenQuestions)}`)
          .attr("r", reach.dot + HIDDEN_RING_GAP);
      }
      const service = !isHub && isService(node.kind) ? " cb-mm-service" : "";
      g.append("circle")
        .attr("class", isHub ? `${base} cb-mm-hub-dot${ownHeat}` : `${base}${service}${ownHeat}`)
        .attr("r", reach.dot);

      // Under the pointer, the dot says which way it goes: a minus over a
      // branch that is showing its children, a plus over one that is hiding
      // them, nothing over a leaf whose click opens the note.
      const mark = foldMark(node);
      if (mark !== null) {
        const arm = reach.dot * 0.55;
        const marks = g.append("g").attr("class", "cb-mm-fold-mark");
        marks.append("line").attr("x1", -arm).attr("y1", 0).attr("x2", arm).attr("y2", 0);
        if (mark === "expand") {
          marks.append("line").attr("x1", 0).attr("y1", -arm).attr("x2", 0).attr("y2", arm);
        }
      }

      const anchor = radialNode.labelAnchor;
      const captionX = anchor === "start" ? reach.dot + CAPTION_GAP : -(reach.dot + CAPTION_GAP);
      // The dot is the branch control and the name is the note: clicking the
      // name opens it whether or not the branch would have folded. Stopping the
      // event here is what keeps a foldable node from doing both at once.
      g.append("text")
        .attr("class", "cb-mm-caption")
        .attr("text-anchor", anchor)
        .attr("x", captionX)
        .text(caption.label)
        .on("click", (event: MouseEvent) => {
          event.stopPropagation();
          this.openNote(node.path);
        });
      // The count's room is always reserved; it is drawn only once the fold is
      // real, so an open branch does not advertise a number it is not hiding.
      if (node.collapsedChildren > 0 && caption.suffix !== null && caption.suffixX !== null) {
        const suffixX = anchor === "start" ? captionX + caption.suffixX : captionX - caption.suffixX;
        g.append("text")
          .attr("class", "cb-mm-caption cb-mm-fold")
          .attr("text-anchor", anchor)
          .attr("x", suffixX)
          .text(caption.suffix);
      }

      this.wireNode(g, node, setActive, data);
    }

    return layout.bounds;
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
