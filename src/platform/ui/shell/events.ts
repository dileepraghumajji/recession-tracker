/** Window events used by the shell (kept dependency-free so they never pull heavy UI into a bundle). */
export const LAYOUT_EVENT = "tk-layout"; // detail: "toggle-edit" | "reset"
export const COMMAND_EVENT = "tk-command"; // open the command menu

export function openCommandMenu() {
  window.dispatchEvent(new CustomEvent(COMMAND_EVENT));
}
