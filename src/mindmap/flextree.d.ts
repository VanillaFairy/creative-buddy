declare module "d3-flextree" {
  import type { HierarchyNode } from "d3-hierarchy";

  export interface FlexHierarchyPointLink<Datum> {
    source: FlexHierarchyPointNode<Datum>;
    target: FlexHierarchyPointNode<Datum>;
  }

  export interface FlexHierarchyPointNode<Datum> extends HierarchyNode<Datum> {
    x: number;
    y: number;
    children?: FlexHierarchyPointNode<Datum>[];
    /** Narrowed from d3-hierarchy: the layout has stamped x/y onto both ends. */
    links(): FlexHierarchyPointLink<Datum>[];
  }

  export interface FlexTreeLayout<Datum> {
    (root: HierarchyNode<Datum>): FlexHierarchyPointNode<Datum>;
    nodeSize(size: (node: HierarchyNode<Datum>) => [number, number]): this;
    spacing(spacing: number | ((a: HierarchyNode<Datum>, b: HierarchyNode<Datum>) => number)): this;
  }

  export function flextree<Datum>(options?: object): FlexTreeLayout<Datum>;
}
