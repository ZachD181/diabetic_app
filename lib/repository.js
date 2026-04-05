const fs = require("fs");
const path = require("path");

const schemaSql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    pcpEmail: row.pcp_email || "",
    clinicCode: row.clinic_code || "",
    createdAt: row.created_at,
  };
}

class PostgresRepository {
  constructor(pool) {
    this.pool = pool;
    this.initPromise = null;
  }

  async init() {
    if (!this.initPromise) {
      this.initPromise = this.pool.query(schemaSql);
    }
    await this.initPromise;
  }

  async getUserByEmail(email) {
    await this.init();
    const result = await this.pool.query("select * from users where email = $1 limit 1", [email]);
    return mapUser(result.rows[0]);
  }

  async getUserById(id) {
    await this.init();
    const result = await this.pool.query("select * from users where id = $1 limit 1", [id]);
    return mapUser(result.rows[0]);
  }

  async createUser(user) {
    await this.init();
    await this.pool.query(
      `insert into users (id, role, name, email, password_hash, pcp_email, clinic_code, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [user.id, user.role, user.name, user.email, user.passwordHash, user.pcpEmail || "", user.clinicCode || "", user.createdAt],
    );
    return user;
  }

  async createSession(token, userId, createdAt) {
    await this.init();
    await this.pool.query("insert into sessions (token, user_id, created_at) values ($1,$2,$3)", [token, userId, createdAt]);
  }

  async deleteSession(token) {
    await this.init();
    await this.pool.query("delete from sessions where token = $1", [token]);
  }

  async getUserBySessionToken(token) {
    await this.init();
    const result = await this.pool.query(
      `select u.* from sessions s
       join users u on u.id = s.user_id
       where s.token = $1
       limit 1`,
      [token],
    );
    return mapUser(result.rows[0]);
  }

  async replaceResetToken(token) {
    await this.init();
    await this.pool.query("delete from reset_tokens where user_id = $1", [token.userId]);
    await this.pool.query(
      `insert into reset_tokens (id, user_id, email, code, token_hash, expires_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [token.id, token.userId, token.email, token.code || "", token.tokenHash || null, token.expiresAt, token.createdAt],
    );
  }

  async getValidResetTokenByCode(email, code, nowIso) {
    await this.init();
    const result = await this.pool.query(
      `select * from reset_tokens
       where email = $1 and code = $2 and expires_at > $3
       order by created_at desc
       limit 1`,
      [email, code, nowIso],
    );
    return result.rows[0] || null;
  }

  async getValidResetTokenByHash(email, tokenHash, nowIso) {
    await this.init();
    const result = await this.pool.query(
      `select * from reset_tokens
       where email = $1 and token_hash = $2 and expires_at > $3
       order by created_at desc
       limit 1`,
      [email, tokenHash, nowIso],
    );
    return result.rows[0] || null;
  }

  async updateUserPassword(userId, passwordHash) {
    await this.init();
    await this.pool.query("update users set password_hash = $2 where id = $1", [userId, passwordHash]);
  }

  async deleteResetToken(id) {
    await this.init();
    await this.pool.query("delete from reset_tokens where id = $1", [id]);
  }

  async getLinkedPatientsForProvider(provider) {
    await this.init();
    const result = await this.pool.query(
      `select * from users
       where role = 'patient'
         and (pcp_email = $1 or (clinic_code <> '' and clinic_code = $2))
       order by created_at desc`,
      [provider.email, provider.clinicCode || ""],
    );
    return result.rows.map(mapUser);
  }

  async createRecommendation(recommendation) {
    await this.init();
    await this.pool.query(
      `insert into recommendations (id, provider_id, patient_id, title, message, created_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [recommendation.id, recommendation.providerId, recommendation.patientId, recommendation.title, recommendation.message, recommendation.createdAt],
    );
    return recommendation;
  }

  async getRecommendationsForProvider(providerId) {
    await this.init();
    const result = await this.pool.query(
      `select r.*, u.id as patient_ref_id, u.role as patient_role, u.name as patient_name, u.email as patient_email,
              u.pcp_email as patient_pcp_email, u.clinic_code as patient_clinic_code, u.created_at as patient_created_at
       from recommendations r
       join users u on u.id = r.patient_id
       where r.provider_id = $1
       order by r.created_at desc`,
      [providerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      patientId: row.patient_id,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      patient: mapUser({
        id: row.patient_ref_id,
        role: row.patient_role,
        name: row.patient_name,
        email: row.patient_email,
        pcp_email: row.patient_pcp_email,
        clinic_code: row.patient_clinic_code,
        created_at: row.patient_created_at,
      }),
    }));
  }

  async getRecommendationsForPatient(patientId) {
    await this.init();
    const result = await this.pool.query(
      `select r.*, u.id as provider_ref_id, u.role as provider_role, u.name as provider_name, u.email as provider_email,
              u.pcp_email as provider_pcp_email, u.clinic_code as provider_clinic_code, u.created_at as provider_created_at
       from recommendations r
       join users u on u.id = r.provider_id
       where r.patient_id = $1
       order by r.created_at desc`,
      [patientId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      patientId: row.patient_id,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      provider: mapUser({
        id: row.provider_ref_id,
        role: row.provider_role,
        name: row.provider_name,
        email: row.provider_email,
        pcp_email: row.provider_pcp_email,
        clinic_code: row.provider_clinic_code,
        created_at: row.provider_created_at,
      }),
    }));
  }

  async createMessage(message) {
    await this.init();
    await this.pool.query(
      `insert into messages (id, sender_id, recipient_id, message, created_at)
       values ($1,$2,$3,$4,$5)`,
      [message.id, message.senderId, message.recipientId, message.message, message.createdAt],
    );
    return message;
  }

  async getMessagesForUser(userId) {
    await this.init();
    const result = await this.pool.query(
      `select m.*,
              s.id as sender_ref_id, s.role as sender_role, s.name as sender_name, s.email as sender_email,
              s.pcp_email as sender_pcp_email, s.clinic_code as sender_clinic_code, s.created_at as sender_created_at,
              r.id as recipient_ref_id, r.role as recipient_role, r.name as recipient_name, r.email as recipient_email,
              r.pcp_email as recipient_pcp_email, r.clinic_code as recipient_clinic_code, r.created_at as recipient_created_at
       from messages m
       join users s on s.id = m.sender_id
       join users r on r.id = m.recipient_id
       where m.sender_id = $1 or m.recipient_id = $1
       order by m.created_at asc`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      recipientId: row.recipient_id,
      message: row.message,
      createdAt: row.created_at,
      sender: mapUser({
        id: row.sender_ref_id,
        role: row.sender_role,
        name: row.sender_name,
        email: row.sender_email,
        pcp_email: row.sender_pcp_email,
        clinic_code: row.sender_clinic_code,
        created_at: row.sender_created_at,
      }),
      recipient: mapUser({
        id: row.recipient_ref_id,
        role: row.recipient_role,
        name: row.recipient_name,
        email: row.recipient_email,
        pcp_email: row.recipient_pcp_email,
        clinic_code: row.recipient_clinic_code,
        created_at: row.recipient_created_at,
      }),
    }));
  }

  async createSharedChart(snapshot) {
    await this.init();
    await this.pool.query(
      `insert into shared_charts (id, patient_id, provider_id, summary_count, summary_average, summary_latest, entries, shared_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [snapshot.id, snapshot.patientId, snapshot.providerId, snapshot.summary.count, snapshot.summary.average, snapshot.summary.latest, JSON.stringify(snapshot.entries || []), snapshot.sharedAt],
    );
    return snapshot;
  }

  async getSharedChartsForPatient(patientId) {
    await this.init();
    const result = await this.pool.query("select * from shared_charts where patient_id = $1 order by shared_at desc", [patientId]);
    return result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      providerId: row.provider_id,
      summary: { count: row.summary_count, average: Number(row.summary_average), latest: Number(row.summary_latest) },
      entries: row.entries || [],
      sharedAt: row.shared_at,
    }));
  }

  async getSharedChartsForProvider(providerId) {
    await this.init();
    const result = await this.pool.query(
      `select sc.*, u.id as patient_ref_id, u.role as patient_role, u.name as patient_name, u.email as patient_email,
              u.pcp_email as patient_pcp_email, u.clinic_code as patient_clinic_code, u.created_at as patient_created_at
       from shared_charts sc
       join users u on u.id = sc.patient_id
       where sc.provider_id = $1
       order by sc.shared_at desc`,
      [providerId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      providerId: row.provider_id,
      summary: { count: row.summary_count, average: Number(row.summary_average), latest: Number(row.summary_latest) },
      entries: row.entries || [],
      sharedAt: row.shared_at,
      patient: mapUser({
        id: row.patient_ref_id,
        role: row.patient_role,
        name: row.patient_name,
        email: row.patient_email,
        pcp_email: row.patient_pcp_email,
        clinic_code: row.patient_clinic_code,
        created_at: row.patient_created_at,
      }),
    }));
  }

  async getEmergencyContact(userId) {
    await this.init();
    const result = await this.pool.query("select * from emergency_contacts where user_id = $1 limit 1", [userId]);
    const row = result.rows[0];
    return row
      ? { id: row.id, userId: row.user_id, name: row.name, relationship: row.relationship, phone: row.phone, email: row.email, notificationMethod: row.notification_method, updatedAt: row.updated_at }
      : null;
  }

  async upsertEmergencyContact(contact) {
    await this.init();
    await this.pool.query(
      `insert into emergency_contacts (id, user_id, name, relationship, phone, email, notification_method, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (user_id) do update set
         name = excluded.name,
         relationship = excluded.relationship,
         phone = excluded.phone,
         email = excluded.email,
         notification_method = excluded.notification_method,
         updated_at = excluded.updated_at`,
      [contact.id, contact.userId, contact.name, contact.relationship, contact.phone, contact.email, contact.notificationMethod, contact.updatedAt],
    );
    return contact;
  }

  async createEmergencyAlert(alert) {
    await this.init();
    await this.pool.query(
      `insert into emergency_alerts (id, user_id, provider_id, contact_id, contact_name, notification_method, reason, metrics, created_at, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
      [alert.id, alert.userId, alert.providerId, alert.contactId, alert.contactName, alert.notificationMethod, alert.reason, JSON.stringify(alert.metrics || {}), alert.createdAt, alert.status],
    );
    return alert;
  }

  async getEmergencyAlertsForUser(user) {
    await this.init();
    const result = await this.pool.query(
      `select * from emergency_alerts
       where user_id = $1 or ($2 = 'provider' and provider_id = $1)
       order by created_at desc`,
      [user.id, user.role],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      providerId: row.provider_id,
      contactId: row.contact_id,
      contactName: row.contact_name,
      notificationMethod: row.notification_method,
      reason: row.reason,
      metrics: row.metrics || {},
      createdAt: row.created_at,
      status: row.status,
    }));
  }
}

function defaultFileStore() {
  return {
    users: [],
    recommendations: [],
    messages: [],
    sharedCharts: [],
    emergencyContacts: [],
    emergencyAlerts: [],
    resetTokens: [],
    sessions: {},
  };
}

class FileRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
  }

  ensure() {
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, JSON.stringify(defaultFileStore(), null, 2), "utf8");
  }

  read() {
    this.ensure();
    return { ...defaultFileStore(), ...JSON.parse(fs.readFileSync(this.filePath, "utf8")) };
  }

  write(store) {
    this.ensure();
    fs.writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  async getUserByEmail(email) { return this.read().users.find((u) => u.email === email) || null; }
  async getUserById(id) { return this.read().users.find((u) => u.id === id) || null; }
  async createUser(user) { const s=this.read(); s.users.push(user); this.write(s); return user; }
  async createSession(token,userId,createdAt){const s=this.read(); s.sessions[token]={userId,createdAt}; this.write(s);}
  async deleteSession(token){const s=this.read(); delete s.sessions[token]; this.write(s);}
  async getUserBySessionToken(token){const s=this.read(); const sess=s.sessions[token]; return sess ? s.users.find((u)=>u.id===sess.userId)||null : null;}
  async replaceResetToken(token){const s=this.read(); s.resetTokens=s.resetTokens.filter((t)=>t.userId!==token.userId); s.resetTokens.push(token); this.write(s);}
  async getValidResetTokenByCode(email,code,nowIso){return this.read().resetTokens.find((t)=>t.email===email&&t.code===code&&new Date(t.expiresAt)>new Date(nowIso))||null;}
  async getValidResetTokenByHash(email,tokenHash,nowIso){return this.read().resetTokens.find((t)=>t.email===email&&t.tokenHash===tokenHash&&new Date(t.expiresAt)>new Date(nowIso))||null;}
  async updateUserPassword(userId,passwordHash){const s=this.read(); const u=s.users.find((user)=>user.id===userId); if(u)u.passwordHash=passwordHash; this.write(s);}
  async deleteResetToken(id){const s=this.read(); s.resetTokens=s.resetTokens.filter((t)=>t.id!==id); this.write(s);}
  async getLinkedPatientsForProvider(provider){return this.read().users.filter((u)=>u.role==="patient"&&(u.pcpEmail===provider.email||(u.clinicCode&&provider.clinicCode&&u.clinicCode===provider.clinicCode)));}
  async createRecommendation(r){const s=this.read(); s.recommendations.push(r); this.write(s); return r;}
  async getRecommendationsForProvider(providerId){const s=this.read(); return s.recommendations.filter((r)=>r.providerId===providerId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map((r)=>({...r,patient:s.users.find((u)=>u.id===r.patientId)||null}));}
  async getRecommendationsForPatient(patientId){const s=this.read(); return s.recommendations.filter((r)=>r.patientId===patientId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map((r)=>({...r,provider:s.users.find((u)=>u.id===r.providerId)||null}));}
  async createMessage(m){const s=this.read(); s.messages.push(m); this.write(s); return m;}
  async getMessagesForUser(userId){const s=this.read(); return s.messages.filter((m)=>m.senderId===userId||m.recipientId===userId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).map((m)=>({...m,sender:s.users.find((u)=>u.id===m.senderId)||null,recipient:s.users.find((u)=>u.id===m.recipientId)||null}));}
  async createSharedChart(c){const s=this.read(); s.sharedCharts.push(c); this.write(s); return c;}
  async getSharedChartsForPatient(patientId){return this.read().sharedCharts.filter((c)=>c.patientId===patientId).sort((a,b)=>new Date(b.sharedAt)-new Date(a.sharedAt));}
  async getSharedChartsForProvider(providerId){const s=this.read(); return s.sharedCharts.filter((c)=>c.providerId===providerId).sort((a,b)=>new Date(b.sharedAt)-new Date(a.sharedAt)).map((c)=>({...c,patient:s.users.find((u)=>u.id===c.patientId)||null}));}
  async getEmergencyContact(userId){return this.read().emergencyContacts.find((c)=>c.userId===userId)||null;}
  async upsertEmergencyContact(contact){const s=this.read(); const existing=s.emergencyContacts.find((c)=>c.userId===contact.userId); const next={...contact,id:existing?.id||contact.id}; s.emergencyContacts=s.emergencyContacts.filter((c)=>c.userId!==contact.userId); s.emergencyContacts.push(next); this.write(s); return next;}
  async createEmergencyAlert(alert){const s=this.read(); s.emergencyAlerts.push(alert); this.write(s); return alert;}
  async getEmergencyAlertsForUser(user){return this.read().emergencyAlerts.filter((a)=>a.userId===user.id||(user.role==="provider"&&a.providerId===user.id)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
}

function createRepository() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    return { repository: new PostgresRepository(new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } })), mode: "postgres" };
  }
  return { repository: new FileRepository(path.join(process.cwd(), "data", "store.json")), mode: "file" };
}

module.exports = { createRepository };
