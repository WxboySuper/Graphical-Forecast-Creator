'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const USERS_FILE = process.env.LOCAL_AUTH_USERS_FILE || path.join(__dirname, 'local-users.json');
const SESSION_COOKIE = 'gfc_local_session';
const LOCAL_AUTH_RATE_LIMIT = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many local auth requests right now. Please wait a moment and try again.' },
});

const DEFAULT_GHOST_OUTLOOKS = {
  tornado: false,
  wind: false,
  hail: false,
  categorical: false,
  totalSevere: false,
  'day4-8': false,
};

const createDefaultSettings = (email = '') => ({
  darkMode: false,
  baseMapStyle: 'osm',
  stateBorders: true,
  counties: false,
  ghostOutlooks: DEFAULT_GHOST_OUTLOOKS,
  defaultForecasterName: email.split('@')[0] || '',
  forecastUiVariant: 'workspace_dock',
});

const readCookie = (req, name) => {
  const cookieHeader = req.headers.cookie || '';
  const parts = cookieHeader.split(';').map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
};

const readUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return { users: [], sessions: {} };
  }
};

const writeUsers = (data) => {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
};

const createSession = (data, uid) => {
  const sessionId = crypto.randomUUID();
  data.sessions[sessionId] = { uid, createdAt: new Date().toISOString() };
  return sessionId;
};

const toPublicUser = (user) => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName || '',
  betaAccess: Boolean(user.betaAccess),
  settings: user.settings,
});

const getCurrentUser = (req) => {
  const data = readUsers();
  const sessionId = readCookie(req, SESSION_COOKIE);
  const uid = data.sessions?.[sessionId]?.uid;
  const user = data.users.find((entry) => entry.uid === uid);
  return { data, sessionId, user };
};

const setSessionCookie = (res, sessionId) => {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
};

const handleProfileGet = (req, res) => {
  const { user } = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ message: 'Not signed in.' });
    return;
  }

  res.json(toPublicUser(user));
};

const handleSignUp = (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required.' });
    return;
  }

  const data = readUsers();
  if (data.users.some((user) => user.email === email)) {
    res.status(409).json({ message: 'A local account already exists for that email.' });
    return;
  }

  const user = {
    uid: `local-${crypto.randomUUID()}`,
    email,
    password,
    displayName: email.split('@')[0],
    betaAccess: true,
    settings: createDefaultSettings(email),
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  const sessionId = createSession(data, user.uid);
  writeUsers(data);
  setSessionCookie(res, sessionId);
  res.json(toPublicUser(user));
};

const handleSignIn = (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const data = readUsers();
  const user = data.users.find((entry) => entry.email === email && entry.password === password);

  if (!user) {
    res.status(401).json({ message: 'Invalid email or password.' });
    return;
  }

  const sessionId = createSession(data, user.uid);
  writeUsers(data);
  setSessionCookie(res, sessionId);
  res.json(toPublicUser(user));
};

const handleSignOut = (req, res) => {
  const data = readUsers();
  const sessionId = readCookie(req, SESSION_COOKIE);
  if (sessionId && data.sessions) {
    delete data.sessions[sessionId];
    writeUsers(data);
  }
  clearSessionCookie(res);
  res.json({ success: true });
};

const handleProfileUpdate = (req, res) => {
  const { data, user } = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ message: 'Not signed in.' });
    return;
  }

  user.settings = {
    ...createDefaultSettings(user.email),
    ...(user.settings || {}),
    ...(req.body?.settings || {}),
  };
  writeUsers(data);
  res.json(toPublicUser(user));
};

const registerLocalAuthRoutes = (app, express) => {
  const jsonBody = express.json({ limit: '8kb' });
  app.get('/api/local/profile', LOCAL_AUTH_RATE_LIMIT, handleProfileGet);
  app.post('/api/local/signup', LOCAL_AUTH_RATE_LIMIT, jsonBody, handleSignUp);
  app.post('/api/local/signin', LOCAL_AUTH_RATE_LIMIT, jsonBody, handleSignIn);
  app.post('/api/local/signout', LOCAL_AUTH_RATE_LIMIT, jsonBody, handleSignOut);
  app.post('/api/local/profile', LOCAL_AUTH_RATE_LIMIT, jsonBody, handleProfileUpdate);
};

module.exports = {
  createDefaultSettings,
  registerLocalAuthRoutes,
};
