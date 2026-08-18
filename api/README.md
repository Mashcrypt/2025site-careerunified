# Career Unified Partner API

The Career Unified Partner API lets approved organisations distribute opportunities, publish and
manage their own vacancies, receive Direct Apply applications, and subscribe to recruitment events.

Base URL: `https://careerunified.com/api/v1`

Contract: `https://careerunified.com/api/openapi.yaml`

Interactive documentation: `https://careerunified.com/api/`

## Public discovery

Public discovery endpoints do not expose recruiter email addresses, candidate records, CVs, profile
fields, application answers, or internal Firebase identifiers.

```http
GET /api/v1/jobs?limit=25&q=finance
GET /api/v1/jobs/{slug-or-id}
GET /api/v1/bursaries?limit=25&faculty=Engineering
GET /api/v1/bursaries/{slug-or-id}
```

List responses use opaque cursor pagination:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "limit": 25,
    "hasMore": false,
    "nextCursor": null
  }
}
```

## Partner authentication

Partner API keys are created by a Career Unified administrator for an approved recruiter account.
Keys use the format `cu_live_<client-id>.<secret>` and are displayed only once. Store them in a
server-side secret manager. Never place a partner key in browser JavaScript, a mobile application,
source control, Sanity, or public environment variables.

Send the key using one of these headers:

```http
X-API-Key: cu_live_...
```

```http
Authorization: Bearer cu_live_...
```

Every client is restricted to its linked recruiter organisation and explicit scopes:

| Scope                | Access                                                          |
| -------------------- | --------------------------------------------------------------- |
| `jobs:read`          | Reserved for protected listing integrations                     |
| `jobs:write`         | Create, update, and close the organisation's jobs               |
| `applications:read`  | Read applications submitted to the organisation's jobs          |
| `applications:write` | Move the organisation's applications through recruitment stages |
| `webhooks:manage`    | Create, view, and disable webhook endpoints                     |

Creating jobs through the API uses the same recruiter package and single-job-credit rules as the
Career Unified dashboard. An API key cannot bypass billing or publish for another organisation.

## Create an API client

This administrator-only endpoint requires a Firebase ID token carrying the `admin: true` custom
claim. It is not a partner endpoint.

```http
POST /api/v1/admin/clients
Authorization: Bearer <firebase-admin-id-token>
Content-Type: application/json

{
  "name": "Example ATS production",
  "recruiterId": "firebase-recruiter-uid",
  "scopes": ["jobs:write", "applications:read", "applications:write", "webhooks:manage"],
  "rateLimitPerMinute": 600,
  "allowedOrigins": []
}
```

The response contains the API key once. `allowedOrigins` should remain empty for server-to-server
integrations. Add an HTTPS origin only when a reviewed browser integration is unavoidable.

Administrators can list and revoke clients:

```http
GET /api/v1/admin/clients
DELETE /api/v1/admin/clients/{clientId}
```

## Partner jobs

```http
POST /api/v1/jobs
PATCH /api/v1/jobs/{jobId}
POST /api/v1/jobs/{jobId}/close
```

Every `POST /jobs` request must include a unique `Idempotency-Key` header. Retrying the same JSON
payload with the same key returns the original job and never consumes a second single-job credit.
Reusing the key with different JSON returns `409 idempotency_conflict`.

The recruiter company profile is authoritative. API payloads cannot replace the linked company's
name, logo, website, email address, or social profiles.

```http
POST /api/v1/jobs
Content-Type: application/json
Idempotency-Key: ats-job-48392-create

{
  "title": "Junior Financial Analyst",
  "category": "internship",
  "employmentType": "Full-time",
  "experienceLevel": "Graduate",
  "description": "Role description and responsibilities.",
  "city": "Johannesburg",
  "country": "South Africa",
  "salary": "Market related",
  "closingDate": "2026-09-30",
  "applicationMethod": "direct",
  "screeningQuestions": []
}
```

Supported application methods are `direct`, `external`, and `email`. External applications require
an HTTPS `applyLink`.

## Applications

Application endpoints only return records belonging to jobs owned by the API client's recruiter
account.

```http
GET /api/v1/jobs/{jobId}/applications
GET /api/v1/applications/{applicationId}
PATCH /api/v1/applications/{applicationId}
```

```json
{
  "status": "shortlisted"
}
```

Protected application responses include the submitted contact snapshot and answers, but never
return Firebase Storage paths, Netlify Blob keys, API credentials, private recruiter notes, or
employment-equity profile fields. CV file delivery remains inside Career Unified's authenticated
recruiter workflow.

## Webhooks

Supported events:

- `job.published`
- `job.updated`
- `job.closed`
- `application.received`
- `application.stage_changed`

Create an endpoint:

```http
POST /api/v1/webhooks
Content-Type: application/json

{
  "url": "https://partner.example.com/webhooks/career-unified",
  "events": ["application.received", "application.stage_changed"],
  "description": "Production recruitment events"
}
```

The response contains a `whsec_...` signing secret once. Webhook URLs must be public HTTPS hosts;
localhost, private-network and unresolved destinations are rejected.

Verify the signature by computing HMAC-SHA256 over:

```text
<X-Career-Unified-Timestamp>.<raw-request-body>
```

Compare the result with the hexadecimal value after `v1=` in
`X-Career-Unified-Signature`. Reject old timestamps to prevent replay attacks. Delivery identifiers
are stable and should be used for idempotent processing.

Webhook events are queued, delivered by a background function, signed, retried with backoff, and
recorded in an audit collection. Application events contain identifiers and workflow status only;
partners retrieve authorised details through the API.

The Netlify environment must define `PARTNER_API_SIGNING_SECRET` with at least 32 unpredictable
characters before webhook endpoints can be created.

## Errors and operations

Errors use a stable envelope:

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "The applications:read scope is required.",
    "requestId": "..."
  }
}
```

Every response includes `X-Request-Id` and `X-API-Version`. Write operations create server-side audit
records. `429` responses include `Retry-After`. API keys can be revoked without changing recruiter
login credentials.

## Partner onboarding checklist

1. Approve and verify the recruiter organisation.
2. Agree on permitted data purposes and POPIA responsibilities.
3. Test against a separate Netlify branch deployment and Firebase test project.
4. Create a narrowly scoped production API client.
5. Store the API and webhook secrets in the partner's server-side secret manager.
6. Verify webhook signatures and idempotent event handling.
7. Review usage and audit logs before increasing rate limits.
