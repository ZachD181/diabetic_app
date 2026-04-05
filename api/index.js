const crypto = require("crypto");
const { createRepository } = require("../lib/repository");
const { sendEmail, sendSms } = require("../lib/notifications");

const API_KEY = process.env.FOODDATA_API_KEY || "DEMO_KEY";
const SESSION_COOKIE = "bolus_compass_session";
const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE_SECONDS || 2592000);
const APP_BASE_URL = String(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const RESET_TOKEN_TTL_MS = Number(process.env.RESET_TOKEN_TTL_MINUTES || 30) * 60 * 1000;
const COOKIE_SECURE =
  process.env.SESSION_COOKIE_SECURE === "true" ||
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.VERCEL_ENV);

const { repository, mode } = createRepository();

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey) cookies[rawKey] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${COOKIE_SECURE ? "; Secure" : ""}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body too large."));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createResetTokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, savedHash] = String(passwordHash || "").split(":");
  if (!salt || !savedHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(savedHash, "hex"));
}

function sanitizeUser(user = {}) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    pcpEmail: user.pcpEmail || "",
    clinicCode: user.clinicCode || "",
    createdAt: user.createdAt,
  };
}

function buildResetLink(email, token) {
  const url = new URL(APP_BASE_URL);
  url.searchParams.set("reset", "1");
  url.searchParams.set("email", email);
  url.searchParams.set("token", token);
  return url.toString();
}

async function sendResetEmail({ to, name, resetLink }) {
  return sendEmail({
    to,
    subject: "Reset your Bolus/Fast Acting Compass password",
    text: [
      `Hi ${name || "there"},`,
      "",
      "We received a request to reset your password.",
      `Use this secure link to choose a new password: ${resetLink}`,
      "",
      "If you did not request this change, you can ignore this email.",
    ].join("\n"),
  });
}

function buildEmergencyMessage({ user, contact, reason, metrics }) {
  const readableMetrics = Object.entries(metrics || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  return [
    `Emergency check triggered for ${user.name || "a user"} in Bolus/Fast Acting Compass.`,
    `Reason: ${reason}.`,
    readableMetrics ? `Metrics: ${readableMetrics}.` : "",
    "Please attempt to reach them and contact emergency services if needed.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function notifyEmergencyContact({ user, contact, reason, metrics }) {
  if (!contact) {
    return {
      delivered: false,
      status: "no_contact_on_file",
      provider: "none",
      detail: "No emergency contact is on file.",
    };
  }

  const message = buildEmergencyMessage({ user, contact, reason, metrics });
  if (contact.notificationMethod === "email" && contact.email) {
    return sendEmail({
      to: contact.email,
      subject: `Emergency alert for ${user.name || "user"}`,
      text: message,
    });
  }

  if (contact.phone) {
    return sendSms({
      to: contact.phone,
      body: message,
    });
  }

  if (contact.email) {
    return sendEmail({
      to: contact.email,
      subject: `Emergency alert for ${user.name || "user"}`,
      text: message,
    });
  }

  return {
    delivered: false,
    status: "contact_missing_destination",
    provider: "none",
    detail: "Emergency contact is missing a valid destination.",
  };
}

async function getCurrentUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return token ? repository.getUserBySessionToken(token) : null;
}

async function requireUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user) {
    sendJson(res, 401, { error: "Please sign in first." });
    return null;
  }
  return user;
}

function isLinkedPatient(patient, provider) {
  return (
    patient &&
    provider &&
    patient.role === "patient" &&
    provider.role === "provider" &&
    (patient.pcpEmail === provider.email ||
      (patient.clinicCode && provider.clinicCode && patient.clinicCode === provider.clinicCode))
  );
}

function extractCarbs(foodNutrients = []) {
  const carbNutrient = foodNutrients.find((nutrient) => {
    const name = String(nutrient.nutrientName || nutrient.name || "").toLowerCase();
    return nutrient.nutrientNumber === "1005" || name.includes("carbohydrate");
  });
  if (!carbNutrient) return null;
  const value = Number(carbNutrient.value);
  return Number.isFinite(value) ? value : null;
}

async function handleFoodLookup(searchTerm, res) {
  if (!searchTerm || searchTerm.trim().length < 2) return sendJson(res, 400, { error: "Enter at least 2 characters." });
  const response = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchTerm.trim(),
        pageSize: 8,
        dataType: ["Survey (FNDDS)", "Foundation", "SR Legacy", "Branded"],
      }),
    },
  );
  if (!response.ok) {
    const errorText = await response.text();
    return sendJson(res, response.status, { error: "Food lookup failed.", details: errorText.slice(0, 300) });
  }
  const data = await response.json();
  sendJson(res, 200, {
    foods: (data.foods || []).map((food) => ({
      id: food.fdcId,
      name: food.description,
      brand: food.brandOwner || "",
      serving:
        food.servingSize && food.servingSizeUnit
          ? `${food.servingSize} ${food.servingSizeUnit}`
          : food.householdServingFullText || "Serving size not listed",
      carbs: extractCarbs(food.foodNutrients),
    })),
  });
}

async function handleRegister(req, res) {
  const body = await readBody(req);
  const role = body.role === "provider" ? "provider" : "patient";
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const pcpEmail = normalizeEmail(body.pcpEmail);
  const clinicCode = String(body.clinicCode || "").trim().toUpperCase();
  if (!name || !email || password.length < 8) return sendJson(res, 400, { error: "Enter name, email, and a password with at least 8 characters." });
  if (role === "provider" && !clinicCode) return sendJson(res, 400, { error: "Providers should create a clinic access code for patient matching." });
  if (await repository.getUserByEmail(email)) return sendJson(res, 409, { error: "An account with that email already exists." });
  const user = {
    id: crypto.randomUUID(),
    role,
    name,
    email,
    passwordHash: createPasswordHash(password),
    pcpEmail: role === "patient" ? pcpEmail : "",
    clinicCode,
    createdAt: new Date().toISOString(),
  };
  await repository.createUser(user);
  const token = crypto.randomUUID();
  await repository.createSession(token, user.id, new Date().toISOString());
  setSessionCookie(res, token);
  sendJson(res, 201, { user: sanitizeUser(user), serverMode: mode });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const user = await repository.getUserByEmail(email);
  if (!user) return sendJson(res, 404, { error: "No account was found for that email address." });
  if (!verifyPassword(password, user.passwordHash)) return sendJson(res, 401, { error: "Incorrect password. Please try again." });
  const token = crypto.randomUUID();
  await repository.createSession(token, user.id, new Date().toISOString());
  setSessionCookie(res, token);
  sendJson(res, 200, { user: sanitizeUser(user), serverMode: mode });
}

async function handleRequestPasswordReset(req, res) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const user = await repository.getUserByEmail(email);
  if (!user) return sendJson(res, 200, { ok: true, message: "If that email exists, a password reset link has been sent." });
  const rawToken = crypto.randomBytes(32).toString("hex");
  const resetLink = buildResetLink(email, rawToken);
  const token = {
    id: crypto.randomUUID(),
    userId: user.id,
    email,
    code: "",
    tokenHash: createResetTokenHash(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  };
  await repository.replaceResetToken(token);
  const emailResult = await sendResetEmail({ to: email, name: user.name, resetLink }).catch((error) => ({
    delivered: false,
    status: "email_failed",
    detail: error instanceof Error ? error.message : String(error),
  }));
  const payload = {
    ok: true,
    message: emailResult.delivered
      ? "If that email exists, a password reset link has been sent."
      : "Password reset is configured, but email delivery is not active yet. Set EMAIL_PROVIDER=resend, EMAIL_API_KEY, EMAIL_FROM, and APP_BASE_URL to send reset emails.",
  };
  if (!emailResult.delivered && !COOKIE_SECURE) payload.resetLink = resetLink;
  sendJson(res, 200, payload);
}

async function handleConfirmPasswordReset(req, res) {
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const resetToken = String(body.token || "").trim();
  const code = String(body.code || "").trim().toUpperCase();
  const newPassword = String(body.newPassword || "");
  const nowIso = new Date().toISOString();
  const token =
    (resetToken ? await repository.getValidResetTokenByHash(email, createResetTokenHash(resetToken), nowIso) : null) ||
    (code ? await repository.getValidResetTokenByCode(email, code, nowIso) : null);
  if (!token || newPassword.length < 8) return sendJson(res, 400, { error: "Enter a valid reset link and a new password with at least 8 characters." });
  await repository.updateUserPassword(token.user_id || token.userId, createPasswordHash(newPassword));
  await repository.deleteResetToken(token.id);
  sendJson(res, 200, { ok: true, message: "Password reset complete. You can log in now." });
}

async function handleLogout(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) await repository.deleteSession(token);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

async function handleSession(req, res) {
  const user = await getCurrentUser(req);
  sendJson(res, 200, { user: user ? sanitizeUser(user) : null, serverMode: mode });
}

async function handleRecommendations(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (user.role === "provider") return sendJson(res, 200, { linkedPatients: (await repository.getLinkedPatientsForProvider(user)).map(sanitizeUser), recommendations: await repository.getRecommendationsForProvider(user.id) });
  sendJson(res, 200, { recommendations: await repository.getRecommendationsForPatient(user.id) });
}

async function handleCreateRecommendation(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (user.role !== "provider") return sendJson(res, 403, { error: "Only providers can send recommendations." });
  const body = await readBody(req);
  const patient = await repository.getUserById(String(body.patientId || ""));
  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  if (!patient || !title || !message) return sendJson(res, 400, { error: "Choose a linked patient and enter both a title and message." });
  if (!isLinkedPatient(patient, user)) return sendJson(res, 403, { error: "That patient is not linked to your account." });
  sendJson(res, 201, { recommendation: await repository.createRecommendation({ id: crypto.randomUUID(), providerId: user.id, patientId: patient.id, title, message, createdAt: new Date().toISOString() }) });
}

async function handleMessages(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const linkedProvider = user.role === "patient" ? await findLinkedProvider(user) : null;
  sendJson(res, 200, { messages: await repository.getMessagesForUser(user.id), linkedPatients: user.role === "provider" ? (await repository.getLinkedPatientsForProvider(user)).map(sanitizeUser) : [], linkedProvider: linkedProvider ? sanitizeUser(linkedProvider) : null });
}

async function findLinkedProvider(patient) {
  if (!patient.pcpEmail && !patient.clinicCode) return null;
  const direct = patient.pcpEmail ? await repository.getUserByEmail(patient.pcpEmail) : null;
  if (direct && direct.role === "provider") return direct;
  return null;
}

async function handleCreateMessage(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readBody(req);
  const recipient = await repository.getUserById(String(body.recipientId || ""));
  const message = String(body.message || "").trim();
  if (!recipient || !message) return sendJson(res, 400, { error: "Choose a valid recipient and enter a message." });
  const allowed = (user.role === "provider" && recipient.role === "patient" && isLinkedPatient(recipient, user)) || (user.role === "patient" && recipient.role === "provider" && isLinkedPatient(user, recipient));
  if (!allowed) return sendJson(res, 403, { error: "Messaging is only available between linked patients and providers." });
  sendJson(res, 201, { message: await repository.createMessage({ id: crypto.randomUUID(), senderId: user.id, recipientId: recipient.id, message, createdAt: new Date().toISOString() }) });
}

async function handleSharedCharts(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (user.role === "provider") return sendJson(res, 200, { snapshots: await repository.getSharedChartsForProvider(user.id) });
  sendJson(res, 200, { snapshots: await repository.getSharedChartsForPatient(user.id) });
}

async function handleCreateSharedChart(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (user.role !== "patient") return sendJson(res, 403, { error: "Only patients can share chart snapshots." });
  const provider = await findLinkedProvider(user);
  if (!provider) return sendJson(res, 400, { error: "Link a provider account before sharing a chart snapshot." });
  const body = await readBody(req);
  const entries = Array.isArray(body.entries) ? body.entries.slice(-90) : [];
  const summary = body.summary && typeof body.summary === "object" ? body.summary : {};
  sendJson(res, 201, { snapshot: await repository.createSharedChart({ id: crypto.randomUUID(), patientId: user.id, providerId: provider.id, summary: { count: Number(summary.count) || entries.length, average: Number(summary.average) || 0, latest: Number(summary.latest) || 0 }, entries, sharedAt: new Date().toISOString() }) });
}

async function handleEmergencyContacts(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { contact: await repository.getEmergencyContact(user.id) });
}

async function handleSaveEmergencyContact(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readBody(req);
  const existingContact = await repository.getEmergencyContact(user.id);
  const name = String(body.name || "").trim();
  const relationship = String(body.relationship || "").trim();
  const phone = String(body.phone || "").trim();
  const email = normalizeEmail(body.email);
  const notificationMethod = String(body.notificationMethod || "sms").trim().toLowerCase();
  if (!name || !relationship || (!phone && !email)) return sendJson(res, 400, { error: "Enter a contact name, relationship, and at least one phone or email." });
  sendJson(res, 200, { contact: await repository.upsertEmergencyContact({ id: existingContact?.id || crypto.randomUUID(), userId: user.id, name, relationship, phone, email, notificationMethod: notificationMethod === "email" ? "email" : "sms", updatedAt: new Date().toISOString() }) });
}

async function handleEmergencyAlerts(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { alerts: await repository.getEmergencyAlertsForUser(user) });
}

async function handleCreateEmergencyAlert(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readBody(req);
  const reason = String(body.reason || "").trim();
  const metrics = body.metrics && typeof body.metrics === "object" ? body.metrics : {};
  const contact = await repository.getEmergencyContact(user.id);
  if (!reason) return sendJson(res, 400, { error: "Alert reason is required." });
  const provider = user.role === "patient" ? await findLinkedProvider(user) : null;
  const notification = await notifyEmergencyContact({ user, contact, reason, metrics }).catch((error) => ({
    delivered: false,
    status: "notification_failed",
    provider: "unknown",
    detail: error instanceof Error ? error.message : String(error),
  }));
  const alert = await repository.createEmergencyAlert({
    id: crypto.randomUUID(),
    userId: user.id,
    providerId: provider ? provider.id : null,
    contactId: contact ? contact.id : null,
    contactName: contact ? contact.name : "",
    notificationMethod: contact ? contact.notificationMethod : "",
    reason,
    metrics,
    createdAt: new Date().toISOString(),
    status: notification.status,
  });
  sendJson(res, 201, {
    alert,
    notification,
    message: notification.delivered
      ? "Emergency contact notified."
      : contact
        ? "Emergency alert was recorded, but delivery was not completed. Check provider configuration."
        : "No emergency contact is on file, so only the alert record was created.",
  });
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "https://preview.local");
    const pathname = url.pathname;
    if (req.method === "GET" && pathname === "/api/foods") return handleFoodLookup(url.searchParams.get("query"), res);
    if (req.method === "POST" && pathname === "/api/register") return handleRegister(req, res);
    if (req.method === "POST" && pathname === "/api/login") return handleLogin(req, res);
    if (req.method === "POST" && pathname === "/api/request-password-reset") return handleRequestPasswordReset(req, res);
    if (req.method === "POST" && pathname === "/api/confirm-password-reset") return handleConfirmPasswordReset(req, res);
    if (req.method === "POST" && pathname === "/api/logout") return handleLogout(req, res);
    if (req.method === "GET" && pathname === "/api/session") return handleSession(req, res);
    if (req.method === "GET" && pathname === "/api/recommendations") return handleRecommendations(req, res);
    if (req.method === "POST" && pathname === "/api/recommendations") return handleCreateRecommendation(req, res);
    if (req.method === "GET" && pathname === "/api/messages") return handleMessages(req, res);
    if (req.method === "POST" && pathname === "/api/messages") return handleCreateMessage(req, res);
    if (req.method === "GET" && pathname === "/api/shared-charts") return handleSharedCharts(req, res);
    if (req.method === "POST" && pathname === "/api/shared-charts") return handleCreateSharedChart(req, res);
    if (req.method === "GET" && pathname === "/api/emergency-contacts") return handleEmergencyContacts(req, res);
    if (req.method === "POST" && pathname === "/api/emergency-contacts") return handleSaveEmergencyContact(req, res);
    if (req.method === "GET" && pathname === "/api/emergency-alerts") return handleEmergencyAlerts(req, res);
    if (req.method === "POST" && pathname === "/api/emergency-alerts") return handleCreateEmergencyAlert(req, res);
    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 500, { error: "Unexpected server error.", details: error instanceof Error ? error.message : String(error) });
  }
};
