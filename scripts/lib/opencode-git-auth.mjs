/** Build a one-command Git HTTP authorization setting for GitHub. */
export const githubHttpExtraHeader = (token) => {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('A GitHub token is required to authenticate Git operations.');
  }
  const authorization = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  return `http.https://github.com/.extraheader=${authorization}`;
};
