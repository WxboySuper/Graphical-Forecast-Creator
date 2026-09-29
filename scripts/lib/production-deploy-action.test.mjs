import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProductionDeployAction,
  resolveProductionDeployAction,
} from './production-deploy-action.mjs';

describe('production deploy action resolution', () => {
  it('turns auto into an empty override', () => {
    assert.equal(normalizeProductionDeployAction(' auto '), '');
  });

  it('uses the manifest action when auto is selected', () => {
    assert.equal(resolveProductionDeployAction('auto', 'stage'), 'stage');
  });

  it('preserves explicit actions', () => {
    assert.equal(resolveProductionDeployAction(' live ', 'stage'), 'live');
    assert.equal(resolveProductionDeployAction('none', 'live'), 'none');
  });

  it('defaults to live when neither input nor manifest has an action', () => {
    assert.equal(resolveProductionDeployAction('', ''), 'live');
  });
});
