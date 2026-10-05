import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  buildFirstLookSummaryBody,
  buildFirstLookUnavailableBody,
  findFirstLookSummaryComment,
  prepareFirstLookPublication,
  readFirstLookModelOutput,
  wrapFirstLookPublicationError,
} from './lib/opencode-first-look-publish.mjs';
import { buildGhApiSlurpPaginateArgs, parseGhApiPaginatedResponse } from './lib/gh-api-paginate.mjs';

const required = ['GITHUB_REPOSITORY', 'PULL_NUMBER', 'REVIEW_SHA', 'REVIEW_KIND', 'REVIEW_REQUEST_ID', 'OUTPUT_PATH', 'CONTEXT_PATH', 'GH_TOKEN'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required.`);

const repository = process.env.GITHUB_REPOSITORY;
const pullNumber = Number(process.env.PULL_NUMBER);
const expectedSha = process.env.REVIEW_SHA;
const reviewKind = process.env.REVIEW_KIND;
const requestId = process.env.REVIEW_REQUEST_ID;
const outputPath = process.env.OUTPUT_PATH;
const contextPath = process.env.CONTEXT_PATH;
const token = process.env.GH_TOKEN;

if (!Number.isInteger(pullNumber) || pullNumber < 1 || !/^[a-f0-9]{40}$/i.test(expectedSha)) {
  throw new Error('PULL_NUMBER or REVIEW_SHA is invalid.');
}

const apiEnv = { ...process.env, GH_TOKEN: token };
const ghApi = (method, route, fields = {}) => {
  const args = ['api', method, route];
  for (const [key, value] of Object.entries(fields)) {
    args.push('-f', `${key}=${value}`);
  }
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', env: apiEnv }));
};

const contextData = JSON.parse(readFileSync(contextPath, 'utf8'));
const pull = ghApi('GET', `repos/${repository}/pulls/${pullNumber}`);
if (pull.head.sha !== expectedSha) {
  process.stdout.write(`Discarding stale result for ${expectedSha}; current head is ${pull.head.sha}.\n`);
  process.exit(0);
}

const listIssueComments = () => parseGhApiPaginatedResponse(execFileSync(
  'gh',
  buildGhApiSlurpPaginateArgs(`repos/${repository}/issues/${pullNumber}/comments`),
  { encoding: 'utf8', env: apiEnv },
));

const comments = listIssueComments();
const summaryComment = findFirstLookSummaryComment(comments);

const publishBody = (body) => {
  if (body.length > 60_000) throw new Error(`First-look comment exceeds the 60,000-character publishing limit (${body.length}).`);
  if (summaryComment) {
    ghApi('PATCH', `repos/${repository}/issues/comments/${summaryComment.id}`, { body });
  } else {
    ghApi('POST', `repos/${repository}/issues/${pullNumber}/comments`, { body });
  }
};

try {
  const rawOutput = readFirstLookModelOutput(outputPath);
  const parsed = prepareFirstLookPublication(rawOutput, contextData);
  publishBody(buildFirstLookSummaryBody(parsed, contextData, { expectedSha, reviewKind, requestId }));
  process.stdout.write(`Published first-look review for PR #${pullNumber} at ${expectedSha}.\n`);
} catch (error) {
  const unavailable = wrapFirstLookPublicationError(error);
  publishBody(buildFirstLookUnavailableBody(contextData, unavailable.message, { expectedSha, reviewKind, requestId }));
  process.stderr.write(`${unavailable.message}\n`);
  process.exit(1);
}
