import test from 'node:test';
import assert from 'node:assert/strict';
import { isEligibleFirstLookPull } from './opencode-first-look-eligibility.mjs';

const repository = { owner: 'WxboySuper', repo: 'Graphical-Forecast-Creator' };
const pull = (overrides = {}) => ({
  author_association: 'CONTRIBUTOR',
  user: { login: 'dependabot[bot]' },
  head: {
    ref: 'dependabot/npm_and_yarn/main/example-1.2.3',
    repo: { full_name: 'WxboySuper/Graphical-Forecast-Creator' },
  },
  draft: false,
  ...overrides,
});

test('allows same-repository Dependabot PRs on Dependabot branches', () => {
  assert.equal(isEligibleFirstLookPull(pull(), repository), true);
});

test('rejects Dependabot PRs from forks or non-Dependabot branches', () => {
  assert.equal(isEligibleFirstLookPull(pull({
    head: { ref: 'dependabot/npm_and_yarn/main/example-1.2.3', repo: { full_name: 'attacker/fork' } },
  }), repository), false);
  assert.equal(isEligibleFirstLookPull(pull({
    head: { ref: 'feature/untrusted', repo: { full_name: 'WxboySuper/Graphical-Forecast-Creator' } },
  }), repository), false);
});

test('continues to reject other untrusted authors and draft PRs', () => {
  assert.equal(isEligibleFirstLookPull(pull({ user: { login: 'untrusted-user' } }), repository), false);
  assert.equal(isEligibleFirstLookPull(pull({ draft: true }), repository), false);
});

test('keeps the audit issue worker exception scoped to its generated branch', () => {
  assert.equal(isEligibleFirstLookPull(pull({
    user: { login: 'github-actions[bot]' },
    head: { ref: 'opencode/audit-42-100-1', repo: { full_name: 'WxboySuper/Graphical-Forecast-Creator' } },
  }), repository), true);
  assert.equal(isEligibleFirstLookPull(pull({
    user: { login: 'github-actions[bot]' },
    head: { ref: 'feature/untrusted', repo: { full_name: 'WxboySuper/Graphical-Forecast-Creator' } },
  }), repository), false);
});
