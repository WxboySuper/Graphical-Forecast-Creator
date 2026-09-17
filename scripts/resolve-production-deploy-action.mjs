import { readFileSync } from 'node:fs';
import { resolveProductionDeployAction } from './lib/production-deploy-action.mjs';

const raw = JSON.parse(readFileSync('deploy/production-release.json', 'utf8'));
console.log(resolveProductionDeployAction(process.env.DEPLOY_ACTION, raw.action));
