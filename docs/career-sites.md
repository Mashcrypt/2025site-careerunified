# Career Sites

Career Sites store a stable tenant configuration at `recruiters/{companyId}.careerSite`. The existing recruiter UID is the company ID for the current product; the display name is not used as an identifier.

## Configuration model

The server creates `companyId`, a lowercase kebab-case `slug`, `displayName`, sanitized `logo`, `brandColors`, `tagline`, `about`, `contact`, allow-listed `socialLinks`, `status`, SEO metadata, and `createdAt`/`updatedAt`. A collision keeps the first slug and assigns the later company a deterministic hash suffix.

## Local and production URLs

Local development uses `http://{slug}.localhost:8888` (or `{slug}.127.0.0.1.nip.io`) and the API accepts `?company={slug}` only when the request host is local. Production uses `https://{slug}.careerunified.com` and resolves the tenant from the request host. Unknown, reserved, malformed, unpublished, or disabled tenants return the same not-found response.

Set `CAREER_SITE_BASE_DOMAIN` when the production domain differs from `careerunified.com`. Configure wildcard DNS (`*.careerunified.com`) to the hosting provider and a wildcard TLS certificate before enabling the Netlify host redirect. HTTPS is enforced by the existing HSTS and redirect configuration.

## Recruiter and candidate workflow

The dashboard calls `career-site-admin` with the recruiter Firebase token. The server owns slug assignment and accepts only sanitized branding fields. Recruiters can publish, unpublish, preview, copy the URL, and save the configuration. The public endpoint calls the existing Direct Apply form with `source=career_site`; the application writer verifies that `companyId` matches the job owner, stores `sourceHostname`, and preserves the existing candidate/recruiter/dashboard workflow.

## Security and rollback

Public job data is read through `career-site-public`, which filters by recruiter ownership, active publication status, required public fields, and closing date. CVs remain private. Firestore prevents client-side writes to `careerSite`; admin functions use Firebase Admin verification and owner checks. Unpublishing immediately makes the public endpoint return not found while retaining the configuration and applications.

Existing recruiter records are migrated lazily the first time the dashboard loads the Career Site tab. A deployment rollback should first unpublish affected sites, then revert the functions and host redirect; the stored configuration is backward-compatible with the existing recruiter document.

## Recruiter invitations

Company owners can invite additional recruiters from People > Invite Members. Invitations are sent server-side through Resend and contain a single-use, seven-day link. The recipient can create a Career Unified account or sign in with the invited email, then accept the link. Acceptance creates a `recruiterMembers` record and grants Firebase claims for `recruiter`, `companyId`, and `recruiterRole`. Company-scoped dashboard data, jobs, applications, protected CV access, pipeline records, messages, and logos use that verified company claim.

Set `RESEND_API_KEY` and, optionally, `RESEND_FROM_EMAIL` in the Netlify environment. Invitation acceptance requires the signed-in email to exactly match the invited address. Revocation is not yet exposed in the dashboard; revoke the member claim and membership record through an authenticated Admin SDK operation if urgent removal is required.

## Routes

- `/.netlify/functions/career-site-admin` GET/PUT: authorized recruiter configuration.
- `/.netlify/functions/career-site-public` GET: host-resolved public site and published jobs.
- `/` and `/jobs/{job-slug}` on a wildcard tenant host: public career-site shell.
- `/apply.html?...&careerSite=1`: existing validated Direct Apply workflow.