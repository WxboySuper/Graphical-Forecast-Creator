import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PORTING_MANUAL_LABEL,
  isManualBetaPortPr,
  resolvePortTargets,
  shouldSkipPorting,
} from './port-targets.mjs';

describe('port targets', () => {
  it('ports hotfix merges on main to beta only', () => {
    assert.deepEqual(
      resolvePortTargets({ baseBranch: 'main', sourceBranch: 'hotfix/urgent' }),
      ['beta'],
    );
  });

  it('skips beta when post-merge owns main→beta sync', () => {
    assert.deepEqual(resolvePortTargets({ baseBranch: 'main', sourceBranch: 'beta' }), []);
    assert.deepEqual(
      resolvePortTargets({ baseBranch: 'main', sourceBranch: 'release/v1.0.0' }),
      [],
    );
    assert.deepEqual(
      resolvePortTargets({ baseBranch: 'main', sourceBranch: 'feature/release-infra' }),
      [],
    );
  });

  it('does not port on beta merges', () => {
    assert.deepEqual(
      resolvePortTargets({ baseBranch: 'beta', sourceBranch: 'feature/foo' }),
      [],
    );
  });

  it('detects manual beta port PR by matching head branch', () => {
    assert.equal(
      isManualBetaPortPr(
        { headRefName: 'hotfix/exposure-pr-labels-main', title: 'fix labels' },
        591,
        'hotfix/exposure-pr-labels-main',
      ),
      true,
    );
  });

  it('detects manual beta port PR by source PR reference', () => {
    assert.equal(
      isManualBetaPortPr(
        { headRefName: 'fix/port-to-beta', title: 'Port #591 to beta', body: '' },
        591,
        'hotfix/exposure-pr-labels-main',
      ),
      true,
    );
    assert.equal(
      isManualBetaPortPr(
        { headRefName: 'fix/port-to-beta', title: 'beta port', body: 'Ports PR #591 from main' },
        591,
        'hotfix/exposure-pr-labels-main',
      ),
      true,
    );
  });

  it('ignores automated port branches', () => {
    assert.equal(
      isManualBetaPortPr({ headRefName: 'port/591-to-beta', title: '[Port] foo' }, 591, 'hotfix/x'),
      false,
    );
  });

  it('skips when porting/manual label is present', () => {
    const result = shouldSkipPorting({
      labels: [PORTING_MANUAL_LABEL],
      sourcePrNumber: 10,
      sourceBranch: 'hotfix/x',
    });
    assert.equal(result.skip, true);
    assert.match(result.reason ?? '', /porting\/manual/);
  });

  it('skips when an open manual beta PR exists', () => {
    const result = shouldSkipPorting({
      openBetaPrs: [
        {
          number: 600,
          headRefName: 'hotfix/x',
          title: 'manual port',
          url: 'https://example.com/pull/600',
        },
      ],
      sourcePrNumber: 10,
      sourceBranch: 'hotfix/x',
    });
    assert.equal(result.skip, true);
    assert.equal(result.manualPr?.number, 600);
  });
});
