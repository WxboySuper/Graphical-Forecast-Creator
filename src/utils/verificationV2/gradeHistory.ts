import type { GradeAccountTier, GradeCard, GradeSnapshot } from '../../types/forecastGrade';

/**
 * Local persistence for Forecast Grade history (PR 05 — sources-history).
 *
 * Grade cards are the trend-only history kept for signed-in accounts (latest 25).
 * Snapshots are immutable full records stored for premium accounts to enable
 * restore. Runs never rewrite history — every completed run prepends a new card.
 * Signed-out sessions keep no history.
 */

export const GRADE_HISTORY_LIMIT = 25;

const CARDS_PREFIX = 'gfc-forecast-grade-cards-v1';
const SNAPSHOT_PREFIX = 'gfc-forecast-grade-snapshot-v1';

/** Stable per-account storage scope. Signed-out sessions are not persisted. */
export const accountScope = (tier: GradeAccountTier, userId?: string): string | null => {
  if (tier === 'signed-out' || !userId) {
    return null;
  }
  return `user:${userId}`;
};

const cardsKey = (scope: string): string => `${CARDS_PREFIX}:${scope}`;
const snapshotKey = (scope: string, cardId: string): string =>
  `${SNAPSHOT_PREFIX}:${scope}:${cardId}`;

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Reads the trend-only grade cards for a scope, newest first. */
export const loadGradeCards = (scope: string | null): GradeCard[] => {
  if (!scope) {
    return [];
  }
  const storage = safeStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(cardsKey(scope));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GradeCard[]) : [];
  } catch {
    return [];
  }
};

/**
 * Persists a card list (trimmed to the limit) for a scope. Returns whether
 * `setItem` completed successfully so the caller can defer side effects that
 * should only happen once history is durably updated.
 */
const persistCards = (scope: string, cards: GradeCard[]): boolean => {
  const storage = safeStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(cardsKey(scope), JSON.stringify(cards.slice(0, GRADE_HISTORY_LIMIT)));
    return true;
  } catch {
    // Ignore quota / serialization failures; history is best-effort.
    return false;
  }
};

/** Persists a snapshot under the card id, returning whether the write succeeded. */
const persistSnapshot = (params: { scope: string; cardId: string; snapshot: GradeSnapshot }): boolean => {
  const storage = safeStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(snapshotKey(params.scope, params.cardId), JSON.stringify(params.snapshot));
    return true;
  } catch {
    // Snapshot persistence is best-effort.
    return false;
  }
};

/** Removes snapshots for the supplied card ids. Best-effort. */
const evictSnapshots = (params: { scope: string; cardIds: string[] }): void => {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  for (const id of params.cardIds) {
    try {
      storage.removeItem(snapshotKey(params.scope, id));
    } catch {
      // Ignore.
    }
  }
};

export interface RecordGradeOptions {
  scope: string | null;
  card: GradeCard;
  /** Immutable snapshot stored only for premium accounts. */
  snapshot?: GradeSnapshot;
}

/**
 * Records a completed run: prepends the card and trims to the limit. When a
 * snapshot is supplied (premium), it is written under the card id for restore.
 * Cards evicted past the limit have their snapshots removed to bound storage,
 * but only after the new card list is durably persisted — otherwise a failed
 * write would orphan the live snapshots. The returned card list reflects
 * the actual snapshot write so `hasSnapshot` never claims a snapshot that
 * was not stored.
 */
export const recordGradeResult = ({ scope, card, snapshot }: RecordGradeOptions): GradeCard[] => {
  if (!scope) {
    return [];
  }
  const existing = loadGradeCards(scope);
  const next = [card, ...existing];
  const trimmed = next.slice(0, GRADE_HISTORY_LIMIT);
  const evicted = next.slice(GRADE_HISTORY_LIMIT);

  const snapshotPersisted = snapshot
    ? persistSnapshot({ scope, cardId: card.id, snapshot })
    : false;
  const cardsPersisted = persistCards(scope, trimmed);

  if (cardsPersisted) {
    evictSnapshots({ scope, cardIds: evicted.map((c) => c.id) });
  }

  if (snapshot && !snapshotPersisted) {
    const corrected: GradeCard = { ...trimmed[0], hasSnapshot: false };
    return [corrected, ...trimmed.slice(1)];
  }
  return trimmed;
};

export interface LoadGradeSnapshotParams {
  scope: string | null;
  cardId: string;
}

/** Returns whether a parsed value is a non-null, non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Returns whether a value is a string or null. */
const isStringOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** Returns whether a value looks like the persisted grade card fields we read. */
const isGradeCardShape = (value: unknown): boolean =>
  isRecord(value) && typeof value.id === 'string' && typeof value.sourceLabel === 'string';

/** Returns whether a value looks like one product entry in a package grade. */
const isProductGradeShape = (value: unknown): boolean =>
  isRecord(value)
  && typeof value.product === 'string'
  && typeof value.applicable === 'boolean';

/** Returns whether a value looks like a package grade. */
const isPackageGradeShape = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.formulaVersion === 'string'
    && (value.grade === null || typeof value.grade === 'number')
    && isStringOrNull(value.letter)
    && typeof value.dataQuality === 'string'
    && Array.isArray(value.products)
    && value.products.every(isProductGradeShape)
  );
};

/**
 * Validates the snapshot envelope before it reaches app state. Snapshots come
 * from localStorage, so a tampered or corrupted entry must not be trusted as a
 * `GradeSnapshot` cast.
 */
const isGradeSnapshot = (value: unknown): value is GradeSnapshot =>
  isRecord(value)
  && isGradeCardShape(value.card)
  && isPackageGradeShape(value.package)
  && isRecord(value.forecast)
  && isStringOrNull(value.reportDate);

/** Loads the immutable full snapshot for a card, if one was stored (premium). */
export const loadGradeSnapshot = ({ scope, cardId }: LoadGradeSnapshotParams): GradeSnapshot | null => {
  if (!scope) {
    return null;
  }
  const storage = safeStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(snapshotKey(scope, cardId));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isGradeSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Clears all grade history for a scope (cards and snapshots). */
export const clearGradeHistory = (scope: string | null): void => {
  if (!scope) {
    return;
  }
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  const cards = loadGradeCards(scope);
  try {
    storage.removeItem(cardsKey(scope));
    for (const card of cards) {
      storage.removeItem(snapshotKey(scope, card.id));
    }
  } catch {
    // Ignore.
  }
};
