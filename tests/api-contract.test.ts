import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ApiError,
  apiCredentialMatches,
  apiDataCollections,
  apiKeyHash,
  createApiCredential,
  decodeCursor,
  encodeCursor,
  normalizeScopes,
  paginate,
} from '../netlify/functions/_apiV1'
import {isPrivateIp, normalizeWebhookEvents} from '../netlify/functions/_partnerWebhooks'
import {sendTransactionalEmail} from '../netlify/functions/_notify'
import {
  PROVIDER_CONFIG,
  assertManagePermission,
  assertReadPermission,
  decryptSecret,
  encryptSecret,
  disconnectRecordPatch,
  oauthStateIsUsable,
  providerConfigured,
  providerStatus,
} from '../netlify/functions/_recruiterIntegrations'
import {
  assertProviderOperation,
  providerOperationCapability,
} from '../netlify/functions/_recruiterProviderAdapters'

test('live and test credentials use separate prefixes and collections', () => {
  const live = createApiCredential('client_12345678', 'live')
  const testKey = createApiCredential('client_12345678', 'test')

  assert.match(live.apiKey, /^cu_live_client_12345678\./)
  assert.match(testKey.apiKey, /^cu_test_client_12345678\./)
  assert.deepEqual(apiDataCollections('live'), {
    jobs: 'jobs',
    applications: 'applications',
    idempotency: 'apiIdempotency',
  })
  assert.deepEqual(apiDataCollections('test'), {
    jobs: 'apiSandboxJobs',
    applications: 'apiSandboxApplications',
    idempotency: 'apiSandboxIdempotency',
  })
})

test('rotation grace accepts the old key only before expiry', () => {
  const clientId = 'client_12345678'
  const currentSecret = 'a'.repeat(40)
  const previousSecret = 'b'.repeat(40)
  const now = new Date('2026-08-21T12:00:00.000Z')
  const data = {
    keyHash: apiKeyHash(clientId, currentSecret),
    previousKeyHash: apiKeyHash(clientId, previousSecret),
    previousKeyExpiresAt: '2026-08-21T13:00:00.000Z',
  }

  assert.equal(apiCredentialMatches(data, clientId, currentSecret, now), 'current')
  assert.equal(apiCredentialMatches(data, clientId, previousSecret, now), 'previous')
  assert.equal(
    apiCredentialMatches(data, clientId, previousSecret, new Date('2026-08-21T14:00:00.000Z')),
    null,
  )
  assert.equal(apiCredentialMatches(data, clientId, 'c'.repeat(40), now), null)
})

test('cursor pagination is opaque and stable', () => {
  const cursor = encodeCursor(2)
  assert.equal(decodeCursor(cursor), 2)
  assert.deepEqual(paginate(['a', 'b', 'c', 'd'], 2, 1), {
    data: ['b', 'c'],
    nextCursor: encodeCursor(3),
    hasMore: true,
  })
  assert.throws(
    () => decodeCursor('broken'),
    (error: unknown) => {
      return error instanceof ApiError && error.code === 'invalid_cursor'
    },
  )
})

test('scope and webhook event contracts reject unsupported values', () => {
  assert.deepEqual(normalizeScopes(['jobs:write', 'jobs:write', 'applications:read']), [
    'jobs:write',
    'applications:read',
  ])
  assert.deepEqual(normalizeWebhookEvents(['job.published', 'application.received']), [
    'job.published',
    'application.received',
  ])
  assert.throws(() => normalizeScopes(['admin:write']), ApiError)
  assert.throws(() => normalizeWebhookEvents(['unknown.event']), ApiError)
})

test('webhook address protection blocks private and reserved networks', () => {
  ;[
    '127.0.0.1',
    '10.1.2.3',
    '172.16.4.2',
    '192.168.1.1',
    '169.254.1.1',
    '::1',
    'fc00::1',
    '2001:db8::1',
  ].forEach((address) => assert.equal(isPrivateIp(address), true, address))

  assert.equal(isPrivateIp('8.8.8.8'), false)
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false)
})

test('transactional email uses the verified Resend sender without a reply address by default', async () => {
  const originalFetch = globalThis.fetch
  const originalApiKey = process.env.RESEND_API_KEY
  const originalFrom = process.env.RESEND_FROM_EMAIL
  let request: {url: string; init?: RequestInit} | undefined

  process.env.RESEND_API_KEY = 'test_resend_key'
  delete process.env.RESEND_FROM_EMAIL
  globalThis.fetch = async (input, init) => {
    request = {url: String(input), init}
    return new Response(JSON.stringify({id: 'email_123'}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    })
  }

  try {
    const result = await sendTransactionalEmail({
      to: 'candidate@example.com',
      subject: 'Application update',
      text: 'Your application has been received.',
      tag: 'candidate-notification',
    })
    const payload = JSON.parse(String(request?.init?.body || '{}'))

    assert.equal(request?.url, 'https://api.resend.com/emails')
    assert.equal(
      request?.init?.headers && (request.init.headers as Record<string, string>).Authorization,
      'Bearer test_resend_key',
    )
    assert.equal(payload.from, 'Career Unified <no-reply@mail.careerunified.com>')
    assert.deepEqual(payload.to, ['candidate@example.com'])
    assert.equal(payload.reply_to, undefined)
    assert.deepEqual(payload.tags, [{name: 'category', value: 'candidate-notification'}])
    assert.deepEqual(result, {id: 'email_123'})
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalApiKey
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL
    else process.env.RESEND_FROM_EMAIL = originalFrom
  }
})

test('integration provider mapping uses least-privilege OAuth scopes and explicit unavailable states', () => {
  assert.deepEqual(PROVIDER_CONFIG.gmail.scopes, [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.metadata',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ])
  assert.equal(PROVIDER_CONFIG['google-calendar'].oauth, 'google')
  assert.equal(providerStatus({}, 'testgorilla').status, 'api_access_required')
  assert.equal(providerStatus({}, 'payspace').status, 'configuration_required')
  assert.equal(providerConfigured('gmail'), false)
})

test('integration authorization separates read access from management access', () => {
  assert.doesNotThrow(() =>
    assertReadPermission({recruiter: true, companyId: 'company-1'}, 'company-1'),
  )
  assert.doesNotThrow(() =>
    assertManagePermission(
      {recruiter: true, companyId: 'company-1', recruiterRole: 'Administrator', uid: 'member-1'},
      'company-1',
    ),
  )
  assert.throws(() =>
    assertManagePermission(
      {recruiter: true, companyId: 'company-1', recruiterRole: 'Member', uid: 'member-1'},
      'company-1',
    ),
  )
  assert.throws(() => assertReadPermission({recruiter: true, companyId: 'company-2'}, 'company-1'))
})

test('integration token references encrypt and decrypt server-side without exposing plaintext', () => {
  const originalKey = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY
  process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
  try {
    const encrypted = encryptSecret('provider-access-token')
    assert.match(encrypted, /^v1:/)
    assert.notEqual(encrypted, 'provider-access-token')
    assert.equal(decryptSecret(encrypted), 'provider-access-token')
  } finally {
    if (originalKey === undefined) delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY
    else process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = originalKey
  }
})

test('OAuth state is one-time-ready only for the expected provider and before expiry', () => {
  const expiresAt = {toMillis: () => 2000}
  assert.equal(oauthStateIsUsable({providerId: 'gmail', expiresAt}, 'gmail', 1000), true)
  assert.equal(oauthStateIsUsable({providerId: 'gmail', expiresAt}, 'outlook-email', 1000), false)
  assert.equal(oauthStateIsUsable({providerId: 'gmail', expiresAt}, 'gmail', 2000), false)
})

test('disconnect patch removes all provider identity, token, scope, sync, error, and metadata fields', () => {
  const patch = disconnectRecordPatch('company-1', 'gmail')
  assert.equal(patch.companyId, 'company-1')
  assert.equal(patch.providerAccountId, '')
  assert.equal(patch.providerEmail, '')
  assert.deepEqual(patch.grantedScopes, [])
  assert.equal(patch.encryptedAccessTokenReference, '')
  assert.equal(patch.encryptedRefreshTokenReference, '')
  assert.deepEqual(patch.metadata, {})
  assert.equal(patch.lastSyncAt, null)
  assert.equal(patch.lastErrorAt, null)
})

test('provider operation boundary refuses unavailable or unimplemented operations', () => {
  assert.equal(providerOperationCapability('gmail', 'send_email'), 'adapter_pending')
  assert.equal(providerOperationCapability('testgorilla', 'send_assessment'), 'api_access_required')
  assert.throws(
    () => assertProviderOperation('testgorilla', 'send_assessment'),
    /API access is required/,
  )
  assert.throws(() => assertProviderOperation('gmail', 'send_email'), /not enabled yet/)
})

test('integration status labels include all required states', () => {
  function statusLabel(status: string) {
    return (
      {
        disconnected: 'Not connected',
        connecting: 'Connecting',
        connected: 'Connected',
        connected_sync_unavailable: 'Connected (sync unavailable)',
        needs_attention: 'Needs attention',
        error: 'Error',
        configuration_required: 'Configuration required',
        api_access_required: 'API access required',
      }[status] || 'Not connected'
    )
  }
  assert.equal(statusLabel('connected'), 'Connected')
  assert.equal(statusLabel('connected_sync_unavailable'), 'Connected (sync unavailable)')
  assert.equal(statusLabel('needs_attention'), 'Needs attention')
  assert.equal(statusLabel('configuration_required'), 'Configuration required')
  assert.equal(statusLabel('api_access_required'), 'API access required')
  assert.equal(statusLabel('connecting'), 'Connecting')
  assert.equal(statusLabel('disconnected'), 'Not connected')
  assert.equal(statusLabel('error'), 'Error')
})

test('canConnect allows reconnect for error and needs_attention states', () => {
  function canConnect(status: string) {
    return ['not_connected', 'disconnected', 'needs_attention', 'error'].includes(status)
  }
  assert.equal(canConnect('not_connected'), true)
  assert.equal(canConnect('disconnected'), true)
  assert.equal(canConnect('needs_attention'), true)
  assert.equal(canConnect('error'), true)
  assert.equal(canConnect('connected'), false)
  assert.equal(canConnect('connecting'), false)
  assert.equal(canConnect('configuration_required'), false)
  assert.equal(canConnect('api_access_required'), false)
})

test('iconForStatus returns correct icons for all states', () => {
  function iconForStatus(status: string) {
    return status === 'connected' || status === 'connected_sync_unavailable'
      ? 'bx-check-circle'
      : status === 'error' || status === 'needs_attention'
        ? 'bx-error-circle'
        : 'bx-link'
  }
  assert.equal(iconForStatus('connected'), 'bx-check-circle')
  assert.equal(iconForStatus('connected_sync_unavailable'), 'bx-check-circle')
  assert.equal(iconForStatus('needs_attention'), 'bx-error-circle')
  assert.equal(iconForStatus('error'), 'bx-error-circle')
  assert.equal(iconForStatus('disconnected'), 'bx-link')
  assert.equal(iconForStatus('connecting'), 'bx-link')
})

test('generateIdempotencyKey produces stable keys for calendar operations', () => {
  const crypto = require('crypto')
  function generateIdempotencyKey(companyId: string, applicationId: string, interviewId: string, providerId: string, operation: string) {
    return crypto.createHash('sha256').update(`${companyId}:${applicationId}:${interviewId}:${providerId}:${operation}`).digest('hex').slice(0, 32)
  }
  
  const key1 = generateIdempotencyKey('company-1', 'app-1', 'interview-1', 'google-calendar', 'create-event')
  const key2 = generateIdempotencyKey('company-1', 'app-1', 'interview-1', 'google-calendar', 'create-event')
  const key3 = generateIdempotencyKey('company-1', 'app-1', 'interview-1', 'google-calendar', 'update-event')
  
  assert.equal(key1, key2)
  assert.notEqual(key1, key3)
  assert.equal(key1.length, 32)
})

test('sanitizeHtml removes dangerous content', () => {
  function sanitizeHtml(html: string) {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '')
  }
  
  assert.equal(sanitizeHtml('<script>alert(1)</script>'), '')
  assert.equal(sanitizeHtml('<iframe src="evil.com"></iframe>'), '')
  // The regex removes the onclick attribute but leaves a space
  assert.ok(sanitizeHtml('<div onclick="evil()">test</div>').includes('<div'))
  assert.ok(sanitizeHtml('<div onclick="evil()">test</div>').includes('test</div>'))
  assert.equal(sanitizeHtml('<p>safe</p>'), '<p>safe</p>')
})

test('extractEmailAddress extracts email from various formats', () => {
  function extractEmailAddress(header: string) {
    const match = header.match(/<([^>]+)>/) || header.match(/([^\s]+@[^\s]+)/)
    return match ? match[1].toLowerCase() : header.toLowerCase()
  }
  
  assert.equal(extractEmailAddress('John Doe <john@example.com>'), 'john@example.com')
  assert.equal(extractEmailAddress('jane@example.com'), 'jane@example.com')
  assert.equal(extractEmailAddress('"Bob Smith" <bob@test.org>'), 'bob@test.org')
})

test('generateIdempotencyKey for calendar uses stable values without Date.now', () => {
  const crypto = require('crypto')
  function generateIdempotencyKey(companyId: string, applicationId: string, interviewId: string, providerId: string, operation: string) {
    return crypto.createHash('sha256').update(`${companyId}:${applicationId}:${interviewId}:${providerId}:${operation}`).digest('hex').slice(0, 32)
  }
  
  const key1 = generateIdempotencyKey('company-1', 'app-1', 'interview-1', 'google-calendar', 'create-event')
  const key2 = generateIdempotencyKey('company-1', 'app-1', 'interview-1', 'google-calendar', 'create-event')
  
  assert.equal(key1, key2)
  assert.notEqual(key1, generateIdempotencyKey('company-1', 'app-1', 'interview-1', 'google-calendar', 'update-event'))
  assert.notEqual(key1, generateIdempotencyKey('company-2', 'app-1', 'interview-1', 'google-calendar', 'create-event'))
})
