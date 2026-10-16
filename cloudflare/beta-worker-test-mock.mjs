class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql.replace(/\s+/g, ' ').trim(); this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() { return this.database.first(this.sql, this.params); }
  async all() { return this.database.all(this.sql, this.params); }
  async run() { return this.database.run(this.sql, this.params); }
}

const UNHANDLED_QUERY = Symbol('unhandled query');

function firstUserQuery(database, sql, params) {
  const lookup = firstUserLookup(database, sql, params);
  if (lookup !== UNHANDLED_QUERY) return lookup;
  return sql.startsWith('SELECT COUNT(*) AS count FROM users') ? { count: database.users.size } : UNHANDLED_QUERY;
}

function firstUserLookup(database, sql, params) {
  if (sql.startsWith('SELECT * FROM users WHERE clerk_id')) return database.users.get(params[0]) || null;
  if (sql.startsWith('SELECT beta_access FROM users WHERE clerk_id')) {
    const user = database.users.get(params[0]);
    return user ? { beta_access: user.beta_access } : null;
  }
  if (sql.startsWith('SELECT clerk_id FROM users WHERE email')) {
    const user = [...database.users.values()].find((entry) => entry.email.toLowerCase() === String(params[0]).toLowerCase());
    return user ? { clerk_id: user.clerk_id } : null;
  }
  if (sql.startsWith('SELECT clerk_id FROM users WHERE clerk_id')) {
    const user = database.users.get(params[0]);
    return user ? { clerk_id: user.clerk_id } : null;
  }
  if (sql.startsWith('SELECT clerk_id FROM users WHERE legacy_uid')) {
    const user = [...database.users.values()].find((entry) => entry.legacy_uid === params[0]);
    return user ? { clerk_id: user.clerk_id } : null;
  }
  return UNHANDLED_QUERY;
}

function firstAccountQuery(database, sql, params) {
  const record = firstAccountRecord(database, sql, params);
  if (record !== UNHANDLED_QUERY) return record;
  const owner = findEntitlementOwner(database, sql, params);
  if (owner !== UNHANDLED_QUERY) return owner;
  return countEntitledUsers(database, sql);
}

function firstAccountRecord(database, sql, params) {
  if (sql.startsWith('SELECT data_json FROM user_settings')) return database.settings.has(params[0]) ? { data_json: database.settings.get(params[0]) } : null;
  if (sql.startsWith('SELECT data_json FROM user_entitlements')) return database.entitlements.has(params[0]) ? { data_json: database.entitlements.get(params[0]) } : null;
  if (sql.startsWith('SELECT data_json FROM user_metrics')) return database.metrics.has(params[0]) ? { data_json: database.metrics.get(params[0]) } : null;
  return UNHANDLED_QUERY;
}

function findEntitlementOwner(database, sql, params) {
  if (sql.startsWith('SELECT user_id AS clerk_id FROM user_entitlements')) {
    for (const [user_id, data_json] of database.entitlements) if (JSON.parse(data_json).stripeCustomerId === params[0]) return { clerk_id: user_id };
    return null;
  }
  return UNHANDLED_QUERY;
}

function countEntitledUsers(database, sql) {
  if (sql.startsWith('SELECT COUNT(*) AS count FROM user_entitlements')) {
    const count = [...database.entitlements.values()].filter((dataJson) => ['active', 'trialing'].includes(JSON.parse(dataJson)?.billingStatus)).length;
    return { count };
  }
  return UNHANDLED_QUERY;
}

function firstRecordQuery(database, sql, params) {
  const queries = [
    () => firstRecordLookup(database, sql, params),
    () => firstRecordCounts(database, sql, params),
    () => firstRecordBytes(database, sql),
  ];
  for (const query of queries) {
    const result = query();
    if (result !== UNHANDLED_QUERY) return result;
  }
  return UNHANDLED_QUERY;
}

function firstRecordLookup(database, sql, params) {
  if (sql.startsWith('SELECT record_id, data_json, created_at, updated_at FROM user_records') && sql.includes('record_id = ?')) {
    return database.records.get(`${params[0]}:${params[1]}:${params[2]}`) || null;
  }
  if (sql.startsWith('SELECT 1 AS found FROM cloud_cycles WHERE user_id = ? AND id = ?')) return database.cloudCycles.has(`${params[0]}:${params[1]}`) ? { found: 1 } : null;
  if (sql.startsWith('SELECT 1 AS found FROM workflow_awareness WHERE user_id = ? AND cycle_id = ?')) {
    return database.workflowAwareness.has(`${params[0]}:${params[1]}`) ? { found: 1 } : null;
  }
  if (sql.startsWith('SELECT * FROM cloud_cycles WHERE id = ? AND user_id = ?')) return database.cloudCycles.get(`${params[1]}:${params[0]}`) || null;
  if (sql.startsWith('SELECT slot_id, data_json FROM custom_products WHERE user_id = ?')) {
    return [...database.customProducts.values()].find((row) => row.user_id === params[0] && row.product_id === params[1]) || null;
  }
  if (sql.startsWith('SELECT status, processed_at FROM stripe_events')) {
    const row = database.stripeEvents.get(params[0]);
    return row ? { ...row } : null;
  }
  return UNHANDLED_QUERY;
}

function firstRecordCounts(database, sql, params) {
  if (sql.startsWith('SELECT COUNT(*) AS count FROM cloud_cycles')) {
    return { count: [...database.cloudCycles.values()].filter((row) => row.user_id === params[0] && row.migration_import !== 1).length };
  }
  if (sql.startsWith('SELECT COUNT(*) AS count FROM workflow_awareness')) {
    return { count: [...database.workflowAwareness.values()].filter((row) => row.user_id === params[0] && row.migration_import !== 1).length };
  }
  return UNHANDLED_QUERY;
}

function firstRecordBytes(database, sql) {
  if (sql.startsWith('SELECT COALESCE(SUM(payload_bytes), 0) AS bytes FROM cloud_cycles')) {
    return { bytes: [...database.cloudCycles.values()].reduce((sum, row) => sum + (row.payload_bytes || 0), 0) };
  }
  return UNHANDLED_QUERY;
}

function listMetrics(_database, sql) {
  if (!sql.startsWith('SELECT event_date AS date, COUNT(DISTINCT')) return UNHANDLED_QUERY;
  return { results: [{ date: new Date().toISOString().slice(0, 10), activeDevices: 1, activeSignedInAccounts: 1,
    signups: 1, signIns: 2, upgrades: 0, cancellations: 0, cloudSaves: 0, cloudLoads: 0 }] };
}

function listCustomProductSlots(database, sql, params) {
  if (!sql.startsWith('SELECT slot_id, product_id, migration_import FROM custom_products WHERE user_id = ?')) return UNHANDLED_QUERY;
  return { results: [...database.customProducts.values()].filter((row) => row.user_id === params[0])
    .map(({ slot_id, product_id, migration_import }) => ({ slot_id, product_id, migration_import })) };
}

function listRecords(database, sql, params) {
  if (!sql.startsWith('SELECT record_id, data_json, created_at, updated_at FROM user_records')) return UNHANDLED_QUERY;
  const [userId, type] = params;
  const offset = params.at(-1);
  return { results: [...database.records.values()].filter((record) => record.user_id === userId && record.record_type === type).slice(offset, offset + 10) };
}

function listCloudCycles(database, sql, params) {
  if (!sql.includes('FROM cloud_cycles WHERE user_id = ?')) return UNHANDLED_QUERY;
  const offset = params.at(-1);
  return { results: [...database.cloudCycles.values()].filter((row) => row.user_id === params[0]).slice(offset, offset + 10)
    .map((row) => ({ ...row, userId: row.user_id, cycleDate: row.cycle_date, createdAt: row.created_at, updatedAt: row.updated_at })) };
}

function listWorkflowRecords(database, sql, params) {
  if (!sql.includes('FROM workflow_awareness WHERE user_id = ?')) return UNHANDLED_QUERY;
  const offset = params.at(-1);
  return { results: [...database.workflowAwareness.values()].filter((row) => row.user_id === params[0])
    .sort((left, right) => left.cycle_id.localeCompare(right.cycle_id))
    .slice(offset, offset + 10).map((row) => ({ id: row.cycle_id, data_json: row.data_json })) };
}

function listCustomProducts(database, sql, params) {
  if (sql.startsWith('SELECT * FROM custom_products WHERE user_id = ?')) {
    return { results: [...database.customProducts.values()].filter((row) => row.user_id === params[0]) };
  }
  if (!sql.startsWith('SELECT data_json FROM custom_products WHERE user_id = ?')) return UNHANDLED_QUERY;
  const offset = params.at(-1);
  return { results: [...database.customProducts.values()].filter((row) => row.user_id === params[0])
    .sort((left, right) => left.slot_id.localeCompare(right.slot_id)).slice(offset, offset + 10).map((row) => ({ data_json: row.data_json })) };
}

function listBillingCleanup(database, sql) {
  if (!sql.startsWith('SELECT stripe_customer_id, attempts FROM billing_cleanup_queue')) return UNHANDLED_QUERY;
  return { results: [...database.billingCleanupQueue.values()].map(({ customer_id, attempts = 0 }) => ({ stripe_customer_id: customer_id, attempts })) };
}

function listAll(database, sql, params) {
  const queries = [listMetrics, listCustomProductSlots, listRecords, listCloudCycles, listWorkflowRecords, listCustomProducts, listBillingCleanup];
  for (const query of queries) {
    const result = query(database, sql, params);
    if (result !== UNHANDLED_QUERY) return result;
  }
  return { results: [] };
}

function insertUser(database, sql, params) {
  const [clerk_id, email, legacy_uid, display_name, beta_access, migration_status, created_at, updated_at] = params;
  const emailOwner = [...database.users.values()].find((user) => user.email.toLowerCase() === String(email).toLowerCase() && user.clerk_id !== clerk_id);
  if (!database.users.has(clerk_id) && !emailOwner) {
    database.users.set(clerk_id, { clerk_id, email, legacy_uid, email_verified: 1, display_name, beta_access, migration_status, created_at, updated_at });
    return 1;
  }
  if (!sql.includes('ON CONFLICT DO NOTHING')) throw new Error('UNIQUE constraint failed: users.email');
  return 0;
}

class D1Mock {
  constructor() {
    this.users = new Map();
    this.settings = new Map();
    this.records = new Map();
    this.entitlements = new Map();
    this.metrics = new Map();
    this.cloudCycles = new Map();
    this.workflowAwareness = new Map();
    this.customProducts = new Map();
    this.failNextCustomProductSlotInsert = false;
    this.stripeEvents = new Map();
    this.metricEvents = new Set();
    this.billingCleanupQueue = new Map();
    this.batchSizes = [];
  }
  prepare(sql) { return new D1Statement(this, sql); }
  async batch(statements) {
    this.batchSizes.push(statements.length);
    const state = Object.fromEntries(['users', 'settings', 'records', 'entitlements', 'metrics', 'cloudCycles', 'workflowAwareness', 'customProducts', 'stripeEvents', 'billingCleanupQueue']
      .map((key) => [key, new Map([...this[key]].map(([id, value]) => [id, structuredClone(value)]))]));
    const metricEvents = new Set(this.metricEvents);
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    } catch (error) {
      for (const [key, value] of Object.entries(state)) this[key] = value;
      this.metricEvents = metricEvents;
      throw error;
    }
  }
  async first(sql, params) {
    for (const query of [firstUserQuery, firstAccountQuery, firstRecordQuery]) {
      const result = query(this, sql, params);
      if (result !== UNHANDLED_QUERY) return result;
    }
    return null;
  }
  async all(sql, params) {
    return listAll(this, sql, params);
  }
  async run(sql, params) {
    let changes = 1;
    if (sql.startsWith('INSERT INTO users')) {
      changes = insertUser(this, sql, params);
    } else if (sql.startsWith("UPDATE users SET migration_status = 'migrating'")) {
      const [updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { migration_status: 'migrating', updated_at });
    } else if (sql.startsWith('UPDATE users SET migration_status = ?, migrated_at')) {
      const [migration_status, migrated_at, updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { migration_status, migrated_at, updated_at });
    } else if (sql.startsWith('UPDATE users SET migration_status')) {
      const migration_status = params[0];
      const clerk_id = params.at(-1);
      const updated_at = params.at(-2);
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, {
        migration_status, updated_at,
        ...(sql.includes('legacy_uid = COALESCE') ? { legacy_uid: user.legacy_uid || params[1], ...(params[2] === 1 ? { beta_access: 1 } : {}) } : {}),
      });
    } else if (sql.startsWith('UPDATE users SET email')) {
      const [email, display_name, updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { email, display_name, updated_at, email_verified: 1 });
    } else if (sql.startsWith('UPDATE users SET beta_access')) {
      const [updated_at, clerk_id] = params;
      const user = this.users.get(clerk_id);
      if (user) Object.assign(user, { beta_access: 1, updated_at });
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_settings') || sql.startsWith('INSERT INTO user_settings')) {
      if (sql.includes('ON CONFLICT')) {
        const existing = JSON.parse(this.settings.get(params[0]) || '{}');
        this.settings.set(params[0], JSON.stringify({ ...JSON.parse(params[1]), ...existing }));
      } else if (!this.settings.has(params[0])) this.settings.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_entitlements') || sql.startsWith('INSERT INTO user_entitlements')) {
      if (sql.includes('json_patch')) {
        const existing = JSON.parse(this.entitlements.get(params[0]) || '{}');
        this.entitlements.set(params[0], JSON.stringify({ ...JSON.parse(params[1]), ...existing }));
      } else if (sql.includes('ON CONFLICT') || !this.entitlements.has(params[0])) this.entitlements.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO user_metrics') || sql.startsWith('INSERT INTO user_metrics')) {
      if (sql.includes('ON CONFLICT')) {
        const existing = JSON.parse(this.metrics.get(params[0]) || '{}');
        this.metrics.set(params[0], JSON.stringify({ ...JSON.parse(params[1]), ...existing }));
      } else if (!this.metrics.has(params[0])) this.metrics.set(params[0], params[1]);
    } else if (sql.startsWith('INSERT INTO cloud_cycles') || sql.startsWith('INSERT OR IGNORE INTO cloud_cycles')) {
      const [id, user_id, label, cycle_date, metadata_json, payload_json, payload_bytes, created_at, updated_at] = params;
      const key = `${user_id}:${id}`;
      const exists = this.cloudCycles.has(key);
      const limit = sql.includes('SELECT ?') ? params.at(-1) : Number.MAX_SAFE_INTEGER;
      const count = [...this.cloudCycles.values()].filter((row) => row.user_id === user_id && row.migration_import !== 1).length;
      if (sql.includes('SELECT ?') && !exists && count >= limit) return { meta: { changes: 0 } };
      if (!sql.startsWith('INSERT OR IGNORE') || !exists) {
        const previous = this.cloudCycles.get(key);
        const incomingMetadata = JSON.parse(metadata_json || '{}');
        const previousMetadata = previous ? JSON.parse(previous.metadata_json || '{}') : {};
        if (previous && sql.includes('ON CONFLICT')) incomingMetadata.createdAt = previousMetadata.createdAt;
        this.cloudCycles.set(key, { id, user_id, label, cycle_date, metadata_json: JSON.stringify(incomingMetadata), payload_json, payload_bytes,
          migration_import: sql.startsWith('INSERT OR IGNORE INTO cloud_cycles') ? 1 : previous?.migration_import || 0,
          created_at: previous?.created_at || created_at, updated_at });
      }
    } else if (sql.startsWith('UPDATE cloud_cycles SET label')) {
      const [label, updated_at, , , id, user_id] = params;
      const row = this.cloudCycles.get(`${user_id}:${id}`);
      if (row) {
        const metadata = JSON.parse(row.metadata_json || '{}');
        Object.assign(row, { label, updated_at, metadata_json: JSON.stringify({ ...metadata, label, updatedAt: updated_at }) });
      } else changes = 0;
    } else if (sql.startsWith('DELETE FROM cloud_cycles')) {
      const before = this.cloudCycles.size;
      if (params.length === 1) {
        for (const [key, row] of this.cloudCycles) if (row.user_id === params[0]) this.cloudCycles.delete(key);
      } else this.cloudCycles.delete(`${params[1]}:${params[0]}`);
      changes = before - this.cloudCycles.size;
    } else if (sql.startsWith('INSERT OR IGNORE INTO stripe_events')) {
      const [eventId, processedAt, status] = params;
      if (this.stripeEvents.has(eventId)) return { meta: { changes: 0 } };
      this.stripeEvents.set(eventId, { status, processed_at: processedAt });
      return { meta: { changes: 1 }, processed_at: processedAt };
    } else if (sql.startsWith('UPDATE stripe_events SET processed_at')) {
      const [processedAt, eventId, status, priorTimestamp] = params;
      const row = this.stripeEvents.get(eventId);
      if (row?.status === status && row.processed_at === priorTimestamp) row.processed_at = processedAt;
      else changes = 0;
    } else if (sql.startsWith('UPDATE stripe_events SET status')) {
      const [status, processed_at, eventId] = params;
      if (this.stripeEvents.has(eventId)) this.stripeEvents.set(eventId, { status, processed_at });
    } else if (sql.startsWith('DELETE FROM stripe_events')) {
      this.stripeEvents.delete(params[0]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO product_metric_events') || sql.startsWith('INSERT INTO product_metric_events')) {
      const [eventId, date, installation, type, userId] = params;
      requireMetricQuota(this.metricEvents, date, type, userId);
      this.metricEvents.add(`${eventId}:${date}:${installation}:${type}:${userId}`);
    } else if (sql.startsWith('INSERT OR IGNORE INTO billing_cleanup_queue')) {
      this.billingCleanupQueue.set(params[0], { customer_id: params[0], created_at: params[1], attempts: 0 });
    } else if (sql.startsWith('UPDATE billing_cleanup_queue')) {
      const [last_error, next_attempt_at, customer_id] = params;
      const row = this.billingCleanupQueue.get(customer_id);
      if (row) Object.assign(row, { attempts: row.attempts + 1, last_error, next_attempt_at });
    } else if (sql.startsWith('DELETE FROM billing_cleanup_queue')) {
      this.billingCleanupQueue.delete(params[0]);
    } else if (sql.startsWith('INSERT OR IGNORE INTO workflow_awareness') || sql.startsWith('INSERT INTO workflow_awareness')) {
      const [user_id, cycle_id, data_json] = params;
      if (Buffer.byteLength(data_json) > 750_000) throw new Error('workflow_awareness_too_large');
      this.workflowAwareness.set(`${user_id}:${cycle_id}`, { user_id, cycle_id, data_json, migration_import: sql.includes('migration_import') ? 1 : 0 });
    } else if (sql.startsWith('WITH slots(slot_id) AS (VALUES')) {
      const [user_id, product_id, data_json] = params;
      if (this.failNextCustomProductSlotInsert) {
        this.failNextCustomProductSlotInsert = false;
        throw new Error('UNIQUE constraint failed: custom_products.user_id, custom_products.slot_id');
      }
      if ([...this.customProducts.values()].some((row) => row.user_id === user_id && row.product_id === product_id)) {
        throw new Error('UNIQUE constraint failed: custom_products.user_id, custom_products.product_id');
      }
      if ([...this.customProducts.values()].filter((row) => row.user_id === user_id && row.migration_import !== 1).length >= params.at(-1)) return { meta: { changes: 0 } };
      const slotId = [
        ...Array.from({ length: 16 }, (_, index) => `product-${String(index + 1).padStart(2, '0')}`),
        ...Array.from({ length: 16 }, (_, index) => `active-${String(index + 1).padStart(2, '0')}`),
      ]
        .find((candidate) => !this.customProducts.has(`${user_id}:${candidate}`));
      if (!slotId) return { meta: { changes: 0 } };
      this.customProducts.set(`${user_id}:${slotId}`, { user_id, slot_id: slotId, product_id, data_json });
    } else if (sql.startsWith('INSERT OR IGNORE INTO custom_products')) {
      const [user_id, slot_id, product_id, data_json] = params;
      const duplicate = [...this.customProducts.values()].some((row) => row.user_id === user_id && (row.slot_id === slot_id || row.product_id === product_id));
      if (!duplicate) this.customProducts.set(`${user_id}:${slot_id}`, { user_id, slot_id, product_id, data_json, migration_import: 1 });
    } else if (sql.startsWith('UPDATE custom_products SET data_json')) {
      const [data_json, user_id, slot_id, product_id, expectedVersion] = params;
      const row = this.customProducts.get(`${user_id}:${slot_id}`);
      if (row && row.product_id === product_id && JSON.parse(row.data_json).version === expectedVersion) row.data_json = data_json;
      else changes = 0;
    } else if (sql.startsWith('DELETE FROM custom_products WHERE user_id = ? AND slot_id = ?')) {
      const [, user_id, slot_id, product_id] = [null, ...params];
      const key = `${user_id}:${slot_id}`;
      const row = this.customProducts.get(key);
      if (row && row.product_id === product_id) this.customProducts.delete(key);
      else changes = 0;
    } else if (sql.startsWith('INSERT INTO user_records')) {
      const [user_id, record_type, record_id, data_json, created_at, updated_at] = params;
      const key = `${user_id}:${record_type}:${record_id}`;
      if (sql.includes('SELECT ?')) {
        const count = [...this.records.values()].filter((record) => record.user_id === user_id && record.record_type === record_type).length;
        if (!this.records.has(key) && count >= params.at(-1)) return { meta: { changes: 0 } };
      }
      this.records.set(`${user_id}:${record_type}:${record_id}`, { user_id, record_type, record_id, data_json, created_at, updated_at });
    } else if (sql.startsWith('DELETE FROM user_records')) {
      const before = this.records.size;
      const [user_id, record_type, record_id] = params;
      if (record_type === undefined) {
        for (const [key, record] of this.records) if (record.user_id === user_id) this.records.delete(key);
      } else this.records.delete(`${user_id}:${record_type}:${record_id}`);
      changes = before - this.records.size;
    } else if (sql.startsWith('DELETE FROM user_settings')) {
      changes = Number(this.settings.has(params[0]));
      this.settings.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM user_entitlements')) {
      changes = Number(this.entitlements.has(params[0]));
      this.entitlements.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM user_metrics')) {
      changes = Number(this.metrics.has(params[0]));
      this.metrics.delete(params[0]);
    } else if (sql.startsWith('DELETE FROM workflow_awareness')) {
      for (const [key, row] of this.workflowAwareness) if (row.user_id === params[0]) this.workflowAwareness.delete(key);
    } else if (sql.startsWith('DELETE FROM custom_products')) {
      for (const [key, row] of this.customProducts) if (row.user_id === params[0]) this.customProducts.delete(key);
    } else if (sql.startsWith('DELETE FROM product_metric_events')) {
      for (const key of this.metricEvents) if (key.endsWith(`:${params[0]}`)) this.metricEvents.delete(key);
    } else if (sql.startsWith('DELETE FROM users')) {
      changes = Number(this.users.has(params[0]));
      this.users.delete(params[0]);
    } else {
      throw new Error(`Unhandled D1 mock SQL: ${sql}`);
    }
    return { meta: { changes } };
  }
}

function requireMetricQuota(metricEvents, date, type, userId) {
  if (['upgrades', 'cancellations'].includes(type)) return;
  const dayCount = [...metricEvents].filter((key) => {
    const fields = key.split(':');
    return fields.length === 5 && fields[1] === date && fields[4] === userId
      && !['upgrades', 'cancellations'].includes(fields[3]);
  }).length;
  if (dayCount >= 500) throw new Error('product_metric_daily_quota_reached');
}

export { D1Mock };
