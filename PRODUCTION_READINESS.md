# Production Readiness

This repository is now deployable as a live preview and has baseline security hardening, but it is not fully production-ready for a medical workflow until the items below are completed.

## Completed in code

- Vercel-compatible serverless API entrypoint
- security headers in `vercel.json`
- password hashing with `scrypt`
- HTTP-only session cookies
- guest mode separated from signed-in flows
- deployment env template in `.env.example`
- Postgres schema in `db/schema.sql`
- repository layer that switches to Postgres when `DATABASE_URL` is configured

## Still required before real production use

1. Provision and connect a real managed Postgres database.
   Recommended options:
   - Postgres on Neon, Supabase, or Vercel Postgres
   - encrypted backups and retention policy
   - set `DATABASE_URL` and `PGSSLMODE=require`

2. Replace prototype notifications with a real provider.
   Examples:
   - Twilio for SMS
   - Resend or SendGrid for email
   Current code now supports:
   - Resend for password reset and email alerts
   - Twilio for SMS emergency alerts

3. Add audit logging.
   Minimum events:
   - login
   - logout
   - password reset
   - clinician recommendation creation
   - emergency alert creation
   - chart sharing
   - message send

4. Add authorization tests and API integration tests.

5. Add rate limiting and abuse protection at the API layer.

6. Add real wearable vendor integrations instead of manual compatibility inputs.
   Examples:
   - Apple Health / HealthKit bridge
   - Google Health Connect bridge
   - Oura / ring vendor API integrations where permitted

7. Complete legal, privacy, and compliance review before handling real patient data.
   This includes HIPAA, BAA coverage, breach response, retention policy, and access review.

## Recommended next build step

Deploy with a real `DATABASE_URL`, run the schema in `db/schema.sql`, and configure real provider secrets for Resend and Twilio.
