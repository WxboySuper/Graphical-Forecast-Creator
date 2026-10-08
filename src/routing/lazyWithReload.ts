import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_GUARD_PREFIX = 'gfc-chunk-reload:';

/**
 * Error text produced when a hashed lazy chunk or its CSS is gone or
 * unreachable. Covers Vite ("Unable to preload CSS for ...", "Failed to
 * fetch dynamically imported module"), webpack ("Loading chunk ... failed",
 * "ChunkLoadError"), and plain dynamic-import failures.
 */
const CHUNK_LOAD_PATTERN =
  /Unable to preload CSS|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError/i;

/** Reports whether an error looks like a stale-asset or transient chunk load failure. */
export const isChunkLoadError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }
  if (error instanceof Error && error.name === 'ChunkLoadError') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_LOAD_PATTERN.test(message);
};

const hasReloadedFor = (chunkKey: string): boolean => {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RELOAD_GUARD_PREFIX + chunkKey) === '1';
  } catch {
    return false;
  }
};

const markReloadedFor = (chunkKey: string): void => {
  try {
    sessionStorage?.setItem(RELOAD_GUARD_PREFIX + chunkKey, '1');
  } catch {
    // Storage can be blocked (private mode, disabled cookies). Reload anyway;
    // the worst case is one extra reload attempt, not a loop, since a second
    // failure without the guard still throws below once navigation settles.
  }
};

/**
 * Wraps a lazy route import so a stale hashed asset self-heals. When a deploy
 * replaces or deletes the hashed JS/CSS a running tab references, the first
 * load fails; one reload pulls fresh index.html with current hashes. The
 * sessionStorage guard keeps this to a single reload per chunk, and any
 * non-chunk error (or a repeat failure) still throws to the nearest boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's own generic constraint.
export const lazyWithReload = <T extends ComponentType<any>>(
  chunkKey: string,
  load: () => Promise<{ default: T }>,
  reload: () => void = () => window.location.reload()
): LazyExoticComponent<T> =>
  lazy(() =>
    load().catch((error: unknown): Promise<{ default: T }> => {
      if (!isChunkLoadError(error) || hasReloadedFor(chunkKey)) {
        throw error;
      }
      markReloadedFor(chunkKey);
      reload();
      // Suspend on this attempt; the reloaded page takes over from here.
      return new Promise<{ default: T }>(() => {});
    })
  );
