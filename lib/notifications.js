const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || process.env.NOTIFICATION_PROVIDER || "").trim().toLowerCase();
const EMAIL_API_KEY = String(process.env.EMAIL_API_KEY || process.env.NOTIFICATION_API_KEY || "").trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || "").trim();
const SMS_PROVIDER = String(process.env.SMS_PROVIDER || "").trim().toLowerCase();
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_FROM_NUMBER = String(process.env.TWILIO_FROM_NUMBER || "").trim();

async function sendEmail({ to, subject, text }) {
  if (EMAIL_PROVIDER !== "resend" || !EMAIL_API_KEY || !EMAIL_FROM || !to) {
    return {
      delivered: false,
      status: "email_not_configured",
      provider: EMAIL_PROVIDER || "none",
      detail: "Email provider is not configured.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      text,
    }),
  });

  const detail = await response.text();
  return {
    delivered: response.ok,
    status: response.ok ? "email_sent" : "email_failed",
    provider: "resend",
    detail: detail.slice(0, 500),
  };
}

async function sendSms({ to, body }) {
  if (SMS_PROVIDER !== "twilio" || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !to) {
    return {
      delivered: false,
      status: "sms_not_configured",
      provider: SMS_PROVIDER || "none",
      detail: "SMS provider is not configured.",
    };
  }

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const payload = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const detail = await response.text();
  return {
    delivered: response.ok,
    status: response.ok ? "sms_sent" : "sms_failed",
    provider: "twilio",
    detail: detail.slice(0, 500),
  };
}

module.exports = { sendEmail, sendSms };
