import { resolveFillClickStrategy } from './paintBucketMapInteraction';

describe('paintBucketMapInteraction', () => {
  test('shift-click forces step-down regardless of selected strategy', () => {
    expect(resolveFillClickStrategy('recategorize', true)).toBe('step-down');
    expect(resolveFillClickStrategy('subtract-overlap', true)).toBe('step-down');
    expect(resolveFillClickStrategy('step-up', false)).toBe('step-up');
  });
});
