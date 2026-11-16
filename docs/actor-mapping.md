# Actor Field Mapping: `blackfalcondata/upwork-scraper`

Live run verification completed using input:
```json
{
  "query": "\"Next.js\" OR \"React\" OR \"Node.js\" OR \"TypeScript\" OR \"SaaS\" OR \"MVP\" OR \"RAG\" OR \"AI agent\" OR \"LLM\" OR \"OpenAI\" OR \"Claude\" OR \"voice agent\" OR \"Vapi\" OR \"Retell\" OR \"ElevenLabs\" OR \"n8n\" OR \"Supabase\" OR \"PostgreSQL\"",
  "sort": "newest",
  "maxAgeMinutes": 10,
  "verifiedPaymentOnly": true,
  "excludeLocations": ["Pakistan", "India"],
  "incrementalMode": true,
  "stateKey": "upwork-leads-dev",
  "maxResults": 20,
  "compact": false,
  "descriptionFormat": "text",
  "descriptionMaxLength": 0,
  "excludeEmptyFields": false,
  "enrichDetails": false
}
```

## Field Verification Table

| Required Field | Actor Output Field | Type in Live Data | Sample Value | Target Model Field | Notes |
|---|---|---|---|---|---|
| **Job ID** | `jobId` | `string` | `"2122335221823763736"` | `upworkJobId` | Unique Upwork job identifier |
| **Title** | `title` | `string` | `"AI Agencies and Senior Engineers"` | `title` | Job title |
| **Description** | `description` | `string` | `"Strong build team, thin pipeline?..."` | `description` | Returned as full text (`descriptionFormat: "text"`, `descriptionMaxLength: 0`) |
| **URL** | `url` | `string` | `"https://www.upwork.com/jobs/~02..."` | `url` | Canonical listing URL |
| **Publish Time** | `publishTime` | `string` (ISO 8601) | `"2026-11-16T17:33:01.213Z"` | `postedAt` | Parse as UTC `DateTime` |
| **Payment Verified** | `clientPaymentVerified` | `boolean` \| `null` | `true` | `paymentVerified` | Boolean verification flag |
| **Client Country** | `clientCountry` | `string` \| `null` | `"United States"` | `country` | Full country name |
| **Client Country Code** | `clientCountryCode` | `string` \| `null` | `"USA"` | `countryCode` | ISO country code |
| **Total Applicants** | `totalApplicants` | `number` \| `null` | `1` | `proposalCount` | Proposal/applicant count |
| **Change Type** | `changeType` | `string` \| `null` | `"NEW"` | `changeType` | Incremental change tag (`NEW`, `UPDATED`, `REAPPEARED`, `UNCHANGED`, `EXPIRED`, or `null`) |
| **Is Repost** | `isRepost` | `boolean` | `false` | `isRepost` | Boolean flag detecting reposted jobs |
| **Skills** | `skills` | `string[]` | `["Generative AI", ...]` | `skills` | List of skill tag strings |
| **Hourly Min** | `hourlyBudgetMin` | `number` \| `null` | `20` | `hourlyMin` | Minimum hourly budget |
| **Hourly Max** | `hourlyBudgetMax` | `number` \| `null` | `57` | `hourlyMax` | Maximum hourly budget |
| **Fixed Budget** | `budgetAmount` | `number` \| `null` | `null` | `fixedBudget` | Fixed budget amount |
| **Budget Currency** | `budgetCurrency` | `string` \| `null` | `null` | `budgetCurrency` | Currency (e.g. `USD`) |
| **Client Rating** | `clientRating` | `number` \| `null` | `4.99` | `clientRating` | Client star rating (0-5) |
| **Client Review Count** | `clientReviewCount` | `number` \| `null` | `6` | `clientReviewCount` | Total reviews client received |
| **Client Total Spent** | `clientTotalSpent` | `number` \| `null` | `12016.72` | `clientTotalSpent` | Total amount spent on Upwork in USD |

## Out-of-Scope / Prohibited Fields (Never Map, Store, or Log)
The following fields are explicitly returned by the actor but MUST be dropped and never stored, logged, or forwarded to Slack:
- `contactName`
- `contactEmail`
- `contactPhone`
- `extractedEmails`
- `extractedPhones`
- `extractedUrls`
- `socialProfiles`
- Phone verification (`phoneVerified` is OUT OF SCOPE per prompt requirements).
