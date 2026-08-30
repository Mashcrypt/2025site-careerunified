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
