import { readFileSync } from 'node:fs';
import { resolveProductionDeployAction } from './lib/production-deploy-action.mjs';
import { normalizeProductionReleaseConfig } from '../server/lib/production-release.mjs';

const raw = JSON.parse(readFileSync('deploy/production-release.json', 'utf8'));
const config = normalizeProductionReleaseConfig(raw);
console.log(resolveProductionDeployAction(process.env.DEPLOY_ACTION, config.action));
