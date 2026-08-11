import { Plugin } from "obsidian";

export default class GraphBuddyPlugin extends Plugin {
  async onload(): Promise<void> {
    console.log("graph-buddy: loaded");
  }

  onunload(): void {
    console.log("graph-buddy: unloaded");
  }
}
