'use strict';

const { getAdminAuth, hasFirebaseAdminConfig } = require('./firebase-admin');
const { getBearerToken } = require('./firebase-auth');

/** Verifies the Firebase identity attached to a billing request. */
const verifyRequestUser = async (req, res) => {
  const token = getBearerToken(req);
  const adminAuth = getAdminAuth();

  if (!adminAuth || !hasFirebaseAdminConfig()) {
    res.status(503).json({ error: 'Firebase Admin is not configured on this deployment.' });
    return null;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing Firebase ID token.' });
    return null;
  }

  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid Firebase ID token.' });
    return null;
  }
};

module.exports = { verifyRequestUser };
