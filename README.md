# Bolus/Fast Acting Compass

Web app for estimating a mealtime insulin bolus/fast acting dose using:

- current blood sugar
- planned carbohydrates
- clinician-provided carb ratio
- clinician-provided correction factor

It also includes a food search tool powered by USDA FoodData Central so users can reference carbohydrate values before calculating.

## Included features

- clinician-configured bolus/fast acting estimate using blood sugar, carb ratio, and correction factor
- insulin on board support that subtracts from the correction portion only
- USDA food lookup for carbohydrate estimates
- blood sugar logging with automatic 90-day retention in browser storage
- 90-day glucose trend graph
- CSV export for sharing results with a doctor
- quarterly blood work reminder based on the last lab date entered
- mobile-first tab flow for dose, foods, logbook, and care reminders
- login and registration screens for patient and clinician accounts
- continue-as-guest entry for using the app without registration
- patient registration field for linking a PCP or clinic email
- clinician recommendation inbox for patients
- provider dashboard for sending recommendations to linked patients
- password reset flow with secure emailed reset links when provider env vars are configured
- patient-to-provider messaging thread for linked accounts
- patient chart snapshot sharing so clinicians can review uploaded trends
- smartwatch and smartring compatibility screen for manual or bridge-style vital sync
- wearable monitoring inputs for heart rate, oxygen saturation, blood pressure, temperature, falls, and responsiveness
- wearable integration profile support for Android Health Connect, Apple Health, Oura Cloud API, Samsung Health, and manual entry
- server-backed wearable sample storage for signed-in accounts so future native or cloud sync paths have a real ingestion endpoint
- native Android Health Connect bridge for heart rate, oxygen saturation, blood pressure, and skin temperature sync inside the Android app shell
- emergency contact settings with real provider delivery support for SMS and email alerts when configured

## Important safety note

This project should **not** be used as stand-alone medical advice. It is intentionally built around user-entered settings that must come from a licensed clinician. Emergency situations, ketones, insulin on board, pump-specific logic, activity adjustments, illness, and personal treatment plans are outside the scope of this simple calculator.

Blood sugar logs and reminder settings are stored locally in the browser with `localStorage`, scoped to the signed-in user on that browser.

When `DATABASE_URL` is configured, the API uses Postgres-backed persistence via the schema in `db/schema.sql`.

Without `DATABASE_URL`, local development falls back to `data/store.json`.

Wearable readings and guest-mode emergency contact details are stored locally in the browser unless the user is signed in and saves an emergency contact or triggers an alert.

## Security note

The login, PCP linking, messaging, password reset, recommendation flow, wearable compatibility layer, and emergency alerts are a local prototype. It is **not** a production-ready HIPAA implementation and would need secure hosting, encryption at rest and in transit, audit logs, access controls, breach procedures, real notification delivery, wearable vendor integrations, and legal or compliance review before handling real patient care.

## Run locally

1. In PowerShell, start the server:

   ```powershell
   node server.js
   ```

2. Open `http://localhost:3000`.

## Production database

For production, provision a managed Postgres instance and set:

```powershell
$env:DATABASE_URL="postgres://..."
$env:PGSSLMODE="require"
```

The schema for the production database is in `db/schema.sql`.

## Password reset and emergency alert provider setup

Configure these environment variables to send real reset links and emergency notifications:

```powershell
$env:APP_BASE_URL="https://your-production-domain.example"
$env:EMAIL_PROVIDER="resend"
$env:EMAIL_API_KEY="your_resend_api_key"
$env:EMAIL_FROM="Bolus/Fast Acting Compass <no-reply@your-domain.example>"
$env:SMS_PROVIDER="twilio"
$env:TWILIO_ACCOUNT_SID="your_twilio_sid"
$env:TWILIO_AUTH_TOKEN="your_twilio_auth_token"
$env:TWILIO_FROM_NUMBER="+15551234567"
```

Without those values, the app still generates reset links for local development, but real email and SMS delivery stay disabled.

The live production deployment on `insulindaily.com` now expects provider credentials to be managed in Vercel environment variables so redeploys can pick up updated Resend or Twilio settings.

Fresh pushes to the `main` branch trigger a new Vercel production deployment for the Insulin Daily app.

Store-facing support pages are available at:

- [Privacy Policy](https://insulindaily.com/privacy.html)
- [Support](https://insulindaily.com/support.html)

## Database schema

Apply the production schema with:

```powershell
$env:DATABASE_URL="postgres://..."
$env:PGSSLMODE="require"
node scripts/run-schema.js
```

## Mobile packaging

This repo now includes Capacitor scaffolding for packaging the app as `Insulin Daily` on iPhone and Android.

Key files:
- [capacitor.config.json](C:\Users\zdekr\Desktop\codex_app\capacitor.config.json)
- [MOBILE_APP_STORE_PLAN.md](C:\Users\zdekr\Desktop\codex_app\MOBILE_APP_STORE_PLAN.md)

Core mobile commands:

```powershell
npm.cmd install
npx cap add ios
npx cap add android
npm.cmd run mobile:sync
```

## USDA API key

Set `FOODDATA_API_KEY` if you have your own FoodData Central key:

```powershell
$env:FOODDATA_API_KEY="your_api_key_here"
node server.js
```

If no key is set, the app falls back to `DEMO_KEY`, which is useful for testing but rate-limited.
