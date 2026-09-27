import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFinalAssistantText, openCodeRunArguments } from './opencode-cli-output.mjs';
import { parseOpenCodeFirstLookOutput } from './opencode-first-look-output.mjs';

const textEvent = (messageID, text, id = `part-${messageID}`) => JSON.stringify({
  type: 'text',
  part: { type: 'text', id, messageID, text },
});

const context = { linkedIssues: [], openReviewThreads: [] };
const expected = {
  summary: ['Review complete.'],
  goodThings: [],
  badThings: [],
  rating: 8,
  linkedIssueAssessment: null,
  reviewCommentAssessments: [],
};

const stream = (...events) => events.join('\n');

test('builds OpenCode arguments with JSON event mode, the configured model, and auto mode', () => {
  assert.deepEqual(openCodeRunArguments('opencode-go/model', 'Review this PR.'), [
    'run', '--format', 'json', '--model', 'opencode-go/model', '--auto', 'Review this PR.',
  ]);
});

test('extracts plain-text workflow responses without imposing a JSON response format', () => {
  for (const response of ['NO_COMMENT', 'NEEDS_HUMAN: the issue is ambiguous', '## Investigation\nNo actionable finding.']) {
    assert.equal(extractFinalAssistantText(stream(textEvent('final', response))), response);
  }
});

test('keeps the latest snapshot of a text part and separates distinct parts', () => {
  const output = stream(
    textEvent('final', 'progress', 'progress-part'),
    textEvent('final', 'progress without newline', 'progress-part'),
    textEvent('final', JSON.stringify(expected), 'result-part'),
  );
  assert.equal(extractFinalAssistantText(output), `progress without newline\n${JSON.stringify(expected)}`);
  assert.deepEqual(parseOpenCodeFirstLookOutput(extractFinalAssistantText(output, { format: 'json' }), context), expected);
});

test('accepts pretty-printed JSON after progress and fenced JSON after progress', () => {
  const prettyJson = JSON.stringify(expected, null, 2);
  const prefixed = `First-look review underway.\nChecking surrounding code.\n${prettyJson}`;
  assert.deepEqual(parseOpenCodeFirstLookOutput(extractFinalAssistantText(stream(textEvent('final', prefixed)), { format: 'json' }), context), expected);

  const fenced = 'Review complete.\n' + String.fromCharCode(96).repeat(3) + 'json\n' + prettyJson + '\n' + String.fromCharCode(96).repeat(3);
  assert.deepEqual(parseOpenCodeFirstLookOutput(extractFinalAssistantText(stream(textEvent('final', fenced)), { format: 'json' }), context), expected);
});

test('selects the final assistant message instead of earlier progress messages', () => {
  const output = stream(
    textEvent('progress-1', 'First-look review underway.'),
    textEvent('progress-2', 'Now checking tests and surrounding code.'),
    JSON.stringify({ type: 'step_finish', part: { type: 'step-finish' } }),
    textEvent('final', JSON.stringify(expected)),
  );
  assert.deepEqual(parseOpenCodeFirstLookOutput(extractFinalAssistantText(output, { format: 'json' }), context), expected);
});

test('rejects malformed event streams, missing assistant text, and invalid first-look JSON', () => {
  assert.throws(() => extractFinalAssistantText('progress\nnot json'), /invalid JSON event stream/);
  assert.throws(() => extractFinalAssistantText('{"type":"step_finish"}'), /no assistant text/);
  assert.throws(() => parseOpenCodeFirstLookOutput(extractFinalAssistantText(stream(textEvent('final', 'No JSON was returned.')), { format: 'json' }), context), /did not contain a JSON object/);
  assert.throws(() => parseOpenCodeFirstLookOutput(extractFinalAssistantText(stream(textEvent('final', '{"summary":[]}\nThis is not the final object.')), { format: 'json' }), context), /did not contain a JSON object/);
  assert.throws(() => extractFinalAssistantText(''), /no output/);
});
