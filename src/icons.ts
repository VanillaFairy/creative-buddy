import { addIcon } from "obsidian";

// Drawn on addIcon's 100×100 grid at Lucide's stroke weight (2/24 of the box),
// so they sit beside Obsidian's built-in icons without looking heavier.
const STROKE = `fill="none" stroke="currentColor" stroke-width="8.33" stroke-linecap="round" stroke-linejoin="round"`;

export const CHAT_ICON = "creative-buddy-chat";
export const MAP_ICON = "creative-buddy-map";

export function registerIcons(): void {
  addIcon(
    CHAT_ICON,
    `<g ${STROKE}>` +
      `<path d="M24 16H76A12 12 0 0 1 88 28V58A12 12 0 0 1 76 70H42L24 86V70A12 12 0 0 1 12 58V28A12 12 0 0 1 24 16Z"/>` +
      `<path d="M41 36A9 9 0 1 1 53 44.5C50 46 50 48 50 51"/>` +
      `<path d="M50 60h.01"/>` +
      `</g>`,
  );
  addIcon(
    MAP_ICON,
    `<g ${STROKE}>` +
      `<circle cx="30" cy="50" r="13"/>` +
      `<circle cx="80" cy="18" r="8"/>` +
      `<circle cx="80" cy="50" r="8"/>` +
      `<circle cx="80" cy="82" r="8"/>` +
      `<path d="M43 50C58 50 56 18 72 18"/>` +
      `<path d="M43 50H72"/>` +
      `<path d="M43 50C58 50 56 82 72 82"/>` +
      `</g>`,
  );
}
