/**
 * Post-deploy smoke checks for the beta site (HTML shell, API status, optional version.json).
 */
const BETA_ORIGIN = process.env.BETA_ORIGIN ?? 'https://beta.gfcweather.com';
const EXPECTED_VERSION = process.env.EXPECTED_VERSION ?? '';
const MAX_ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS ?? 6);
const RETRY_DELAY_MS = Number(process.env.SMOKE_RETRY_DELAY_MS ?? 10_000);

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {string} url */
const fetchStatus = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  return { status: response.status, body: await response.text() };
};

/** @param {{ status: number; body: string }} home */
const assertHomePage = (home) => {
  if (home.status !== 200) {
    throw new Error(`Beta home returned HTTP ${home.status} (expected 200).`);
  }
  if (!home.body.includes('<!DOCTYPE html') && !home.body.includes('<html')) {
    throw new Error('Beta home did not return HTML.');
  }
};

/** @param {{ status: number }} api @param {string} statusUrl */
const assertCapabilitiesStatus = (api, statusUrl) => {
  if (api.status !== 200) {
    throw new Error(`Beta API ${statusUrl} returned HTTP ${api.status} (expected 200).`);
  }
};

/** @param {{ status: number; body: string }} versionResponse */
const assertDeployedVersion = (versionResponse) => {
  if (versionResponse.status !== 200) {
    throw new Error(`version.json returned HTTP ${versionResponse.status} (expected 200).`);
  }
  let payload;
  try {
    payload = JSON.parse(versionResponse.body);
  } catch {
    throw new Error('version.json is not valid JSON.');
  }
  if (payload.version !== EXPECTED_VERSION) {
    throw new Error(`version.json has ${payload.version ?? 'no version'}; expected ${EXPECTED_VERSION}.`);
  }
};

/** Hit beta origin endpoints once; throws when any assertion fails. */
const checkOnce = async () => {
  const origin = BETA_ORIGIN.replace(/\/$/, '');
  const homeUrl = `${origin}/`;
  const statusUrl = `${origin}/api/capabilities/status`;
  const versionUrl = `${origin}/version.json`;

  assertHomePage(await fetchStatus(homeUrl));
  assertCapabilitiesStatus(await fetchStatus(statusUrl), statusUrl);

  if (EXPECTED_VERSION) {
    assertDeployedVersion(await fetchStatus(versionUrl));
  }
};

/** Retry smoke checks until success or attempts are exhausted. */
const run = async () => {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await checkOnce();
      console.log(
        `Smoke test passed for ${BETA_ORIGIN}${EXPECTED_VERSION ? ` (version ${EXPECTED_VERSION})` : ''} on attempt ${attempt}.`,
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Smoke attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}; retrying in ${RETRY_DELAY_MS}ms…`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  console.error(`::error::Smoke test failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`);
  process.exit(1);
};

run().catch((error) => {
  console.error(`::error::Smoke test failed: ${error.message}`);
  process.exit(1);
});
