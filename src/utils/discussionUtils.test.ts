import { compileDiscussionToText } from './discussionUtils';

describe('discussionUtils', () => {
  type Discussion = {
    mode: 'diy' | 'guided';
    diyContent?: string;
    guidedContent?: { synopsis?: string; meteorologicalSetup?: string };
    validStart: string;
    validEnd: string;
    forecasterName: string;
  };

  test('compile DIY discussion includes content and forecaster', () => {
    const discussion: Discussion = {
      mode: 'diy',
      diyContent: 'Some content',
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Alice'
    };
    const text = compileDiscussionToText(discussion, 1);
    expect(text).toContain('Graphical Forecast Creator');
    expect(text).toContain('Some content');
    expect(text).toContain('Forecaster: Alice');
  });

  test('compile guided discussion includes sections', () => {
    const discussion: Discussion = {
      mode: 'guided',
      guidedContent: { synopsis: 'Syn', meteorologicalSetup: 'Setup' },
      validStart: new Date().toISOString(),
      validEnd: new Date().toISOString(),
      forecasterName: 'Bob'
    };
    const text = compileDiscussionToText(discussion, 2);
    expect(text).toContain('Synopsis:');
    expect(text).toContain('Syn');
    expect(text).toContain('Forecaster: Bob');
  });
});
