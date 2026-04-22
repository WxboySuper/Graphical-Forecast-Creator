import { compileDiscussionToText } from './discussionUtils';

describe('discussionUtils', () => {
  test('compile DIY discussion includes content and forecaster', () => {
    const discussion = {
      mode: 'diy',
      diyContent: 'Some content',
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Alice'
    } as any;
    const text = compileDiscussionToText(discussion, 1);
    expect(text).toContain('Graphical Forecast Creator');
    expect(text).toContain('Some content');
    expect(text).toContain('Forecaster: Alice');
  });

  test('compile guided discussion includes sections', () => {
    const discussion = {
      mode: 'guided',
      guidedContent: { synopsis: 'Syn', meteorologicalSetup: 'Setup' },
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Bob'
    } as any;
    const text = compileDiscussionToText(discussion, 2);
    expect(text).toContain('Synopsis:');
    expect(text).toContain('Syn');
    expect(text).toContain('Forecaster: Bob');
  });
});
