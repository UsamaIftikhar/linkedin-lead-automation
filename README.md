# Job Lead Generation and Cold Outreach System

A production-oriented full-stack system for sourcing job-based leads, enriching them with business email data, and sending controlled cold outreach.

## Stack

- Backend: NestJS, Prisma, PostgreSQL (Supabase), node-cron via `@nestjs/schedule`, Axios, Resend
- Frontend: Next.js App Router, Tailwind CSS, React Query
- APIs: RapidAPI JSearch, official Upwork MCP, Hunter.io, Resend

## Features

- Fetch jobs from JSearch with `keyword` and `location`
- Normalize and store lead records with duplicate protection
- Extract employer domains from company websites
- Enrich leads with business emails from Hunter.io
- Send outreach only to uncontacted leads with valid emails
- Run a daily scheduled pipeline for fetch -> enrich -> send
- View stats and lead tables from a dashboard UI

## Project Structure

```text
backend/   NestJS API, Prisma schema, scheduled pipeline
frontend/  Next.js dashboard
```

## Backend Setup

1. Copy `backend/.env.example` to `backend/.env` and fill in your Supabase, JSearch, Hunter, and Resend credentials.
2. For Supabase, prefer the pooler connection string with `pgbouncer=true`. If your database password contains special characters like `@`, URL-encode them in `DATABASE_URL` such as `%40`.
3. Install dependencies:

```bash
cd backend
npm install
```

4. Generate Prisma client and apply schema:

```bash
npm run db:generate
npm run db:push
```

5. Start the API:

```bash
npm run start:dev
```

The API runs on `http://localhost:3001/api` by default.

## Frontend Setup

1. Copy `frontend/.env.example` to `frontend/.env.local`.
2. Install dependencies and run the app:

```bash
cd frontend
npm install
npm run dev
```

The dashboard runs on `http://localhost:3000`.

## API Endpoints

- `GET /api/jobs/fetch?keyword=software%20engineer&location=remote`
- `POST /api/emails/send`
- `GET /api/leads`
- `GET /api/leads/stats`

## Daily Pipeline

The backend cron job runs once per day using `CRON_SCHEDULE` and performs:

1. Job fetching from JSearch
2. Domain extraction
3. Email enrichment with Hunter.io
4. Lead storage in PostgreSQL
5. Controlled email sending with Resend

Set `DEFAULT_JOB_KEYWORDS` and `DEFAULT_JOB_LOCATIONS` as comma-separated values to drive the scheduled runs.

## Upwork MCP setup

Upwork job discovery uses Upwork's official remote MCP server at
`https://mcp.upwork.com/mcp`. It no longer uses an Upwork RapidAPI endpoint or
browser session cookies.

1. Add the following backend variables:

```dotenv
UPWORK_MCP_URL="https://mcp.upwork.com/mcp"
UPWORK_MCP_REDIRECT_URI="http://localhost:3001/api/upwork-jobs/mcp/callback"
UPWORK_MCP_SUCCESS_REDIRECT_URI="http://localhost:3000/upwork?upwork_mcp=connected"
UPWORK_MCP_CREDENTIALS_ENCRYPTION_KEY="<32-byte base64 value>"
```

Generate the encryption value once with `openssl rand -base64 32`. Keep the
same value across deployments; changing it makes the stored OAuth session
unreadable and requires reconnecting Upwork.

2. Apply the `upwork_mcp_auth` table and restart the backend:

```bash
cd backend
npm run db:push
npm run start:dev
```

3. Open the dashboard's Upwork page, select **Connect Upwork**, and approve the
OAuth prompt. Manual and cron fetches reuse that encrypted, refreshable OAuth
session. In production, set both redirect variables to the public backend and
frontend HTTPS URLs before connecting.

The search form and `UPWORK_CRON_*` variables remain the source of job
preferences. Results still pass through the local keyword, budget, client,
competition, scoring, deduplication, and notification rules.

## Deployment

### Backend on Render

1. Create a new Web Service pointing to the `backend` directory.
2. Set the build command to `npm install && npm run db:generate && npm run build`.
3. Set the start command to `npm run start:prod`.
4. Add all variables from `backend/.env.example`.
5. Point `DATABASE_URL` at your Supabase Postgres connection string.

### Frontend on Vercel

1. Import the repository and set the root directory to `frontend`.
2. Add `NEXT_PUBLIC_API_BASE_URL` pointing to your deployed Render API, for example `https://your-api.onrender.com/api`.
3. Deploy with the default Next.js build settings.

### Database on Supabase

1. Create a new Supabase project.
2. Copy the Supabase pooler Postgres connection string into `backend/.env`.
3. Add `?pgbouncer=true&sslmode=require` if it is not already included.
4. URL-encode special characters in the password section of the URL. For example, `@` becomes `%40`.
5. Run `npm run db:push` from the `backend` directory to create the `Lead` table.

## Email Sending Guidance

- Use only verified sending domains in Resend.
- Keep daily sending volume conservative and warm up new domains gradually.
- Review and personalize the outreach template before using it in production.
- Respect local anti-spam and consent requirements.
- This project uses official APIs only and does not scrape LinkedIn.

## Notes

- Duplicate leads are prevented with a Prisma composite unique constraint.
- Hunter enrichment keeps only non-free business emails above the configured confidence threshold.
- External API calls are rate-limited in service code to avoid aggressive burst traffic.
