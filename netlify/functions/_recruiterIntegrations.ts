import crypto from 'crypto'
import {ApplicationError, cleanText} from './_applicationUtils'

export const INTEGRATION_STATUSES = new Set([
  'not_connected',
  'connecting',
  'connected',
  'needs_attention',
  'reconnecting',
  'disconnected',
  'error',
  'configuration_required',
  'api_access_required',
])

export const PROVIDER_CONFIG: Record<
  string,
  {
    category: string
    oauth?: 'google' | 'microsoft'
    scopes?: string[]
    envPrefix?: string
    capability: 'oauth' | 'configuration_required' | 'api_access_required'
  }
> = {
  gmail: {
    category: 'email',
    oauth: 'google',
    envPrefix: 'GOOGLE',
      scopes: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.metadata',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    capability: 'oauth',
  },
  'outlook-email': {
    category: 'email',
    oauth: 'microsoft',
    envPrefix: 'MICROSOFT',
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Mail.Send',
      'Mail.ReadWrite',
    ],
    capability: 'oauth',
  },
  'google-calendar': {
    category: 'calendar',
    oauth: 'google',
    envPrefix: 'GOOGLE',
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ],
    capability: 'oauth',
  },
  'office-365-calendar': {
    category: 'calendar',
    oauth: 'microsoft',
    envPrefix: 'MICROSOFT',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Calendars.ReadWrite'],
    capability: 'oauth',
  },
  'indeed-assessments': {category: 'assessment', capability: 'api_access_required'},
  testgorilla: {category: 'assessment', capability: 'api_access_required'},
  hirevue: {category: 'video', capability: 'api_access_required'},
  'smart-vetting-solutions': {category: 'verification', capability: 'api_access_required'},
  payspace: {category: 'hris', capability: 'configuration_required'},
  sage: {category: 'hris', capability: 'configuration_required'},
  oracle: {category: 'hris', capability: 'configuration_required'},
  sap: {category: 'hris', capability: 'configuration_required'},
}

function encryptionKey() {
  const raw = String(process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY || '')
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('INTEGRATION_TOKEN_ENCRYPTION_KEY must be a 32-byte key.')
  return key
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = String(value || '').split(':')
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue)
    throw new Error('Invalid encrypted secret.')
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function providerConfig(providerId: string) {
  return PROVIDER_CONFIG[cleanText(providerId, 80).toLowerCase()]
}

export function providerConfigured(providerId: string) {
  const config = providerConfig(providerId)
  if (!config) return false
  if (config.capability !== 'oauth') return false
  const prefix = config.envPrefix || ''
  return Boolean(
    process.env[`${prefix}_CLIENT_ID`] &&
    process.env[`${prefix}_CLIENT_SECRET`] &&
    process.env[`${prefix}_REDIRECT_URI`],
  )
}

export function providerStatus(record: any, providerId: string) {
  const config = providerConfig(providerId)
  if (!config) return {status: 'error', capability: 'unknown'}
  if (record?.connectionStatus && INTEGRATION_STATUSES.has(record.connectionStatus)) {
    return {status: record.connectionStatus, capability: config.capability}
  }
  return {
    status:
      config.capability === 'oauth' && providerConfigured(providerId)
        ? 'not_connected'
        : config.capability,
    capability: config.capability,
  }
}

export function assertManagePermission(decoded: any, companyId: string) {
  const expected = cleanText(companyId, 160)
  const actual = cleanText(decoded.companyId || decoded.uid, 160)
  const allowed =
    decoded.admin === true ||
    (decoded.recruiter === true &&
      actual === expected &&
      (decoded.uid === expected || decoded.recruiterRole === 'Administrator'))
  if (!allowed)
    throw new ApplicationError(
      403,
      'You do not have permission to manage integrations for this workspace.',
    )
  return expected
}

export function assertReadPermission(decoded: any, companyId: string) {
  const expected = cleanText(companyId, 160)
  const actual = cleanText(decoded.companyId || decoded.uid, 160)
  if (decoded.admin !== true && !(decoded.recruiter === true && actual === expected)) {
    throw new ApplicationError(403, 'You do not have access to integrations for this workspace.')
  }
  return expected
}

export type IntegrationPermission = 
  | 'manage_integrations'
  | 'read_integrations'
  | 'send_email'
  | 'read_email'
  | 'reply_email'
  | 'sync_inbox'
  | 'manage_calendars'
  | 'read_calendars'
  | 'create_calendar_events'
  | 'update_calendar_events'
  | 'delete_calendar_events'
  | 'read_calendar_availability'

export function assertIntegrationPermission(decoded: any, companyId: string, permission: IntegrationPermission) {
  const expected = cleanText(companyId, 160)
  const actual = cleanText(decoded.companyId || decoded.uid, 160)
  const isAdmin = decoded.admin === true
  const isRecruiter = decoded.recruiter === true
  const isOwner = actual === expected
  const isAdministrator = decoded.recruiterRole === 'Administrator'
  const isMember = decoded.recruiterRole === 'Member'
  
  // Admin can do everything
  if (isAdmin) return expected
  
  // Must be a recruiter with matching company
  if (!isRecruiter || !isOwner) {
    throw new ApplicationError(403, 'You do not have access to this workspace.')
  }
  
  // Owner/Administrator can do everything
  if (isOwner || isAdministrator) return expected
  
  // Member permissions
  if (isMember) {
    const readOnlyPermissions: IntegrationPermission[] = [
      'read_integrations',
      'read_email',
      'read_calendars',
      'read_calendar_availability',
    ]
    
    if (!readOnlyPermissions.includes(permission)) {
      throw new ApplicationError(403, 'You do not have permission to perform this action.')
    }
    return expected
  }
  
  throw new ApplicationError(403, 'You do not have permission to perform this action.')
}

export function callbackUrl(provider: 'google' | 'microsoft') {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT'
  const value = String(process.env[`${prefix}_REDIRECT_URI`] || '')
  const isSecureProductionUrl = /^https:\/\//i.test(value)
  const isLocalDevelopmentUrl = /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?\//i.test(value)
  if (!value || (!isSecureProductionUrl && !isLocalDevelopmentUrl))
    throw new Error('OAuth redirect URI is not configured.')
  return value
}

export function oauthStateIsUsable(record: any, providerId: string, now = Date.now()) {
  return Boolean(
    record &&
    cleanText(record.providerId, 80).toLowerCase() === cleanText(providerId, 80).toLowerCase() &&
    Number(record.expiresAt?.toMillis?.() || record.expiresAt || 0) > now,
  )
}

export function disconnectRecordPatch(companyId: string, providerId: string) {
  return {
    companyId,
    providerId,
    connectionStatus: 'disconnected',
    providerAccountId: '',
    providerEmail: '',
    grantedScopes: [],
    connectedByUserId: '',
    connectedAt: null,
    lastSyncAt: null,
    lastErrorCode: '',
    lastErrorAt: null,
    metadata: {},
    metadataVersion: '1',
    encryptedAccessTokenReference: '',
    encryptedRefreshTokenReference: '',
  }
}

export function safeProviderError(error: unknown) {
  const source = error as any
  const code = String(source?.code || source?.message || 'provider_error')
    .replace(/[^a-z0-9_.-]/gi, '_')
    .slice(0, 80)
  return code || 'provider_error'
}

export async function auditIntegration(
  admin: any,
  entry: {
    companyId: string
    providerId: string
    userId?: string
    action: string
    status?: string
    errorCode?: string
  },
) {
  await admin
    .firestore()
    .collection('integrationAuditLogs')
    .add({
      companyId: entry.companyId,
      providerId: entry.providerId,
      userId: entry.userId || '',
      action: entry.action,
      status: entry.status || '',
      errorCode: entry.errorCode || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
}

export function publicIntegrationRecord(record: any, providerId: string) {
  const state = providerStatus(record, providerId)
  return {
    providerId,
    status: state.status,
    capability: state.capability,
    providerAccountId: cleanText(record?.providerAccountId, 180),
    providerEmail: cleanText(record?.providerEmail, 254),
    grantedScopes: Array.isArray(record?.grantedScopes)
      ? record.grantedScopes.map((scope: unknown) => cleanText(scope, 240)).slice(0, 40)
      : [],
    connectedAt: record?.connectedAt?.toDate?.()?.toISOString?.() || record?.connectedAt || '',
    lastSyncAt: record?.lastSyncAt?.toDate?.()?.toISOString?.() || record?.lastSyncAt || '',
    updatedAt: record?.updatedAt?.toDate?.()?.toISOString?.() || record?.updatedAt || '',
    lastErrorCode: cleanText(record?.lastErrorCode, 80),
    lastErrorAt: record?.lastErrorAt?.toDate?.()?.toISOString?.() || record?.lastErrorAt || '',
    metadataVersion: cleanText(record?.metadataVersion, 20) || '1',
  }
}
