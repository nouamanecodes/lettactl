/**
 * Centralized logger that respects quiet mode
 * In quiet mode, only errors are shown
 */

let quietMode = false;

export function setQuietMode(quiet: boolean): void {
  quietMode = quiet;
}

export function isQuietMode(): boolean {
  return quietMode;
}

/**
 * Log info messages (suppressed in quiet mode)
 */
export function log(...args: any[]): void {
  if (!quietMode) {
    console.log(...args);
  }
}

/**
 * Log errors (always shown)
 */
export function error(...args: any[]): void {
  console.error(...args);
}

/**
 * Log warnings (suppressed in quiet mode)
 */
export function warn(...args: any[]): void {
  if (!quietMode) {
    console.warn(...args);
  }
}

/**
 * Log output that should always be shown (e.g., command results, tables)
 * This is for final output the user requested, not progress info
 */
export function output(...args: any[]): void {
  console.log(...args);
}
