'use strict';

const { getAdminAuth } = require('./firebase-admin');

/** Returns the bearer token supplied by a request, or an empty string. */
const getBearerToken = (req) => {
  const authHeader = req?.headers?.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
};

/** Verifies a Firebase ID token and returns null for missing or invalid credentials. */
const verifyFirebaseToken = async (req, checkRevoked = false, adminAuth = getAdminAuth()) => {
  const token = getBearerToken(req);
  if (!adminAuth || !token) return null;
  try {
    return await adminAuth.verifyIdToken(token, checkRevoked);
  } catch {
    return null;
  }
};

module.exports = { getBearerToken, verifyFirebaseToken };
