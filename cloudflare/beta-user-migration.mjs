const MAX_CYCLE_BYTES = 750_000;
const MAX_CUSTOM_PRODUCTS = 16;
const MAX_WORKFLOW_RECORDS = 200;
const MAX_MIGRATED_CLOUD_CYCLES = 300;
const MAX_MIGRATED_WORKFLOW_RECORDS = MAX_WORKFLOW_RECORDS;
const MAX_MIGRATED_CUSTOM_PRODUCTS = 48;
const MAX_MIGRATION_BYTES = 20_000_000;
const normalizeEmail = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const normalizePlanInterval = (value) => value === 'annual' || value === 'monthly' ? value : null;
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const emailSnapshotKey = async (email) => {
  return `by-email/${await sha256Hex(normalizeEmail(email))}.json`;
};

function appendSnapshotSettings(snapshot, user, env, now, statements, accountForMigrationBytes) {
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

function appendSnapshotEntitlement(snapshot, user, env, now, statements, accountForMigrationBytes) {
  const entitlement = snapshot.userEntitlement;
  if (entitlement === null || entitlement === undefined) return;
  if (!isObject(entitlement)) throw new Error('SNAPSHOT_ENTITLEMENT_INVALID');
  accountForMigrationBytes(entitlement);
  statements.push(env.DB.prepare(`INSERT INTO user_entitlements (user_id, data_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_entitlements.data_json), updated_at = excluded.updated_at`)
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

function appendSnapshotMetrics(snapshot, user, env, now, statements, accountForMigrationBytes) {
  const metrics = snapshot.userMetrics;
  if (metrics === null || metrics === undefined) return;
  if (!isObject(metrics)) throw new Error('SNAPSHOT_METRICS_INVALID');
  accountForMigrationBytes(metrics);
  statements.push(env.DB.prepare(`INSERT INTO user_metrics (user_id, data_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET data_json = json_patch(excluded.data_json, user_metrics.data_json), updated_at = excluded.updated_at`)
    .bind(user.clerkId, JSON.stringify({ ...metrics, uid: user.clerkId }), now));
}

function appendSnapshotAccountDocuments(snapshot, user, env, now, statements, accountForMigrationBytes) {
  appendSnapshotSettings(snapshot, user, env, now, statements, accountForMigrationBytes);
  appendSnapshotEntitlement(snapshot, user, env, now, statements, accountForMigrationBytes);
  appendSnapshotMetrics(snapshot, user, env, now, statements, accountForMigrationBytes);
}

function appendSnapshotCycles(cloudCycles, user, env, now, statements, accountForMigrationBytes) {
      for (const cycle of cloudCycles) {
        if (!isObject(cycle)) throw new Error('SNAPSHOT_CYCLE_INVALID');
        if (typeof cycle.id !== 'string' || !cycle.id || cycle.id.length > 128 || cycle.id.includes('/')) throw new Error('SNAPSHOT_CYCLE_ID_INVALID');
        const label = typeof cycle.label === 'string' ? cycle.label.trim() : '';
        const cycleDate = typeof cycle.cycleDate === 'string' ? cycle.cycleDate : '';
        if (!label || label.length > 200 || !cycleDate || cycleDate.length > 32) throw new Error('SNAPSHOT_CYCLE_INVALID');
        if (cycle.metadata !== undefined && cycle.metadata !== null && !isObject(cycle.metadata)) throw new Error('SNAPSHOT_CYCLE_METADATA_INVALID');
        let payloadJson;
        if (typeof cycle.payloadJson === 'string') payloadJson = cycle.payloadJson;
        else if (cycle.payloadJson === null || cycle.payloadJson === undefined) payloadJson = '{}';
        else payloadJson = JSON.stringify(cycle.payloadJson);
        const payloadBytes = new TextEncoder().encode(payloadJson).length;
        if (payloadBytes > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_CYCLE_TOO_LARGE');
        accountForMigrationBytes(payloadJson);
        try { JSON.parse(payloadJson); } catch { throw new Error('SNAPSHOT_CYCLE_INVALID'); }
        const metadataJson = JSON.stringify({ ...(cycle.metadata || {}), userId: user.clerkId });
        accountForMigrationBytes(metadataJson);
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO cloud_cycles
          (id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, migration_import, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          .bind(cycle.id, user.clerkId, label, cycleDate, metadataJson,
            payloadJson, payloadBytes,
            cycle.createdAt || now, cycle.updatedAt || now));
      }
}

function appendSnapshotWorkflows(workflowAwareness, user, env, statements, accountForMigrationBytes) {
      for (const record of workflowAwareness) {
        if (!isObject(record)) throw new Error('SNAPSHOT_WORKFLOW_INVALID');
        if (typeof record.id !== 'string' || !record.id || record.id.length > 128 || record.id.includes('/')) throw new Error('SNAPSHOT_WORKFLOW_ID_INVALID');
        if (!isObject(record.data)) throw new Error('SNAPSHOT_WORKFLOW_INVALID');
        const workflowJson = JSON.stringify(record.data);
        if (new TextEncoder().encode(workflowJson).length > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_WORKFLOW_TOO_LARGE');
        accountForMigrationBytes(workflowJson);
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO workflow_awareness (user_id, cycle_id, data_json, migration_import) VALUES (?, ?, ?, 1)')
          .bind(user.clerkId, record.id, workflowJson));
      }
}

async function appendSnapshotProducts(customProducts, user, env, statements, accountForMigrationBytes) {
      const existingProducts = ((await env.DB.prepare('SELECT slot_id, product_id, migration_import FROM custom_products WHERE user_id = ?')
        .bind(user.clerkId).all()).results || []);
      const occupiedProductSlots = new Set(existingProducts.map((row) => row.slot_id));
      const existingProductIds = new Map(existingProducts.map((row) => [row.product_id, row.migration_import === 1]));
      for (const [index, product] of customProducts.entries()) {
        if (!isObject(product) || (product.data !== undefined && product.data !== null && !isObject(product.data))) throw new Error('SNAPSHOT_PRODUCT_INVALID');
        const migratedProduct = { ...(product.data || {}), userId: user.clerkId };
        const productId = typeof migratedProduct.id === 'string' && migratedProduct.id ? migratedProduct.id : product.id;
        if (typeof productId !== 'string' || !productId || productId.length > 128 || productId.includes('/')) throw new Error('SNAPSHOT_PRODUCT_ID_INVALID');
        if (existingProductIds.has(productId)) {
          if (existingProductIds.get(productId)) continue;
          throw new Error('SNAPSHOT_PRODUCT_ID_CONFLICT');
        }
        migratedProduct.id = productId;
        if (migratedProduct.builtIn === true) throw new Error('SNAPSHOT_PRODUCT_INVALID');
        migratedProduct.version = 1;
        const productJson = JSON.stringify(migratedProduct);
        if (new TextEncoder().encode(productJson).length > MAX_CYCLE_BYTES) throw new Error('SNAPSHOT_PRODUCT_TOO_LARGE');
        accountForMigrationBytes(productJson);
        let slotId = Array.from({ length: MAX_CUSTOM_PRODUCTS }, (_, slotIndex) => `product-${String(slotIndex + 1).padStart(2, '0')}`)
          .find((candidate) => !occupiedProductSlots.has(candidate));
        if (!slotId) {
          slotId = `legacy-${index + 1}`;
          let suffix = 1;
          while (occupiedProductSlots.has(slotId)) {
            slotId = `legacy-${index + 1}-${suffix}`;
            suffix += 1;
          }
        }
        occupiedProductSlots.add(slotId);
        existingProductIds.set(productId, true);
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO custom_products (user_id, slot_id, product_id, data_json, migration_import) VALUES (?, ?, ?, ?, 1)')
          .bind(user.clerkId, slotId, productId, JSON.stringify(migratedProduct)));
      }
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
  assertUniqueSnapshotIds(cloudCycles, (record) => record?.id, 'SNAPSHOT_CYCLE_DUPLICATE_ID');
  assertUniqueSnapshotIds(workflowAwareness, (record) => record?.id, 'SNAPSHOT_WORKFLOW_DUPLICATE_ID');
  assertUniqueSnapshotIds(customProducts, (record) => record?.data?.id || record?.id, 'SNAPSHOT_PRODUCT_DUPLICATE_ID');
  if (cloudCycles.length > MAX_MIGRATED_CLOUD_CYCLES) throw new Error('SNAPSHOT_CYCLE_QUOTA_EXCEEDED');
  if (workflowAwareness.length > MAX_MIGRATED_WORKFLOW_RECORDS) throw new Error('SNAPSHOT_WORKFLOW_QUOTA_EXCEEDED');
  if (customProducts.length > MAX_MIGRATED_CUSTOM_PRODUCTS) throw new Error('SNAPSHOT_PRODUCT_QUOTA_EXCEEDED');
}

function createMigrationByteCounter() {
  let bytes = 0;
  return (value) => {
    bytes += new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
    if (bytes > MAX_MIGRATION_BYTES) throw new Error('SNAPSHOT_MIGRATION_TOO_LARGE');
  };
}

async function buildSnapshotStatements(user, env, snapshot, now, collections) {
  const accountForMigrationBytes = createMigrationByteCounter();
  const statements = [];
  appendSnapshotAccountDocuments(snapshot, user, env, now, statements, accountForMigrationBytes);
  appendSnapshotCycles(collections.cloudCycles, user, env, now, statements, accountForMigrationBytes);
  appendSnapshotWorkflows(collections.workflowAwareness, user, env, statements, accountForMigrationBytes);
  await appendSnapshotProducts(collections.customProducts, user, env, statements, accountForMigrationBytes);
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
  await db.prepare('UPDATE users SET migration_status = ?, updated_at = ? WHERE clerk_id = ?')
    .bind('failed', new Date().toISOString(), user.clerkId).run();
}

async function applySnapshotMigration(user, env, snapshot, now) {
  if (!snapshot) return;
  try {
    const collections = readSnapshotCollections(snapshot);
    validateSnapshotCollections(collections);
    const statements = await buildSnapshotStatements(user, env, snapshot, now, collections);
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
  const owner = await db.prepare('SELECT clerk_id FROM users WHERE email = ?').bind(user.email).first();
  if (owner && owner.clerk_id !== user.clerkId) throw new Error('EMAIL_ALREADY_LINKED');
}

async function updateClerkProfile(db, user) {
  try {
    await db.prepare('UPDATE users SET email = ?, email_verified = 1, display_name = ?, updated_at = ? WHERE clerk_id = ?')
      .bind(user.email, user.displayName, new Date().toISOString(), user.clerkId).run();
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('UNIQUE constraint failed') && message.includes('users.email')) throw new Error('EMAIL_ALREADY_LINKED');
    throw error;
  }
}

async function readUserSnapshot(env, email) {
  if (!env.FIRESTORE_SNAPSHOT) return null;
  const object = await env.FIRESTORE_SNAPSHOT.get(await emailSnapshotKey(email));
  if (!object) return null;
  let snapshot;
  try { snapshot = await object.json(); } catch { throw new Error('SNAPSHOT_INVALID'); }
  if (!isObject(snapshot)) throw new Error('SNAPSHOT_INVALID');
  if (snapshot.userProfile !== undefined && snapshot.userProfile !== null && !isObject(snapshot.userProfile)) throw new Error('SNAPSHOT_PROFILE_INVALID');
  return snapshot;
}

async function insertMigratingUser(db, user, snapshot, now) {
  await db.prepare(`INSERT INTO users (clerk_id, email, legacy_uid, email_verified, display_name, beta_access,
    migration_status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`)
    .bind(user.clerkId, user.email, snapshot?.uid || null, user.displayName, snapshot?.userProfile?.betaAccess === true ? 1 : 0,
      snapshot ? 'migrating' : 'no_match', now, now).run();
}

async function updateMigratingUser(db, user, snapshot, now) {
  await db.prepare(`UPDATE users SET migration_status = ?, legacy_uid = COALESCE(legacy_uid, ?),
    beta_access = CASE WHEN ? = 1 THEN 1 ELSE beta_access END, updated_at = ? WHERE clerk_id = ?`)
    .bind(snapshot ? 'migrating' : 'no_match', snapshot?.uid || null, snapshot?.userProfile?.betaAccess === true ? 1 : 0, now, user.clerkId).run();
}

async function insertOrUpdateMigratingUser(db, user, snapshot, now) {
  try {
    await insertMigratingUser(db, user, snapshot, now);
  } catch (error) {
    if (!String(error?.message || '').includes('UNIQUE constraint failed')) throw error;
    const racedUser = await findClerkUser(db, user.clerkId);
    if (!racedUser) {
      await assertEmailAvailable(db, user);
      throw error;
    }
    await updateMigratingUser(db, user, snapshot, now);
  }
}

export const createUserEnsurer = (refreshMigratedStripeEntitlement) => async (user, env) => {
  const existing = await findClerkUser(env.DB, user.clerkId);
  await assertEmailAvailable(env.DB, user);
  if (existing && (normalizeEmail(existing.email) !== user.email || (existing.display_name || '') !== (user.displayName || ''))) {
    await updateClerkProfile(env.DB, user);
  }
  if (existing?.migration_status === 'complete') {
    await refreshMigratedStripeEntitlement(env, user.clerkId);
    return findClerkUser(env.DB, user.clerkId);
  }

  const snapshot = await readUserSnapshot(env, user.email);
  if (existing && !snapshot && existing.migration_status === 'no_match') return findClerkUser(env.DB, user.clerkId);
  const now = new Date().toISOString();
  if (existing) await updateMigratingUser(env.DB, user, snapshot, now);
  else await insertOrUpdateMigratingUser(env.DB, user, snapshot, now);
  await applySnapshotMigration(user, env, snapshot, now);
  await refreshMigratedStripeEntitlement(env, user.clerkId);
  return findClerkUser(env.DB, user.clerkId);
}


export { emailSnapshotKey };
