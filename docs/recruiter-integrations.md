# Recruiter Integrations

The recruiter Integrations page uses server-owned connection records. Provider access tokens and refresh tokens are encrypted with `INTEGRATION_TOKEN_ENCRYPTION_KEY` and are never returned to the browser or stored in browser storage.

## OAuth configuration

Set these Netlify environment variables before enabling live OAuth:

- `INTEGRATION_TOKEN_ENCRYPTION_KEY`: 32-byte key encoded as 64 hexadecimal characters or base64.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`: the exact HTTPS URL for `/.netlify/functions/recruiter-integration-oauth`.
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID`: tenant ID or `common`.
- `MICROSOFT_REDIRECT_URI`: the exact HTTPS URL for `/.netlify/functions/recruiter-integration-oauth`.

Register the exact redirect URI in both provider consoles. Do not put client secrets in HTML, JavaScript, Firestore client documents, or environment variables exposed to the frontend.

## Current provider readiness

- Gmail and Google Calendar: OAuth start, callback state validation, encrypted token references, provider identity, scopes, connect, reconnect, disconnect, and redacted status are implemented. Gmail message operations and Calendar event/availability operations still require provider API adapter work.
- Outlook Email and Office 365 Calendar: Microsoft OAuth start, callback state validation, encrypted token references, provider identity, scopes, connect, reconnect, disconnect, and redacted status are implemented. Microsoft Graph message and calendar operations still require provider API adapter work.
- Indeed Assessments, TestGorilla, HireVue, and Smart Vetting Solutions: explicitly report API access required until approved provider APIs and credentials are supplied.
- PaySpace, Sage, Oracle, and SAP: explicitly report configuration required until provider endpoint, authentication, and sync mappings are supplied.

The provider operation boundary is in `netlify/functions/_recruiterProviderAdapters.ts`. It rejects unavailable or unimplemented operations instead of returning fake success.

## Server collections

- `recruiterIntegrations`: one record per company/provider. Contains encrypted token references and redacted connection metadata.
- `recruiterIntegrationOAuthStates`: short-lived, one-time OAuth state records.
- `integrationAuditLogs`: provider connection and failure audit events without tokens or raw provider errors.

Firestore client rules do not grant direct access to these collections; access is through the authenticated Netlify functions.
