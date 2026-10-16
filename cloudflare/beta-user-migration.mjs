import { MAX_CYCLE_BYTES, isObject, normalizeEmail, sha256Hex } from './beta-worker-utils.mjs';

const MAX_CUSTOM_PRODUCTS = 16;
const MAX_WORKFLOW_RECORDS = 200;
const MAX_MIGRATED_CLOUD_CYCLES = 300;
const MAX_MIGRATED_WORKFLOW_RECORDS = MAX_WORKFLOW_RECORDS;
const MAX_MIGRATED_CUSTOM_PRODUCTS = 48;
const MAX_MIGRATION_BYTES = 20_000_000;
const normalizePlanInterval = (value) => value === 'annual' || value === 'monthly' ? value : null;
const emailSnapshotKey = async (email) => {
  return `by-email/${await sha256Hex(normalizeEmail(email))}.json`;
};

function appendSnapshotSettings({ snapshot, user, env, now, statements, accountForMigrationBytes }) {
  const settings = snapshot.userSettings;
  if (settings === null || settings === undefined) return;
  if (!isObject(settings)) throw new Error('SNAPSHOT_SETTINGS_INVALID');
  const settingsWithoutLegacyCycles = { ...settings };
  delete settingsWithoutLegacyCycles.cloudCycles;
  accountForMigrationBytes(settingsWithoutLegacyCycles);
  statements.push(env.DB.prepare(`INSERT INTO user_settings (user_id, data_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_settings.data_json), updated_at = excluded.updated_at`)
    .bind(user.clerkId, JSON.stringify(settingsWithoutLegacyCycles), now));
}

function appendSnapshotEntitlement({ snapshot, user, env, now, statements, accountForMigrationBytes }) {
  const entitlement = snapshot.userEntitlement;
  if (entitlement === null || entitlement === undefined) return;
  if (!isObject(entitlement)) throw new Error('SNAPSHOT_ENTITLEMENT_INVALID');
  accountForMigrationBytes(entitlement);
  statements.push(env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(
          json_patch(excluded.data_json, user_entitlements.data_json),
          json_object(
            'stripeCustomerId', COALESCE(json_extract(user_entitlements.data_json, '$.stripeCustomerId'), json_extract(excluded.data_json, '$.stripeCustomerId')),
            'stripeSubscriptionId', COALESCE(json_extract(user_entitlements.data_json, '$.stripeSubscriptionId'), json_extract(excluded.data_json, '$.stripeSubscriptionId')),
            'pendingStripeSync', CASE WHEN json_extract(user_entitlements.data_json, '$.pendingStripeSync') = 1 OR json_extract(excluded.data_json, '$.pendingStripeSync') = 1 THEN json('true') ELSE json('false') END
          )
        ), updated_at = excluded.updated_at`)
        .bind(user.clerkId, JSON.stringify({
          uid: user.clerkId,
          premiumActive: false,
          billingStatus: 'pending_verification',
          effectiveSource: 'none',
          stripeCustomerId: typeof entitlement.stripeCustomerId === 'string' ? entitlement.stripeCustomerId : null,
          stripeSubscriptionId: typeof entitlement.stripeSubscriptionId === 'string' ? entitlement.stripeSubscriptionId : null,
          planInterval: normalizePlanInterval(entitlement.planInterval),
          cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd === true,
          currentPeriodEnd: typeof entitlement.currentPeriodEnd === 'string' ? entitlement.currentPeriodEnd : null,
          pendingStripeSync: Boolean(entitlement.stripeCustomerId || entitlement.stripeSubscriptionId),
          migratedFromSnapshot: true,
    }), now));
}

function appendSnapshotMetrics({ snapshot, user, env, now, statements, accountForMigrationBytes }) {
  const metrics = snapshot.userMetrics;
  if (metrics === null || metrics === undefined) return;
  if (!isObject(metrics)) throw new Error('SNAPSHOT_METRICS_INVALID');
  accountForMigrationBytes(metrics);
  statements.push(env.DB.prepare(`INSERT INTO user_metrics (user_id, data_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_metrics.data_json), updated_at = excluded.updated_at`)
    .bind(user.clerkId, JSON.stringify({ ...metrics, uid: user.clerkId }), now));
}

function appendSnapshotAccountDocuments(context) {
  appendSnapshotSettings(context);
  appendSnapshotEntitlement(context);
  appendSnapshotMetrics(context);
}

function validateSnapshotCycle(cycle) {
  assertCycleObject(cycle);
  assertCycleId(cycle.id);
  const { label, cycleDate } = readCycleLabels(cycle);
  assertCycleMetadata(cycle.metadata);
  const payloadJson = serializeCyclePayload(cycle.payloadJson);
  const payloadBytes = new TextEncoder().encode(payloadJson).length;
  const now = new Date().toISOString();
  if (payloadBytes > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_CYCLE_TOO_LARGE');
  assertJsonPayload(payloadJson);
  return {
    ...cycle, label, cycleDate, payloadJson, payloadBytes,
    createdAt: normalizeSnapshotTimestamp(cycle.createdAt, new Date(0).toISOString()),
    updatedAt: normalizeSnapshotTimestamp(cycle.updatedAt, now),
  };
}

function normalizeSnapshotTimestamp(value, fallback) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fallback;
  return value;
}

function assertCycleObject(cycle) {
  if (!isObject(cycle)) throw new Error('SNAPSHOT_CYCLE_INVALID');
}

function assertCycleId(id) {
  assertSnapshotId(id, 'SNAPSHOT_CYCLE_ID_INVALID');
}

function assertSnapshotId(id, code) {
  if (typeof id !== 'string') throw new Error(code);
  if (!id) throw new Error(code);
  if (id.length > 128) throw new Error(code);
  if (id.includes('/')) throw new Error(code);
}

function readCycleLabels(cycle) {
  const label = typeof cycle.label === 'string' ? cycle.label.trim() : '';
  const cycleDate = typeof cycle.cycleDate === 'string' ? cycle.cycleDate : '';
  if (!label || label.length > 200) throw new Error('SNAPSHOT_CYCLE_INVALID');
  if (!cycleDate || cycleDate.length > 32) throw new Error('SNAPSHOT_CYCLE_INVALID');
  return { label, cycleDate };
}

function assertCycleMetadata(metadata) {
  if (metadata === undefined || metadata === null) return;
  if (!isObject(metadata)) throw new Error('SNAPSHOT_CYCLE_METADATA_INVALID');
}

function serializeCyclePayload(payload) {
  return typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
}

function assertJsonPayload(payloadJson) {
  try { JSON.parse(payloadJson); } catch { throw new Error('SNAPSHOT_CYCLE_INVALID'); }
}

function appendSnapshotCycle(cycle, context) {
  const validated = validateSnapshotCycle(cycle);
  const { user, env, now, statements, accountForMigrationBytes } = context;
  accountForMigrationBytes(validated.payloadJson);
  const metadataJson = JSON.stringify({ ...(validated.metadata || {}), userId: user.clerkId });
  accountForMigrationBytes(metadataJson);
  statements.push(env.DB.prepare(`INSERT OR IGNORE INTO cloud_cycles
          (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, migration_import, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
    .bind(validated.id, user.clerkId, validated.label, validated.cycleDate, metadataJson,
      validated.payloadJson, validated.payloadBytes, validated.createdAt || now, validated.updatedAt || now));
}

function appendSnapshotCycles(cloudCycles, context) {
  for (const cycle of cloudCycles) appendSnapshotCycle(cycle, context);
}

function appendSnapshotWorkflow(record, context) {
  validateWorkflowRecord(record);
  const workflowJson = serializeWorkflowData(record.data);
  if (new TextEncoder().encode(workflowJson).length > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_WORKFLOW_TOO_LARGE');
  context.accountForMigrationBytes(workflowJson);
  context.statements.push(context.env.DB.prepare('INSERT OR IGNORE INTO workflow_awareness (user_id, cycle_id, data_json, migration_import) VALUES (?, ?, ?, 1)')
    .bind(context.user.clerkId, record.id, workflowJson));
}

function validateWorkflowRecord(record) {
  assertWorkflowRecordObject(record);
  assertWorkflowRecordData(record.data);
  assertWorkflowRecordId(record.id);
}

function assertWorkflowRecordObject(record) {
  if (!isObject(record)) throw new Error('SNAPSHOT_WORKFLOW_INVALID');
}

function assertWorkflowRecordData(data) {
  if (!isObject(data)) throw new Error('SNAPSHOT_WORKFLOW_INVALID');
}

function assertWorkflowRecordId(id) {
  assertSnapshotId(id, 'SNAPSHOT_WORKFLOW_ID_INVALID');
}

function serializeWorkflowData(data) {
  return JSON.stringify(data);
}

function appendSnapshotWorkflows(workflowAwareness, context) {
  for (const record of workflowAwareness) appendSnapshotWorkflow(record, context);
}

function normalizeSnapshotProduct(product, userId) {
  assertProductObject(product);
  const migrated = { ...(product.data || {}), userId };
  const id = typeof migrated.id === 'string' && migrated.id ? migrated.id : product.id;
  assertProductId(id);
  assertNotBuiltIn(migrated);
  migrated.id = id;
  migrated.version = 1;
  const dataJson = JSON.stringify(migrated);
  if (new TextEncoder().encode(dataJson).length > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_PRODUCT_TOO_LARGE');
  return { id, migrated, dataJson };
}

function assertProductObject(product) {
  if (!isObject(product)) throw new Error('SNAPSHOT_PRODUCT_INVALID');
  if (product.data === undefined || product.data === null) return;
  if (!isObject(product.data)) throw new Error('SNAPSHOT_PRODUCT_INVALID');
}

function assertProductId(id) {
  assertSnapshotId(id, 'SNAPSHOT_PRODUCT_ID_INVALID');
}

function assertNotBuiltIn(product) {
  if (product.builtIn === true) throw new Error('SNAPSHOT_PRODUCT_INVALID');
}

function findProductSlot(index, occupied) {
  const slot = Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, n) => `product-${String(n + 1).padStart(2, '0')}`).find((id) => !occupied.has(id));
  if (slot) return slot;
  let suffix = 0;
  let candidate = `legacy-${index + 1}`;
  while (occupied.has(candidate)) candidate = `legacy-${index + 1}-${++suffix}`;
  return candidate;
}

async function appendSnapshotProduct(product, index, context, state) {
  const { id, migrated, dataJson } = normalizeSnapshotProduct(product, context.user.clerkId);
  if (state.existingIds.has(id)) {
    return;
  }
  context.accountForMigrationBytes(dataJson);
  const slotId = findProductSlot(index, state.occupiedSlots);
  state.occupiedSlots.add(slotId);
  state.existingIds.set(id, true);
  context.statements.push(context.env.DB.prepare('INSERT OR IGNORE INTO custom_products (user_id, slot_id, product_id, data_json, migration_import) VALUES (?, ?, ?, ?, 1)')
    .bind(context.user.clerkId, slotId, id, JSON.stringify(migrated)));
}

async function appendSnapshotProducts(customProducts, context) {
  const rows = (await context.env.DB.prepare('SELECT slot_id, product_id, migration_import FROM custom_products WHERE user_id = ?')
    .bind(context.user.clerkId).all()).results || [];
  const state = {
    occupiedSlots: new Set(rows.map((row) => row.slot_id)),
    existingIds: new Map(rows.map((row) => [row.product_id, row.migration_import === 1])),
  };
  for (const [index, product] of customProducts.entries()) await appendSnapshotProduct(product, index, context, state);
}

function readSnapshotCollections(snapshot) {
  const read = (key) => {
    const value = snapshot[key];
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`SNAPSHOT_${key.toUpperCase()}_INVALID`);
    return value;
  };
  return {
    cloudCycles: read('cloudCycles'),
    workflowAwareness: read('workflowAwareness'),
    customProducts: read('customProducts'),
  };
}

function assertUniqueSnapshotIds(records, readId, code) {
  const ids = new Set();
  for (const record of records) {
    const id = readId(record);
    if (typeof id !== 'string' || !id) continue;
    if (ids.has(id)) throw new Error(code);
    ids.add(id);
  }
}

function validateSnapshotCollections({ cloudCycles, workflowAwareness, customProducts }) {
  validateUniqueCollections({ cloudCycles, workflowAwareness, customProducts });
  validateCollectionLimits({ cloudCycles, workflowAwareness, customProducts });
}

function validateUniqueCollections({ cloudCycles, workflowAwareness, customProducts }) {
  assertUniqueSnapshotIds(cloudCycles, (record) => record?.id, 'SNAPSHOT_CYCLE_DUPLICATE_ID');
  assertUniqueSnapshotIds(workflowAwareness, (record) => record?.id, 'SNAPSHOT_WORKFLOW_DUPLICATE_ID');
  assertUniqueSnapshotIds(customProducts, (record) => record?.data?.id || record?.id, 'SNAPSHOT_PRODUCT_DUPLICATE_ID');
}

function validateCollectionLimits({ cloudCycles, workflowAwareness, customProducts }) {
  const limits = [
    [cloudCycles, MAX_MIGRATED_CLOUD_CYCLES, 'SNAPSHOT_CYCLE_QUOTA_EXCEEDED'],
    [workflowAwareness, MAX_MIGRATED_WORKFLOW_RECORDS, 'SNAPSHOT_WORKFLOW_QUOTA_EXCEEDED'],
    [customProducts, MAX_MIGRATED_CUSTOM_PRODUCTS, 'SNAPSHOT_PRODUCT_QUOTA_EXCEEDED'],
  ];
  for (const [records, limit, error] of limits) if (records.length > limit) throw new Error(error);
}

function createMigrationByteCounter() {
  let bytes = 0;
  return (value) => {
    bytes += new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
    if (bytes > MAX_MIGRATION_BYTES) throw new Error('SNAPSHOT_MIGRATION_TOO_LARGE');
  };
}

async function buildSnapshotStatements({ user, env, snapshot, now, collections }) {
  const accountForMigrationBytes = createMigrationByteCounter();
  const statements = [];
  const context = { snapshot, user, env, now, statements, accountForMigrationBytes };
  appendSnapshotAccountDocuments(context);
  appendSnapshotCycles(collections.cloudCycles, context);
  appendSnapshotWorkflows(collections.workflowAwareness, context);
  await appendSnapshotProducts(collections.customProducts, context);
  return statements;
}

async function executeSnapshotMigration(db, user, now, statements) {
  statements.push(db.prepare('UPDATE users SET migration_status = ?, migrated_at = ?, updated_at = ? WHERE clerk_id = ?')
    .bind('complete', now, now, user.clerkId));
  await db.prepare("UPDATE users SET migration_status = 'migrating', updated_at = ? WHERE clerk_id = ?")
    .bind(now, user.clerkId).run();
  // D1 batches are atomic individually; imported-row writes use INSERT OR IGNORE / merge semantics,
  // so a later sign-in can safely retry after a batch failure before the final status update runs.
  for (let offset = 0; offset < statements.length; offset += 50) await db.batch(statements.slice(offset, offset + 50));
}

async function markSnapshotMigrationFailed(db, user) {
  try {
    await db.prepare('UPDATE users SET migration_status = ?, updated_at = ? WHERE clerk_id = ?')
      .bind('failed', new Date().toISOString(), user.clerkId).run();
  } catch (error) {
    console.error('[beta-worker] failed to record snapshot migration error', error);
  }
}

async function applySnapshotMigration(user, env, snapshot, now) {
  if (!snapshot) return;
  try {
    const collections = readSnapshotCollections(snapshot);
    validateSnapshotCollections(collections);
    const statements = await buildSnapshotStatements({ user, env, snapshot, now, collections });
    await executeSnapshotMigration(env.DB, user, now, statements);
  } catch (error) {
    await markSnapshotMigrationFailed(env.DB, user);
    throw error;
  }
}

async function findClerkUser(db, clerkId) {
  return db.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(clerkId).first();
}

async function assertEmailAvailable(db, user) {
  const email = normalizeEmail(user.email);
  const owner = await db.prepare('SELECT clerk_id FROM users WHERE email = ?').bind(email).first();
  if (owner && owner.clerk_id !== user.clerkId) throw new Error('EMAIL_ALREADY_LINKED');
}

async function updateClerkProfile(db, user) {
  try {
    await db.prepare('UPDATE users SET email = ?, email_verified = 1, display_name = ?, updated_at = ? WHERE clerk_id = ?')
      .bind(normalizeEmail(user.email), user.displayName, new Date().toISOString(), user.clerkId).run();
  } catch (error) {
    const message = String(error?.message || '');
    if (isEmailUniqueViolation(error, message)) throw new Error('EMAIL_ALREADY_LINKED');
    throw error;
  }
}

function isEmailUniqueViolation(error, message) {
  const code = error?.code || error?.cause?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE'
    || code === 'SQLITE_CONSTRAINT'
    || /UNIQUE constraint failed:\s*users\.email\b/i.test(message);
}

async function readUserSnapshot(env, email) {
  requireSnapshotBinding(env);
  const object = await env.FIRESTORE_SNAPSHOT.get(await emailSnapshotKey(email));
  if (!object) return null;
  const snapshot = await parseSnapshotObject(object);
  validateSnapshotProfile(snapshot);
  return snapshot;
}

function requireSnapshotBinding(env) {
  if (env.FIRESTORE_SNAPSHOT) return;
  const error = new Error('FIRESTORE_SNAPSHOT binding is not configured.');
  error.code = 'SNAPSHOT_CONFIG_MISSING';
  throw error;
}

async function parseSnapshotObject(object) {
  try {
    const snapshot = await object.json();
    if (isObject(snapshot)) return snapshot;
  } catch { /* handled as invalid snapshot below */ }
  throw new Error('SNAPSHOT_INVALID');
}

function validateSnapshotProfile(snapshot) {
  const profile = snapshot.userProfile;
  if (profile === undefined || profile === null) return;
  if (!isObject(profile)) throw new Error('SNAPSHOT_PROFILE_INVALID');
}

async function insertMigratingUser(db, user, snapshot, now) {
  return db.prepare(`INSERT INTO users (clerk_id, email, legacy_uid, email_verified, display_name, beta_access,
    migration_status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING`)
    .bind(user.clerkId, normalizeEmail(user.email), snapshot?.uid || null, user.displayName, snapshot?.userProfile?.betaAccess === true ? 1 : 0,
      snapshot ? 'migrating' : 'no_match', now, now).run();
}

async function updateMigratingUser(db, user, snapshot, now) {
  await db.prepare(`UPDATE users SET migration_status = ?, legacy_uid = COALESCE(legacy_uid, ?),
    beta_access = CASE WHEN ? = 1 THEN 1 ELSE beta_access END, updated_at = ? WHERE clerk_id = ?`)
    .bind(snapshot ? 'migrating' : 'no_match', snapshot?.uid || null, snapshot?.userProfile?.betaAccess === true ? 1 : 0, now, user.clerkId).run();
}

async function insertOrUpdateMigratingUser(db, user, snapshot, now) {
  const result = await insertMigratingUser(db, user, snapshot, now);
  if (result.meta.changes) return;
  const racedUser = await findClerkUser(db, user.clerkId);
  if (!racedUser) {
    await assertEmailAvailable(db, user);
    throw new Error('EMAIL_ALREADY_LINKED');
  }
  await updateMigratingUser(db, user, snapshot, now);
}

async function prepareClerkUser(env, user) {
  const existing = await findClerkUser(env.DB, user.clerkId);
  await assertEmailAvailable(env.DB, user);
  if (needsClerkProfileUpdate(existing, user)) await updateClerkProfile(env.DB, user);
  return existing;
}

function needsClerkProfileUpdate(existing, user) {
  if (!existing) return false;
  const emailChanged = normalizeEmail(existing.email) !== normalizeEmail(user.email);
  const displayNameChanged = (existing.display_name || '') !== (user.displayName || '');
  return emailChanged || displayNameChanged;
}

async function finishCompletedUser(env, user, refreshMigratedStripeEntitlement) {
  await refreshStripeEntitlementBestEffort(env, user.clerkId, refreshMigratedStripeEntitlement);
  return findClerkUser(env.DB, user.clerkId);
}

async function refreshStripeEntitlementBestEffort(env, userId, refreshMigratedStripeEntitlement) {
  try {
    await refreshMigratedStripeEntitlement(env, userId);
  } catch (error) {
    console.error('[beta-worker] migrated Stripe entitlement refresh failed', error instanceof Error ? error.message : 'refresh failed');
  }
}

function canSkipSnapshotMigration(existing, snapshot) {
  return existing && !snapshot && existing.migration_status === 'no_match';
}

async function migrateClerkUserSnapshot(env, user, existing, snapshot) {
  const now = new Date().toISOString();
  if (existing) await updateMigratingUser(env.DB, user, snapshot, now);
  else await insertOrUpdateMigratingUser(env.DB, user, snapshot, now);
  await applySnapshotMigration(user, env, snapshot, now);
}

export const createUserEnsurer = (refreshMigratedStripeEntitlement) => async (user, env) => {
  const existing = await prepareClerkUser(env, user);
  if (existing?.migration_status === 'complete') {
    return finishCompletedUser(env, user, refreshMigratedStripeEntitlement);
  }

  const snapshot = await readUserSnapshot(env, user.email);
  if (canSkipSnapshotMigration(existing, snapshot)) return findClerkUser(env.DB, user.clerkId);
  await migrateClerkUserSnapshot(env, user, existing, snapshot);
  await refreshStripeEntitlementBestEffort(env, user.clerkId, refreshMigratedStripeEntitlement);
  return findClerkUser(env.DB, user.clerkId);
}


export { emailSnapshotKey };
