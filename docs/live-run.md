# Manual Live-Run Checklist

Follow this checklist to verify a live poll and alert delivery using the Apify actor `blackfalcondata/upwork-scraper` and Slack.

---

## 1. Prerequisites & Environment Check
- [ ] `APIFY_TOKEN` is set in `backend/.env` with your valid Apify personal API token.
- [ ] `SLACK_WEBHOOK_URL` is set in `backend/.env` (pointing to your test Slack channel webhook).
- [ ] `UPWORK_POLL_ENABLED="true"` in `backend/.env`.
- [ ] `MIN_FIXED_BUDGET=1000` and `MIN_HOURLY_RATE=15` in `backend/.env`.
- [ ] `SLACK_MIN_SCORE=40` in `backend/.env`.

---

## 2. Start Backend & Frontend
1. In the `backend` directory:
   ```bash
   cd backend
   npm run start:dev
   ```
   - Verify logs: NestJS starts without errors on `http://localhost:3001/api`.
   - Verify `@Cron('*/10 * * * *')` scheduler is initialized.

2. In the `frontend` directory:
   ```bash
   cd frontend
   npm run dev
   ```
   - Open browser to `http://localhost:3000/upwork`.

---

## 3. Trigger a Manual Run
Option A: **Via Dashboard**
- On `http://localhost:3000/upwork`, click **Run Apify Pipeline Now**.
- Verify the status notification appears reporting:
  `Apify Pipeline: fetched X, inserted Y, rejected Z, sent W to Slack.`

Option B: **Via HTTP Endpoint**
- Run curl in your terminal:
  ```bash
  curl -X POST http://localhost:3001/api/upwork/poll
  ```
  *(If `UPWORK_CRON_SECRET` is set, pass `-H "x-admin-token: <secret>"`).*

---

## 4. Verify Slack Notification
- [ ] Qualified jobs (under 10 min old, verified payment, outside PK/IN, < 20 proposals, matched keyword, budget > $15/hr or > $1,000, score >= 40) produce a Block Kit message in your Slack channel.
- [ ] Verify message content:
  - Job title with clickable link to Upwork URL.
  - Calculated opportunity score (`⭐ Score: X/100`).
  - Budget line.
  - Country.
  - Exact proposal count.
  - Matched keywords.
  - Posted time in UTC.
  - Interactive "View job" button linking to the posting.
- [ ] Verify **NO** contact info or social handles appear anywhere in the message.

---

## 5. Verify Deduplication & DB State
- [ ] Trigger a second run immediately after the first.
- [ ] Verify the backend logs report 0 new jobs inserted and 0 duplicate Slack messages sent.
- [ ] Verify on the dashboard table that sent jobs display `Sent to Slack` status tag, and rejected jobs display `Rejected` with the logged reason.

