const BETA_ORIGIN = process.env.BETA_ORIGIN ?? 'https://beta.gfcweather.com';
const EXPECTED_VERSION = process.env.EXPECTED_VERSION ?? '';

const fetchStatus = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  return { status: response.status, body: await response.text() };
};

const run = async () => {
  const homeUrl = `${BETA_ORIGIN.replace(/\/$/, '')}/`;
  const statusUrl = `${BETA_ORIGIN.replace(/\/$/, '')}/api/capabilities/status`;

  const home = await fetchStatus(homeUrl);
  if (home.status !== 200) {
    console.error(`::error::Beta home returned HTTP ${home.status} (expected 200).`);
    process.exit(1);
  }
  if (!home.body.includes('<!DOCTYPE html') && !home.body.includes('<html')) {
    console.error('::error::Beta home did not return HTML.');
    process.exit(1);
  }

  const api = await fetchStatus(statusUrl);
  if (api.status !== 200) {
    console.error(`::error::Beta API ${statusUrl} returned HTTP ${api.status} (expected 200).`);
    process.exit(1);
  }

  if (EXPECTED_VERSION) {
    const needle = `v${EXPECTED_VERSION}`;
    if (!home.body.includes(needle)) {
      console.error(`::error::Beta home HTML does not include ${needle}; the new bundle may not be live yet.`);
      process.exit(1);
    }
  }

  console.log(`Smoke test passed for ${BETA_ORIGIN}${EXPECTED_VERSION ? ` (version ${EXPECTED_VERSION})` : ''}.`);
};

run().catch((error) => {
  console.error(`::error::Smoke test failed: ${error.message}`);
  process.exit(1);
});
