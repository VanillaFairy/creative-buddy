/**
 * Obsidian's runtime is only available inside Obsidian. Modules that reach for
 * it — `settings.ts`, which the chat components import for the model list —
 * would otherwise be unreachable from a test. The classes are here to be
 * extended, not exercised; anything a test actually asserts on lives in a
 * module that does not import this.
 */

export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class ItemView {}
export class WorkspaceLeaf {}
export class App {}
