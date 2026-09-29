import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstLookRepairPrompt } from './opencode-first-look-retry.mjs';

test('repair task identifies every open thread and prior finding after an incomplete first response', () => {
  const prompt = buildFirstLookRepairPrompt('First-look output must assess every supplied open review thread.', {
    openReviewThreads: [
      { id: 'PRRT_thread_one', path: '.github/workflows/changelog.yml', line: 24 },
      { id: 'PRRT_thread_two', path: 'scripts/runner.mjs', line: null },
    ],
    priorFindings: [{ findingId: 'P1:scripts/runner.mjs:24:missing state guard' }],
  });

  assert.match(prompt, /PRRT_thread_one \(\.github\/workflows\/changelog\.yml:24\)/);
  assert.match(prompt, /PRRT_thread_two \(scripts\/runner\.mjs\)/);
  assert.match(prompt, /P1:scripts\/runner\.mjs:24:missing state guard/);
  assert.match(prompt, /investigating the attached PR context and repository as needed/);
});
