'use strict';

const rateLimit = require('express-rate-limit');
const { getAdminAuth, getAdminDb, hasFirebaseAdminConfig } = require('./firebase-admin');

const BETA_CLAIM_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many beta access attempts right now. Please wait a moment and try again.' },
});

/** True when this server is intentionally running the locked beta deployment. */
const isBetaModeEnabled = () => process.env.BETA_MODE === 'true';

/** Returns the configured beta invite token, or an empty string when unavailable. */
const getBetaInviteToken = () => process.env.BETA_INVITE_TOKEN || '';

/** Returns the optional beta invite path fragment used in invite URLs. */
const getBetaInvitePath = () => (process.env.BETA_INVITE_PATH || '').trim();

/** Returns the verified Firebase user for authenticated beta-claim requests. */
const verifyRequestUser = async (req) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const adminAuth = getAdminAuth();

  if (!adminAuth || !token) {
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
};

/** True when the beta-claim endpoint is ready to accept requests on this deployment. */
const isBetaClaimConfigured = () => hasFirebaseAdminConfig() && Boolean(getBetaInviteToken());

/** Sends the disabled/not-configured beta-claim response when applicable. */
const sendUnavailableBetaClaimResponse = (res) => {
  if (!isBetaModeEnabled()) {
    res.status(404).json({ error: 'Beta access claims are not enabled on this deployment.' });
    return true;
  }

  if (!isBetaClaimConfigured()) {
    res.status(503).json({ error: 'Beta invite claims are not configured on this deployment.' });
    return true;
  }

  return false;
};

/** True when the submitted invite token matches the configured server-side beta secret. */
const isValidInviteToken = (value) =>
  typeof value === 'string' && value.length > 0 && value === getBetaInviteToken();

/** True when the submitted invite-path segment matches the configured beta path, if any. */
const isValidInvitePath = (value) => {
  const expectedPath = getBetaInvitePath();
  if (!expectedPath) {
    return true;
  }

  return typeof value === 'string' && value.trim() === expectedPath;
};

/** Writes beta access onto the current user's hosted profile document. */
const grantBetaAccess = async (uid) => {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Firebase Admin is not configured for beta claims.');
  }

  await db.collection('userProfiles').doc(uid).set(
    {
      betaAccess: true,
      betaGrantedAt: new Date(),
      betaInviteSource: 'discord',
    },
    { merge: true }
  );
};

/** Handles one authenticated beta invite claim request. */
const handleBetaClaim = async (req, res) => {
  if (sendUnavailableBetaClaimResponse(res)) {
    return;
  }

  const decodedToken = await verifyRequestUser(req);
  if (!decodedToken) {
    res.status(401).json({ error: 'Missing or invalid Firebase ID token.' });
    return;
  }

  if (!isValidInviteToken(req.body?.token) || !isValidInvitePath(req.body?.invitePath)) {
    res.status(403).json({ error: 'That beta invite link is invalid or has expired.' });
    return;
  }

  await grantBetaAccess(decodedToken.uid);
  res.status(200).json({ success: true });
};

/** Registers the authenticated beta-claim endpoint used by the invite onboarding flow. */
const registerBetaRoutes = (app, express) => {
  app.post('/api/beta/claim', BETA_CLAIM_RATE_LIMIT, express.json({ limit: '1kb' }), async (req, res) => {
    try {
      await handleBetaClaim(req, res);
    } catch (error) {
      console.error('[beta] claim:error', error);
      res.status(500).json({ error: 'Unable to activate beta access right now.' });
    }
  });
};

module.exports = {
  registerBetaRoutes,
};
