import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFinalAssistantText, openCodeRunArguments } from './opencode-cli-output.mjs';
import { parseOpenCodeFirstLookOutput } from './opencode-first-look-output.mjs';

const textEvent = (messageID, text) => JSON.stringify({
  type: 'text',
  part: { type: 'text', messageID, text },
});

test('builds OpenCode arguments with JSON mode, the configured model, and auto mode', () => {
  assert.deepEqual(openCodeRunArguments('opencode-go/model', 'Review this PR.'), [
    'run', '--format', 'json', '--model', 'opencode-go/model', '--auto', 'Review this PR.',
  ]);
});

test('selects the final assistant response instead of intermediate progress messages', () => {
  const context = { linkedIssues: [], openReviewThreads: [] };
  const expected = {
    summary: ['Review complete.'],
    goodThings: [],
    badThings: [],
    rating: 8,
    linkedIssueAssessment: null,
    reviewCommentAssessments: [],
  };
  const output = [
    textEvent('progress-1', 'First-look review underway.'),
    textEvent('progress-2', 'Now checking tests and surrounding code.'),
    JSON.stringify({ type: 'step_finish', part: { type: 'step-finish' } }),
    textEvent('final', '{"summary":["Review complete."],"goodThings":[],"badThings":[],'),
    textEvent('final', '"rating":8,"linkedIssueAssessment":null,"reviewCommentAssessments":[]}'),
  ].join('\n');

  const parsed = parseOpenCodeFirstLookOutput(extractFinalAssistantText(output), context);
  assert.deepEqual(parsed, expected);
});

test('removes progress lines even when OpenCode emits them in the final text message', () => {
  const context = { linkedIssues: [], openReviewThreads: [] };
  const expected = {
    summary: ['Review complete.'],
    goodThings: [],
    badThings: [],
    rating: 8,
    linkedIssueAssessment: null,
    reviewCommentAssessments: [],
  };
  const finalJson = JSON.stringify(expected);
  const output = textEvent('final', `First-look review underway.\nChecking surrounding code.\n${finalJson}`);

  assert.deepEqual(parseOpenCodeFirstLookOutput(extractFinalAssistantText(output), context), expected);
});

test('rejects malformed event streams and streams without assistant text', () => {
  assert.throws(() => extractFinalAssistantText('progress\nnot json'), /invalid JSON event stream/);
  assert.throws(() => extractFinalAssistantText('{"type":"step_finish"}'), /no assistant text/);
  assert.throws(() => extractFinalAssistantText(textEvent('final', 'No JSON was returned.')), /did not end with a JSON object/);
  assert.throws(() => extractFinalAssistantText(textEvent('final', '{"summary":[]}\nThis is not the final object.')), /did not end with a JSON object/);
  assert.throws(() => extractFinalAssistantText(''), /no output/);
});
