# GitHub And Production Setup

This project is now prepared for:

- local git tracking
- Vercel deployment
- Postgres-backed persistence when `DATABASE_URL` is configured

## 1. GitHub linking

To connect this folder to your GitHub account, one of these is needed:

1. A GitHub repository URL you want this folder linked to
2. GitHub CLI installed and authenticated
3. A browser-based sign-in flow outside this workspace

Once a repo exists, the commands are:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "Initial production-ready app setup"
git branch -M main
git push -u origin main
```

## 2. Recommended production stack

- Hosting: Vercel
- Database: Neon Postgres, Supabase Postgres, or Vercel Postgres
- Notifications: Twilio for SMS, Resend for email
- Secrets: Vercel project environment variables

## 3. Required environment variables

Set these in Vercel:

```text
FOODDATA_API_KEY=your_real_usda_key
DATABASE_URL=your_managed_postgres_connection_string
PGSSLMODE=require
SESSION_MAX_AGE_SECONDS=2592000
SESSION_COOKIE_SECURE=true
APP_BASE_URL=https://your-production-domain.example
NOTIFICATION_PROVIDER=twilio_or_resend
NOTIFICATION_API_KEY=your_provider_secret
```

## 4. Database setup

Run the schema in:

`db/schema.sql`

That creates the tables for:

- users
- sessions
- reset tokens
- recommendations
- messages
- shared charts
- emergency contacts
- emergency alerts

## 5. Production cutover checklist

1. Provision Postgres
2. Apply `db/schema.sql`
3. Add the Vercel environment variables
4. Redeploy
5. Verify `/api/session` returns `"serverMode":"postgres"`
6. Replace prototype notifications with real provider calls
7. Replace prototype password reset with emailed reset links
8. Add audit logging and rate limiting

## 6. Important note

The current code is Postgres-ready, but real medical production use still requires:

- HIPAA/compliance review
- a signed BAA where needed
- real notification delivery
- monitoring and audit logs
- access review and incident response procedures
