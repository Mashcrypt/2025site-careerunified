import type {Config, Handler} from '@netlify/functions'
import {getAdmin} from './_firebaseAdmin'

export const config: Config = {
  schedule: '15 3 * * *',
}

const DAY_MS = 24 * 60 * 60 * 1000
const DELETE_BATCH_SIZE = 350

async function deleteOlderThan(collection: string, field: string, cutoff: Date) {
  const admin = getAdmin()
  const db = admin.firestore()
  const snapshot = await db
    .collection(collection)
    .where(field, '<', admin.firestore.Timestamp.fromDate(cutoff))
    .limit(DELETE_BATCH_SIZE)
    .get()
  if (snapshot.empty) return 0

  const batch = db.batch()
  snapshot.docs.forEach((document) => batch.delete(document.ref))
  await batch.commit()
  return snapshot.size
}

async function clearExpiredPreviousKeys(now: Date) {
  const admin = getAdmin()
  const db = admin.firestore()
  const snapshot = await db
    .collection('apiClients')
    .where('previousKeyExpiresAt', '<=', admin.firestore.Timestamp.fromDate(now))
    .limit(DELETE_BATCH_SIZE)
    .get()
  if (snapshot.empty) return 0

  const batch = db.batch()
  snapshot.docs.forEach((document) => {
    batch.update(document.ref, {
      previousKeyHash: admin.firestore.FieldValue.delete(),
      previousKeyPrefix: admin.firestore.FieldValue.delete(),
      previousKeyExpiresAt: admin.firestore.FieldValue.delete(),
      previousKeyLastUsedAt: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  })
  await batch.commit()
  return snapshot.size
}

export const handler: Handler = async () => {
  const now = new Date()
  try {
    const [
      rotations,
      sandboxJobs,
      sandboxApplications,
      liveIdempotency,
      testIdempotency,
      auditLogs,
      webhookEvents,
      webhookDeliveries,
    ] = await Promise.all([
      clearExpiredPreviousKeys(now),
      deleteOlderThan('apiSandboxJobs', 'createdAt', new Date(now.getTime() - 30 * DAY_MS)),
      deleteOlderThan('apiSandboxApplications', 'createdAt', new Date(now.getTime() - 30 * DAY_MS)),
      deleteOlderThan('apiIdempotency', 'createdAt', new Date(now.getTime() - 7 * DAY_MS)),
      deleteOlderThan('apiSandboxIdempotency', 'createdAt', new Date(now.getTime() - 7 * DAY_MS)),
      deleteOlderThan('apiAuditLogs', 'createdAt', new Date(now.getTime() - 365 * DAY_MS)),
      deleteOlderThan('apiWebhookEvents', 'createdAt', new Date(now.getTime() - 90 * DAY_MS)),
      deleteOlderThan('apiWebhookDeliveries', 'createdAt', new Date(now.getTime() - 90 * DAY_MS)),
    ])

    return {
      statusCode: 200,
      body: JSON.stringify({
        rotations,
        sandboxJobs,
        sandboxApplications,
        liveIdempotency,
        testIdempotency,
        auditLogs,
        webhookEvents,
        webhookDeliveries,
      }),
    }
  } catch (error) {
    console.error('PARTNER_API_CLEANUP_ERROR', error)
    return {statusCode: 500, body: 'Partner API cleanup failed'}
  }
}
