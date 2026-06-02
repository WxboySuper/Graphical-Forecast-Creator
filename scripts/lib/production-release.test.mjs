/**
 * Unit tests for production release manifest validation and banner derivation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAlertBannerFile,
  isDuplicateStageDeploy,
  isSafeBannerLinkUrl,
  isWithinScheduleWindow,
  normalizeProductionReleaseConfig,
  resolveActiveBannerPhase,
  sanitizeBannerLinkUrl,
  validateProductionReleaseForDeploy,
} from '../../server/lib/production-release.mjs';

const NOW = Date.parse('2026-06-01T12:00:00.000Z');
const ROLLOUT = '2026-06-06T23:00:00.000Z';

const STAGE_BANNER = {
  phases: [
    { message: 'Soon', type: 'warning', expiresAt: ROLLOUT },
    { message: 'Live', type: 'info', startsAt: ROLLOUT },
  ],
};

/**
 * Builds a normalized stage-deploy manifest for tests.
 * @param {Record<string, unknown>} [overrides] Fields merged into the default stage manifest.
 * @returns {ReturnType<typeof normalizeProductionReleaseConfig>}
 */
function stageConfig(overrides = {}) {
  return normalizeProductionReleaseConfig({
    releaseId: 'v1.6.0',
    version: '1.6.0',
    rolloutAt: ROLLOUT,
    action: 'stage',
    status: 'scheduled',
    banner: STAGE_BANNER,
    ...overrides,
  });
}

/**
 * Runs validateProductionReleaseForDeploy for a stage action at the fixed test time.
 * @param {ReturnType<typeof normalizeProductionReleaseConfig>} config
 * @param {Record<string, unknown>} [extra] Additional validator options (e.g. previousVpsStatus).
 * @returns {ReturnType<typeof validateProductionReleaseForDeploy>}
 */
function validateStage(config, extra = {}) {
  return validateProductionReleaseForDeploy({
    config,
    packageVersion: '1.6.0',
    deployAction: 'stage',
    nowMs: NOW,
    ...extra,
  });
}

describe('production-release', () => {
  it('isWithinScheduleWindow respects bounds', () => {
    assert.equal(isWithinScheduleWindow(undefined, undefined, NOW), true);
    assert.equal(isWithinScheduleWindow('2026-06-01T13:00:00.000Z', undefined, NOW), false);
    assert.equal(isWithinScheduleWindow(undefined, '2026-06-01T12:00:00.000Z', NOW), false);
  });

  it('resolveActiveBannerPhase picks first matching phase', () => {
    const phases = [
      {
        id: 'pre',
        message: 'Soon',
        type: 'warning',
        expiresAt: ROLLOUT,
      },
      {
        id: 'live',
        message: 'Live',
        type: 'info',
        startsAt: ROLLOUT,
      },
    ];
    assert.equal(resolveActiveBannerPhase(phases, NOW)?.id, 'pre');
    assert.equal(resolveActiveBannerPhase(phases, Date.parse(ROLLOUT))?.id, 'live');
  });

  it('deriveAlertBannerFile live-pre-promote filters post-rollout phases', () => {
    const config = normalizeProductionReleaseConfig({
      releaseId: 'v1.6.0',
      version: '1.6.0',
      rolloutAt: ROLLOUT,
      action: 'stage',
      banner: {
        phases: [
          { id: 'pre', message: 'Soon', type: 'warning', expiresAt: ROLLOUT },
          { id: 'live', message: 'Live', type: 'info', startsAt: ROLLOUT, linkUrl: '/updates' },
        ],
      },
    });

    const banner = deriveAlertBannerFile(config, { nowMs: NOW, surface: 'live-pre-promote' });
    assert.equal(banner.enabled, true);
    assert.equal(banner.message, 'Soon');
  });

  it('validateProductionReleaseForDeploy requires future rolloutAt for stage', () => {
    const result = validateStage(stageConfig({ rolloutAt: '2026-06-01T12:01:00.000Z' }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('rolloutAt')));
  });

  it('validateProductionReleaseForDeploy passes a valid stage manifest', () => {
    const result = validateStage(
      stageConfig({
        banner: {
          phases: [
            { message: 'Soon', type: 'warning', expiresAt: ROLLOUT },
            { message: 'Live', type: 'info', startsAt: ROLLOUT, linkUrl: '/updates' },
          ],
        },
      }),
    );
    assert.equal(result.ok, true);
  });

  it('isDuplicateStageDeploy uses VPS status not local manifest status', () => {
    assert.equal(
      isDuplicateStageDeploy({
        releaseId: 'v1.6.0',
        previousReleaseId: 'v1.6.0',
        previousVpsStatus: 'staged',
      }),
      true,
    );
    assert.equal(
      isDuplicateStageDeploy({
        releaseId: 'v1.6.0',
        previousReleaseId: 'v1.6.0',
        previousVpsStatus: 'scheduled',
        force: false,
      }),
      false,
    );
  });

  it('validateProductionReleaseForDeploy blocks duplicate stage when VPS is staged', () => {
    const result = validateStage(stageConfig(), {
      previousReleaseId: 'v1.6.0',
      previousVpsStatus: 'staged',
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('already staged')));
  });

  it('rejects unsafe banner linkUrl schemes at validation time', () => {
    const config = stageConfig({
      banner: {
        phases: [
          {
            message: 'Soon',
            type: 'warning',
            expiresAt: ROLLOUT,
            linkUrl: 'javascript:alert(1)',
          },
          { message: 'Live', type: 'info', startsAt: ROLLOUT },
        ],
      },
    });
    const result = validateStage(config);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('linkUrl')));
  });

  it('sanitizeBannerLinkUrl strips javascript URLs', () => {
    assert.equal(sanitizeBannerLinkUrl('javascript:alert(1)'), undefined);
    assert.equal(isSafeBannerLinkUrl('https://example.com'), true);
  });

  it('validateProductionReleaseForDeploy blocks live deploy when VPS has staged rollout', () => {
    const config = normalizeProductionReleaseConfig({
      releaseId: 'hotfix-1',
      version: '1.6.0',
      action: 'live',
      status: 'live',
    });
    const result = validateProductionReleaseForDeploy({
      config,
      packageVersion: '1.6.0',
      deployAction: 'live',
      nowMs: NOW,
      previousVpsStatus: 'staged',
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('staged release is already waiting')));
  });
});
