const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { ethers } = require("ethers");

const app = express();
const PORT = 3021;

const OWNER_WALLET_ADDRESS = "0x4C3CFF7Df41e85d4972c5406EcF105a9AEA34b4d".toLowerCase();
const SUCCESS_SIGNALS_FILE = path.join("/var/www/proculus", "success-signal.json");
const DATA_DIR = path.join("/var/www/proculus", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "subscriptions.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const ADMIN_CHALLENGES_FILE = path.join(DATA_DIR, "admin-challenges.json");
const ADMIN_SESSIONS_FILE = path.join(DATA_DIR, "admin-sessions.json");
const EMAIL_USERS_FILE = path.join(DATA_DIR, "email-users.json");
const USER_SESSIONS_FILE = path.join(DATA_DIR, "user-sessions.json");
const PENDING_CRYPTO_PAYMENTS_FILE = path.join(DATA_DIR, "pending-crypto-payments.json");
const TELEGRAM_USERS_FILE = path.join(DATA_DIR, "telegram-users.json");
const TELEGRAM_LINK_TOKENS_FILE = path.join(DATA_DIR, "telegram-link-tokens.json");

const ADMIN_COOKIE_NAME = "proculus_admin_session";
const ADMIN_COOKIE_PATH = "/api/public/admin";
const USER_COOKIE_NAME = "proculus_user_session";
const USER_COOKIE_PATH = "/api/public/auth";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ADMIN_SESSION_TTL_MS = 15 * 60 * 1000;
const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TELEGRAM_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

function ensureDataFile(filePath, fallbackValue) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2), "utf8");
  }
}

function readJson(filePath, fallbackValue) {
  try {
    ensureDataFile(filePath, fallbackValue);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Failed to read ${filePath}:`, err);
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  ensureDataFile(filePath, []);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeWallet(address) {
  return String(address || "").trim().toLowerCase();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function isExpired(isoDate) {
  return new Date(isoDate).getTime() <= Date.now();
}

function hashPassword(password, salt = randomId(16)) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHash] = String(storedHash || "").split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function sanitizeEmailUser(user) {
  return {
    id: user.id,
    email: user.email,
    authType: "email",
    accessLevel: user.accessLevel || "free",
    plan: user.plan || "free",
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || user.createdAt
  };
}

function pruneExpiredChallenges() {
  const challenges = readJson(ADMIN_CHALLENGES_FILE, []);
  const filtered = challenges.filter(item => !isExpired(item.expiresAt));
  if (filtered.length !== challenges.length) {
    writeJson(ADMIN_CHALLENGES_FILE, filtered);
  }
  return filtered;
}

function pruneExpiredSessions() {
  const sessions = readJson(ADMIN_SESSIONS_FILE, []);
  const filtered = sessions.filter(item => !isExpired(item.expiresAt));
  if (filtered.length !== sessions.length) {
    writeJson(ADMIN_SESSIONS_FILE, filtered);
  }
  return filtered;
}

function pruneExpiredUserSessions() {
  const sessions = readJson(USER_SESSIONS_FILE, []);
  const filtered = sessions.filter(item => !isExpired(item.expiresAt));
  if (filtered.length !== sessions.length) {
    writeJson(USER_SESSIONS_FILE, filtered);
  }
  return filtered;
}

function setAdminCookie(res, token, expiresAt) {
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: ADMIN_COOKIE_PATH,
    expires: new Date(expiresAt)
  });
}

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: ADMIN_COOKIE_PATH
  });
}

function setUserCookie(res, token, expiresAt) {
  res.cookie(USER_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: USER_COOKIE_PATH,
    expires: new Date(expiresAt)
  });
}

function clearUserCookie(res) {
  res.clearCookie(USER_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: USER_COOKIE_PATH
  });
}

function requireAdminSession(req, res, next) {
  const token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  const sessions = pruneExpiredSessions();
  const session = sessions.find(item => item.token === token);

  if (!session) {
    clearAdminCookie(res);
    return res.status(401).json({ error: "Admin session expired" });
  }

  if (normalizeWallet(session.walletAddress) !== OWNER_WALLET_ADDRESS) {
    clearAdminCookie(res);
    return res.status(403).json({ error: "Forbidden" });
  }

  req.adminSession = session;
  next();
}

function pushEvent(type, walletAddress, detail) {
  const events = readJson(EVENTS_FILE, []);
  events.unshift({
    type,
    walletAddress: walletAddress || null,
    detail: detail || null,
    createdAt: nowIso()
  });
  writeJson(EVENTS_FILE, events.slice(0, 200));
}

function readPendingCryptoPayments() {
  return readJson(PENDING_CRYPTO_PAYMENTS_FILE, []);
}

function writePendingCryptoPayments(items) {
  writeJson(PENDING_CRYPTO_PAYMENTS_FILE, items);
}

function sortByTimestampDesc(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.timestamp || a.createdAt || 0).getTime();
    const bTime = new Date(b.timestamp || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function upsertEmailPlanAccess(email, plan) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPlan = String(plan || '').trim().toLowerCase();
  const users = readJson(EMAIL_USERS_FILE, []);
  const user = users.find(item => item.email === normalizedEmail);

  if (!user) {
    return null;
  }

  user.accessLevel = 'paid';
  user.plan = normalizedPlan;
  user.updatedAt = nowIso();
  user.planActivatedAt = user.updatedAt;
  writeJson(EMAIL_USERS_FILE, users);
  return sanitizeEmailUser(user);
}

function createUserSession(email) {
  const sessions = pruneExpiredUserSessions().filter(item => item.email !== email);
  const token = randomId(32);
  const expiresAt = new Date(Date.now() + USER_SESSION_TTL_MS).toISOString();
  sessions.push({ token, email, expiresAt });
  writeJson(USER_SESSIONS_FILE, sessions);
  return { token, expiresAt };
}

function getAuthenticatedEmailUser(req) {
  const token = req.cookies[USER_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const sessions = pruneExpiredUserSessions();
  const session = sessions.find(item => item.token === token);
  if (!session) {
    return null;
  }

  const users = readJson(EMAIL_USERS_FILE, []);
  const user = users.find(item => item.email === session.email);
  if (!user) {
    return null;
  }

  return { session, user };
}

function getLatestCryptoPaymentForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const payments = readPendingCryptoPayments()
    .filter(item => normalizeEmail(item.email) == normalizedEmail)
    .sort((a, b) => new Date(b.timestamp || b.updatedAt || 0).getTime() - new Date(a.timestamp || a.updatedAt || 0).getTime());

  return payments[0] || null;
}

function sanitizeCryptoPaymentStatus(payment) {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id,
    selectedPlan: payment.selectedPlan || null,
    selectedNetwork: payment.selectedNetwork || null,
    amount: payment.amount || null,
    walletAddressShown: payment.walletAddressShown || payment.address || null,
    timestamp: payment.timestamp || payment.createdAt || null,
    status: payment.status || null,
    reviewedAt: payment.reviewedAt || null
  };
}

function readTelegramUsers() {
  return readJson(TELEGRAM_USERS_FILE, []);
}

function writeTelegramUsers(items) {
  writeJson(TELEGRAM_USERS_FILE, items);
}

function pruneExpiredTelegramLinkTokens() {
  const tokens = readJson(TELEGRAM_LINK_TOKENS_FILE, []);
  const filtered = tokens.filter(item => !isExpired(item.expiresAt));
  if (filtered.length !== tokens.length) {
    writeJson(TELEGRAM_LINK_TOKENS_FILE, filtered);
  }
  return filtered;
}

function isEmailUserTelegramEligible(user) {
  const accessLevel = String(user?.accessLevel || "free").trim().toLowerCase();
  const plan = String(user?.plan || "free").trim().toLowerCase();
  return accessLevel === "paid" && ["daily", "monthly", "yearly"].includes(plan);
}

function createTelegramLinkToken(email) {
  const normalizedEmail = normalizeEmail(email);
  const users = readJson(EMAIL_USERS_FILE, []);
  const user = users.find(item => item.email === normalizedEmail);
  if (!user) {
    return null;
  }

  const tokens = pruneExpiredTelegramLinkTokens().filter(item => item.email !== normalizedEmail);
  const token = randomId(18);
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TOKEN_TTL_MS).toISOString();

  tokens.push({
    token,
    email: normalizedEmail,
    createdAt: nowIso(),
    expiresAt
  });

  writeJson(TELEGRAM_LINK_TOKENS_FILE, tokens);
  return { token, expiresAt, user };
}

function validateTelegramLinkToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const tokens = pruneExpiredTelegramLinkTokens();
  const record = tokens.find(item => item.token === normalizedToken);
  if (!record) {
    return null;
  }

  const users = readJson(EMAIL_USERS_FILE, []);
  const user = users.find(item => item.email === record.email);
  if (!user) {
    return null;
  }

  return { record, user };
}

function consumeTelegramLinkToken(token) {
  const normalizedToken = String(token || "").trim();
  const tokens = pruneExpiredTelegramLinkTokens();
  const remaining = tokens.filter(item => item.token !== normalizedToken);
  writeJson(TELEGRAM_LINK_TOKENS_FILE, remaining);
}

function upsertTelegramEmailLink({ chatId, telegramUsername, user }) {
  const normalizedEmail = normalizeEmail(user?.email);
  const normalizedChatId = String(chatId || "").trim();
  const username = String(telegramUsername || "").trim();
  const telegramUsers = readTelegramUsers().filter(item => String(item.chatId || "").trim() !== normalizedChatId);
  const existing = telegramUsers.find(item => normalizeEmail(item.linkedEmail) === normalizedEmail);
  const updatedAt = nowIso();

  const entry = existing || {
    id: randomId(12),
    connectedAt: updatedAt
  };

  entry.chatId = normalizedChatId;
  entry.telegramUsername = username || null;
  entry.linkedEmail = normalizedEmail;
  entry.linkedWalletAddress = null;
  entry.authType = "email";
  entry.plan = String(user?.plan || "free").trim().toLowerCase();
  entry.alertsEligible = isEmailUserTelegramEligible(user);
  entry.enabled = true;
  entry.updatedAt = updatedAt;
  entry.lastBotStartAt = updatedAt;

  if (!existing) {
    telegramUsers.unshift(entry);
  }

  writeTelegramUsers(telegramUsers);
  return entry;
}

function sanitizeTelegramLink(entry) {
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    chatId: entry.chatId,
    telegramUsername: entry.telegramUsername || null,
    linkedEmail: entry.linkedEmail,
    authType: entry.authType,
    plan: entry.plan || "free",
    alertsEligible: Boolean(entry.alertsEligible),
    enabled: Boolean(entry.enabled),
    connectedAt: entry.connectedAt || null,
    updatedAt: entry.updatedAt || null
  };
}

function getTelegramLinkForEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return readTelegramUsers().find(item => normalizeEmail(item.linkedEmail) === normalizedEmail) || null;
}

app.get("/api/success-signals", (req, res) => {
  fs.readFile(SUCCESS_SIGNALS_FILE, "utf8", (err, data) => {
    if (err) {
      console.error("Dosya okunamadı:", err);
      return res.status(500).json({ error: "Dosya okunamadı" });
    }
    res.json(JSON.parse(data));
  });
});

app.get("/active-users", (req, res) => {
  const activeCount = Math.floor(Math.random() * 500) + 50;
  res.json({ activeUsers: activeCount });
});

app.post("/api/auth/signup", (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const users = readJson(EMAIL_USERS_FILE, []);
  if (users.some(item => item.email === email)) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const user = {
    id: randomId(12),
    email,
    passwordHash: hashPassword(password),
    authType: "email",
    accessLevel: "free",
    plan: "free",
    createdAt: nowIso(),
    lastLoginAt: nowIso()
  };

  users.push(user);
  writeJson(EMAIL_USERS_FILE, users);

  const { token, expiresAt } = createUserSession(email);
  setUserCookie(res, token, expiresAt);
  pushEvent("user-signup", email, "Free dashboard access enabled");

  res.json({
    authenticated: true,
    user: sanitizeEmailUser(user),
    paymentStatus: sanitizeCryptoPaymentStatus(getLatestCryptoPaymentForEmail(email)),
    expiresAt
  });
});

app.post("/api/auth/login", (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const users = readJson(EMAIL_USERS_FILE, []);
  const user = users.find(item => item.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  user.lastLoginAt = nowIso();
  writeJson(EMAIL_USERS_FILE, users);

  const { token, expiresAt } = createUserSession(email);
  setUserCookie(res, token, expiresAt);
  pushEvent("user-login", email, "Free dashboard session started");

  res.json({
    authenticated: true,
    user: sanitizeEmailUser(user),
    paymentStatus: sanitizeCryptoPaymentStatus(getLatestCryptoPaymentForEmail(email)),
    expiresAt
  });
});

app.get("/api/auth/session", (req, res) => {
  const authenticated = getAuthenticatedEmailUser(req);

  if (!authenticated) {
    clearUserCookie(res);
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: sanitizeEmailUser(authenticated.user),
    paymentStatus: sanitizeCryptoPaymentStatus(getLatestCryptoPaymentForEmail(authenticated.user.email)),
    expiresAt: authenticated.session.expiresAt
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.cookies[USER_COOKIE_NAME];
  if (token) {
    const sessions = pruneExpiredUserSessions().filter(item => item.token !== token);
    writeJson(USER_SESSIONS_FILE, sessions);
  }
  clearUserCookie(res);
  res.json({ message: "Logged out" });
});

app.get("/api/auth/telegram/status", (req, res) => {
  const authenticated = getAuthenticatedEmailUser(req);

  if (!authenticated) {
    clearUserCookie(res);
    return res.status(401).json({ error: "Authentication required" });
  }

  const link = getTelegramLinkForEmail(authenticated.user.email);
  res.json({
    linked: Boolean(link),
    telegram: sanitizeTelegramLink(link),
    alertsEligible: isEmailUserTelegramEligible(authenticated.user)
  });
});

app.post("/api/auth/telegram/link-token", (req, res) => {
  const authenticated = getAuthenticatedEmailUser(req);

  if (!authenticated) {
    clearUserCookie(res);
    return res.status(401).json({ error: "Authentication required" });
  }

  const created = createTelegramLinkToken(authenticated.user.email);
  if (!created) {
    return res.status(404).json({ error: "Email user not found" });
  }

  const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || "").trim();
  res.json({
    linkedEmail: authenticated.user.email,
    alertsEligible: isEmailUserTelegramEligible(authenticated.user),
    token: created.token,
    expiresAt: created.expiresAt,
    startCommand: `/start ${created.token}`,
    botUrl: botUsername ? `https://t.me/${botUsername}?start=${created.token}` : null
  });
});

app.post("/api/telegram/link/complete", (req, res) => {
  const token = String(req.body.token || "").trim();
  const chatId = String(req.body.chatId || "").trim();
  const telegramUsername = String(req.body.telegramUsername || "").trim();

  if (!token || !chatId) {
    return res.status(400).json({ error: "Token and chatId are required" });
  }

  const validated = validateTelegramLinkToken(token);
  if (!validated) {
    return res.status(400).json({ error: "Invalid or expired Telegram link token" });
  }

  const link = upsertTelegramEmailLink({
    chatId,
    telegramUsername,
    user: validated.user
  });

  consumeTelegramLinkToken(token);
  pushEvent("telegram-linked", validated.user.email, `${chatId}${telegramUsername ? ` | @${telegramUsername}` : ""}`);

  res.json({
    linked: true,
    telegram: sanitizeTelegramLink(link)
  });
});

app.post("/api/admin/auth/challenge", (req, res) => {
  const walletAddress = normalizeWallet(req.body.walletAddress);

  if (walletAddress !== OWNER_WALLET_ADDRESS) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const challenges = pruneExpiredChallenges();
  const challengeId = randomId(16);
  const nonce = randomId(12);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const message = [
    "Proculus Admin Authentication",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Challenge ID: ${challengeId}`,
    `Expires At: ${expiresAt}`
  ].join("\n");

  challenges.push({
    id: challengeId,
    walletAddress,
    nonce,
    message,
    expiresAt
  });

  writeJson(ADMIN_CHALLENGES_FILE, challenges);
  res.json({ challengeId, message, expiresAt });
});

app.post("/api/admin/auth/verify", (req, res) => {
  const walletAddress = normalizeWallet(req.body.walletAddress);
  const challengeId = String(req.body.challengeId || "").trim();
  const signature = String(req.body.signature || "").trim();

  if (walletAddress !== OWNER_WALLET_ADDRESS) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!challengeId || !signature) {
    return res.status(400).json({ error: "challengeId and signature are required" });
  }

  const challenges = pruneExpiredChallenges();
  const challenge = challenges.find(item => item.id === challengeId);

  if (!challenge) {
    return res.status(400).json({ error: "Challenge not found or expired" });
  }

  if (normalizeWallet(challenge.walletAddress) !== walletAddress) {
    return res.status(400).json({ error: "Wallet mismatch" });
  }

  try {
    const recovered = ethers.verifyMessage(challenge.message, signature).toLowerCase();
    if (recovered !== walletAddress) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    writeJson(ADMIN_CHALLENGES_FILE, challenges.filter(item => item.id !== challengeId));

    const sessions = pruneExpiredSessions().filter(item => normalizeWallet(item.walletAddress) !== walletAddress);
    const token = randomId(32);
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();

    sessions.push({ token, walletAddress, expiresAt });
    writeJson(ADMIN_SESSIONS_FILE, sessions);
    setAdminCookie(res, token, expiresAt);
    pushEvent("admin-login", walletAddress, "Owner authenticated");

    return res.json({ authenticated: true, expiresAt });
  } catch (err) {
    console.error("Admin signature verification failed:", err);
    return res.status(401).json({ error: "Invalid signature" });
  }
});

app.get("/api/admin/auth/status", (req, res) => {
  const token = req.cookies[ADMIN_COOKIE_NAME];
  if (!token) {
    return res.json({ authenticated: false });
  }

  const sessions = pruneExpiredSessions();
  const session = sessions.find(item => item.token === token);
  if (!session) {
    clearAdminCookie(res);
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    walletAddress: session.walletAddress,
    expiresAt: session.expiresAt
  });
});

app.post("/api/admin/auth/logout", (req, res) => {
  const token = req.cookies[ADMIN_COOKIE_NAME];
  if (token) {
    const sessions = pruneExpiredSessions().filter(item => item.token !== token);
    writeJson(ADMIN_SESSIONS_FILE, sessions);
  }
  clearAdminCookie(res);
  res.json({ message: "Logged out" });
});

app.get("/api/admin/users", requireAdminSession, (req, res) => {
  const users = readJson(USERS_FILE, []);
  res.json({ users });
});

app.get("/api/admin/subscriptions", requireAdminSession, (req, res) => {
  const subscriptions = readJson(SUBSCRIPTIONS_FILE, []);
  res.json({ subscriptions });
});

app.get("/api/admin/events", requireAdminSession, (req, res) => {
  const events = readJson(EVENTS_FILE, []);
  res.json({ events });
});

app.post("/api/admin/grant-access", requireAdminSession, (req, res) => {
  const walletAddress = normalizeWallet(req.body.walletAddress);
  const reason = String(req.body.reason || "").trim();

  if (!walletAddress) {
    return res.status(400).json({ error: "walletAddress is required" });
  }

  const users = readJson(USERS_FILE, []);
  const subscriptions = readJson(SUBSCRIPTIONS_FILE, []);

  let user = users.find(item => normalizeWallet(item.walletAddress) === walletAddress);
  if (!user) {
    user = {
      walletAddress,
      plan: "yearly",
      freeAccess: true,
      source: "manual-admin",
      updatedAt: nowIso()
    };
    users.push(user);
  } else {
    user.freeAccess = true;
    user.plan = user.plan || "yearly";
    user.source = "manual-admin";
    user.updatedAt = nowIso();
  }

  let subscription = subscriptions.find(item => normalizeWallet(item.walletAddress) === walletAddress);
  if (!subscription) {
    subscription = {
      walletAddress,
      plan: user.plan,
      status: "active",
      source: "manual-admin",
      reason,
      updatedAt: nowIso()
    };
    subscriptions.push(subscription);
  } else {
    subscription.plan = user.plan;
    subscription.status = "active";
    subscription.source = "manual-admin";
    subscription.reason = reason;
    subscription.updatedAt = nowIso();
  }

  writeJson(USERS_FILE, users);
  writeJson(SUBSCRIPTIONS_FILE, subscriptions);
  pushEvent("grant-access", walletAddress, reason || "Free access granted");
  res.json({ message: "Free access granted" });
});

app.post("/api/admin/override-plan", requireAdminSession, (req, res) => {
  const walletAddress = normalizeWallet(req.body.walletAddress);
  const plan = String(req.body.plan || "").trim().toLowerCase();
  const reason = String(req.body.reason || "").trim();

  if (!walletAddress || !["daily", "monthly", "yearly"].includes(plan)) {
    return res.status(400).json({ error: "walletAddress and valid plan are required" });
  }

  const users = readJson(USERS_FILE, []);
  const subscriptions = readJson(SUBSCRIPTIONS_FILE, []);

  let user = users.find(item => normalizeWallet(item.walletAddress) === walletAddress);
  if (!user) {
    user = {
      walletAddress,
      plan,
      freeAccess: false,
      source: "manual-override",
      updatedAt: nowIso()
    };
    users.push(user);
  } else {
    user.plan = plan;
    user.source = "manual-override";
    user.updatedAt = nowIso();
  }

  let subscription = subscriptions.find(item => normalizeWallet(item.walletAddress) === walletAddress);
  if (!subscription) {
    subscription = {
      walletAddress,
      plan,
      status: "active",
      source: "manual-override",
      reason,
      updatedAt: nowIso()
    };
    subscriptions.push(subscription);
  } else {
    subscription.plan = plan;
    subscription.status = "active";
    subscription.source = "manual-override";
    subscription.reason = reason;
    subscription.updatedAt = nowIso();
  }

  writeJson(USERS_FILE, users);
  writeJson(SUBSCRIPTIONS_FILE, subscriptions);
  pushEvent("override-plan", walletAddress, `${plan}${reason ? ` | ${reason}` : ""}`);
  res.json({ message: "Plan override saved" });
});

app.post("/api/payments/crypto/pending", (req, res) => {
  const authenticated = getAuthenticatedEmailUser(req);
  const email = normalizeEmail(authenticated?.user?.email || req.body.email);
  const selectedPlan = String(req.body.selectedPlan || "").trim().toLowerCase();
  const selectedNetwork = String(req.body.selectedNetwork || "").trim();
  const amount = String(req.body.amount || "").trim();
  const walletAddressShown = String(req.body.walletAddressShown || req.body.address || "").trim();
  const timestamp = String(req.body.timestamp || nowIso()).trim() || nowIso();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }

  if (!["daily", "monthly", "yearly"].includes(selectedPlan)) {
    return res.status(400).json({ error: "A valid selected plan is required" });
  }

  if (!selectedNetwork || !amount || !walletAddressShown) {
    return res.status(400).json({ error: "Network, amount, and destination wallet are required" });
  }

  const pendingPayment = {
    id: randomId(12),
    email,
    selectedPlan,
    selectedNetwork,
    paymentMethod: "crypto",
    amount,
    walletAddressShown,
    address: walletAddressShown,
    timestamp,
    status: "pending",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const payments = readPendingCryptoPayments().filter(item => {
    return !(item.email === email && item.selectedPlan === selectedPlan && item.selectedNetwork === selectedNetwork && item.status === "pending");
  });

  payments.unshift(pendingPayment);
  writePendingCryptoPayments(sortByTimestampDesc(payments).slice(0, 500));
  pushEvent("crypto-payment-submitted", email, `${selectedPlan} | ${selectedNetwork} | ${amount}`);
  res.json({ payment: pendingPayment, message: "Payment submitted. Awaiting verification." });
});

app.get("/api/admin/pending-crypto-payments", requireAdminSession, (req, res) => {
  res.json({ payments: sortByTimestampDesc(readPendingCryptoPayments()) });
});

app.post("/api/admin/pending-crypto-payments/:id/approve", requireAdminSession, (req, res) => {
  const paymentId = String(req.params.id || "").trim();
  const payments = readPendingCryptoPayments();
  const payment = payments.find(item => item.id === paymentId);

  if (!payment) {
    return res.status(404).json({ error: "Pending payment not found" });
  }

  payment.status = "approved";
  payment.reviewedAt = nowIso();
  payment.updatedAt = payment.reviewedAt;
  payment.reviewedBy = OWNER_WALLET_ADDRESS;

  const activatedUser = upsertEmailPlanAccess(payment.email, payment.selectedPlan);
  writePendingCryptoPayments(sortByTimestampDesc(payments));
  pushEvent("crypto-payment-approved", payment.email, `${payment.selectedPlan} | ${payment.selectedNetwork} | ${payment.amount}`);

  res.json({
    message: "Crypto payment approved",
    payment,
    user: activatedUser
  });
});

app.post("/api/admin/pending-crypto-payments/:id/reject", requireAdminSession, (req, res) => {
  const paymentId = String(req.params.id || "").trim();
  const payments = readPendingCryptoPayments();
  const payment = payments.find(item => item.id === paymentId);

  if (!payment) {
    return res.status(404).json({ error: "Pending payment not found" });
  }

  payment.status = "rejected";
  payment.reviewedAt = nowIso();
  payment.updatedAt = payment.reviewedAt;
  payment.reviewedBy = OWNER_WALLET_ADDRESS;
  writePendingCryptoPayments(sortByTimestampDesc(payments));
  pushEvent("crypto-payment-rejected", payment.email, `${payment.selectedPlan} | ${payment.selectedNetwork} | ${payment.amount}`);

  res.json({ message: "Crypto payment rejected", payment });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
