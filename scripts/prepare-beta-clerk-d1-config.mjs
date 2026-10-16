import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repoRoot, 'cloudflare/wrangler.beta.clerk-d1.jsonc');
const generatedPath = path.join(repoRoot, 'cloudflare/wrangler.beta.clerk-d1.generated.jsonc');
const databaseId = process.env.BETA_D1_DATABASE_ID?.trim() || '';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error('BETA_D1_DATABASE_ID must contain the UUID returned by wrangler d1 create.');
}

let template;
try {
  template = await readFile(configPath, 'utf8');
} catch (error) {
  throw new Error(`Beta D1 config template not found at ${configPath}: ${error.message}`);
}
if (!template.includes('SET_AFTER_CREATING_BETA_D1')) throw new Error('Beta D1 config template is missing its database id marker.');
const generated = template.replaceAll('SET_AFTER_CREATING_BETA_D1', databaseId);
if (generated.includes('SET_AFTER_CREATING_BETA_D1')) throw new Error('Beta D1 config still contains an unresolved database id marker.');
await writeFile(generatedPath, generated, { encoding: 'utf8', mode: 0o600 });
await chmod(generatedPath, 0o600);
console.log(`Prepared ${generatedPath} using the configured beta D1 database id.`);
