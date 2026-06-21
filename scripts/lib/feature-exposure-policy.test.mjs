import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFeatureExposurePolicy } from './feature-exposure-policy.mjs';

const ALL_OFF = { local: false, beta: false, staging: false, production: false };
const ALL_ON = { local: true, beta: true, staging: true, production: true };

const validRegistry = {
  coreFeature: {
    exposure: { ...ALL_ON },
    owner: 'test',
    addedDate: '2026-06-20',
    temporary: false,
    serverBacked: false,
    trackingIssue: 100,
  },
  betaFeature: {
    exposure: { ...ALL_OFF },
    owner: 'test',
    addedDate: '2026-06-21',
    temporary: true,
    removalCondition: 'Remove after launch.',
    serverBacked: false,
    trackingIssue: 200,
  },
};

const emptySurfaces = { gatedRoutes: [], navigationItems: [] };

describe('feature exposure policy', () => {
  it('passes for a valid registry with no surface references', () => {
    const result = evaluateFeatureExposurePolicy(validRegistry, emptySurfaces);
    assert.equal(result.ok, true);
  });

  it('fails when exposure matrix is missing a target', () => {
    const registry = {
      bad: {
        exposure: { local: false, beta: false },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /staging/.test(e)));
    assert.ok(result.errors.some((e) => /production/.test(e)));
  });

  it('fails when addedDate is invalid', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-13-40',
        temporary: false,
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /addedDate/.test(e)));
  });

  it('fails when temporary feature has no removalCondition', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: true,
        removalCondition: '   ',
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /removalCondition/.test(e)));
  });

  it('fails when server-backed feature has no capability key', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /serverCapabilityKey/.test(e)));
  });

  it('fails when non-server-backed feature has a capability key', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        serverCapabilityKey: 'SOME_KEY',
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /must not declare serverCapabilityKey/.test(e)));
  });

  it('fails when feature is missing trackingIssue', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /trackingIssue/.test(e)));
  });

  it('fails when trackingIssue is not a positive number', () => {
    const registry = {
      bad: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        trackingIssue: -5,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /trackingIssue/.test(e)));
  });

  it('fails when gated route references unknown feature', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'nonExistent', path: '/foo', loadPage: () => {} }],
      navigationItems: [],
    };
    const result = evaluateFeatureExposurePolicy(validRegistry, surfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /nonExistent/.test(e) && /does not exist/.test(e)));
  });

  it('fails when navigation item references unknown feature', () => {
    const surfaces = {
      gatedRoutes: [],
      navigationItems: [{ id: 'foo', to: '/foo', label: 'Foo', feature: 'nonExistent' }],
    };
    const result = evaluateFeatureExposurePolicy(validRegistry, surfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /nonExistent/.test(e) && /does not exist/.test(e)));
  });

  it('passes when surface references match registry keys', () => {
    const surfaces = {
      gatedRoutes: [{ feature: 'betaFeature', path: '/beta', loadPage: () => {} }],
      navigationItems: [{ id: 'nav', to: '/nav', label: 'Nav', feature: 'betaFeature' }],
    };
    const result = evaluateFeatureExposurePolicy(validRegistry, surfaces);
    assert.equal(result.ok, true);
  });

  it('fails when server-backed feature capability key is not in server list', () => {
    const registry = {
      backed: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        serverCapabilityKey: 'MY_FEATURE_ENABLED',
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces, []);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /MY_FEATURE_ENABLED/.test(e) && /server capability keys/.test(e)));
  });

  it('passes when server-backed feature capability key matches server list', () => {
    const registry = {
      backed: {
        exposure: { ...ALL_OFF },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: true,
        serverCapabilityKey: 'MY_FEATURE_ENABLED',
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces, ['MY_FEATURE_ENABLED']);
    assert.equal(result.ok, true);
  });

  it('fails when temporary feature is exposed on production', () => {
    const registry = {
      prod: {
        exposure: { local: true, beta: true, staging: true, production: true },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: true,
        removalCondition: 'Remove after launch.',
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /prod/.test(e) && /production/.test(e)));
  });

  it('allows permanent features exposed on production', () => {
    const registry = {
      prod: {
        exposure: { local: true, beta: true, staging: true, production: true },
        owner: 'test',
        addedDate: '2026-06-20',
        temporary: false,
        serverBacked: false,
        trackingIssue: 1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, true);
  });

  it('fails with multiple errors at once', () => {
    const registry = {
      bad: {
        exposure: {},
        owner: '',
        addedDate: 'not-a-date',
        temporary: true,
        removalCondition: '',
        serverBacked: true,
        trackingIssue: -1,
      },
    };
    const result = evaluateFeatureExposurePolicy(registry, emptySurfaces);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 1);
  });

  it('passes for the current production registry shape', () => {
    const currentRegistry = {
      exportMap: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      saveLoad: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      tornadoOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      windOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      hailOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      categoricalOutlook: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      significantThreats: { exposure: { ...ALL_ON }, owner: 'WxboySuper', addedDate: '2026-06-21', temporary: false, serverBacked: false, trackingIssue: 440 },
      autoTstm: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Enable on beta.', serverBacked: true, serverCapabilityKey: 'TSTM_GENERATION_ENABLED', trackingIssue: 427 },
      forecastWorkflowV2: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after v2.', serverBacked: false, trackingIssue: 429 },
      verificationRelaunch: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after relaunch.', serverBacked: false, trackingIssue: 430 },
      customProducts: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after ship.', serverBacked: false, trackingIssue: 431 },
      tropicalWorkspace: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Keep disabled.', serverBacked: false, trackingIssue: 432 },
      collaborationRoom: { exposure: { ...ALL_OFF }, owner: 'WxboySuper', addedDate: '2026-06-20', temporary: true, removalCondition: 'Remove after ship.', serverBacked: false, trackingIssue: 433 },
    };
    const surfaces = {
      gatedRoutes: [
        { feature: 'tropicalWorkspace', path: 'tropical' },
        { feature: 'collaborationRoom', path: 'collaborate' },
      ],
      navigationItems: [
        { id: 'tropical', feature: 'tropicalWorkspace' },
        { id: 'collab', feature: 'collaborationRoom' },
      ],
    };
    const result = evaluateFeatureExposurePolicy(currentRegistry, surfaces, ['TSTM_GENERATION_ENABLED']);
    assert.equal(result.ok, true);
  });
});
