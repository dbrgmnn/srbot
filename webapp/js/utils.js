/**
 * Centralized utility functions for the SRbot WebApp.
 */

/**
 * Locks the body scroll by setting overflow to hidden and touch-action to none.
 * Uses a counter to handle nested scroll locks (e.g., picker inside a sheet).
 */
export function lockScroll() {
  document.body.dataset.sheetCount = (
    parseInt(document.body.dataset.sheetCount || "0") + 1
  ).toString();
  document.body.style.overflow = "hidden";
  document.body.style.touchAction = "none";
}

/**
 * Unlocks the body scroll by decrementing the counter.
 * Resets styles only when the last lock is removed.
 */
export function unlockScroll() {
  const count = Math.max(
    0,
    parseInt(document.body.dataset.sheetCount || "0") - 1,
  );
  document.body.dataset.sheetCount = count.toString();
  if (count === 0) {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }
}
