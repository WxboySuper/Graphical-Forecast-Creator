import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const eventName = process.env.GITHUB_EVENT_NAME ?? '';
const baseRef = process.env.GITHUB_BASE_REF ?? '';
const refName = process.env.GITHUB_REF_NAME ?? '';

const targetBranch = eventName === 'pull_request' ? baseRef : refName;

if (!targetBranch) {
  console.log('No target branch resolved; skipping package version policy check.');
  process.exit(0);
}

const hasBetaPrerelease = /-beta(\.|$)/i.test(version);

if (targetBranch === 'beta' && !hasBetaPrerelease) {
  console.error(
    `package.json version "${version}" must include a -beta prerelease on branch "${targetBranch}" ` +
      '(for example 1.6.0-beta.1).'
  );
  process.exit(1);
}

if (targetBranch === 'main' && hasBetaPrerelease) {
  console.error(
    `package.json version "${version}" must not include a -beta prerelease on branch "${targetBranch}".`
  );
  process.exit(1);
}

console.log(`package.json version "${version}" satisfies policy for branch "${targetBranch}".`);
