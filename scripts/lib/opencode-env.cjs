const GITHUB_CREDENTIAL_VARIABLES = [
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GH_PAT',
  'GH_ENTERPRISE_TOKEN',
  'ACTIONS_RUNTIME_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
];

const modelEnvironment = (source) => {
  const env = { ...source };
  for (const name of GITHUB_CREDENTIAL_VARIABLES) delete env[name];
  return env;
};

module.exports = { GITHUB_CREDENTIAL_VARIABLES, modelEnvironment };
