import { resolvePaintBucketEditAction } from '../../utils/paintBucket/outlookScope';

describe('paintBucketMapInteraction helpers', () => {
  test('assign mode ignores shift and always recategorizes', () => {
    expect(resolvePaintBucketEditAction('assign', true)).toBe('recategorize');
    expect(resolvePaintBucketEditAction('assign', false)).toBe('recategorize');
  });

  test('step mode uses shift for step-down', () => {
    expect(resolvePaintBucketEditAction('step', false)).toBe('step-up');
    expect(resolvePaintBucketEditAction('step', true)).toBe('step-down');
  });

  test('step mode supports a visible down direction for touch input', () => {
    expect(resolvePaintBucketEditAction('step', false, 'down')).toBe('step-down');
    expect(resolvePaintBucketEditAction('assign', false, 'down')).toBe('recategorize');
  });
});
