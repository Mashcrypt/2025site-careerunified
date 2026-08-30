import type {Config, Handler} from '@netlify/functions'
import {createUsageAlert} from './_apiV1'
import {getAdmin} from './_firebaseAdmin'

export const config: Config = {
  schedule: '*/15 * * * *',
}

export const handler: Handler = async () => {
  const admin = getAdmin()
  const db = admin.firestore()
  const day = new Date().toISOString().slice(0, 10)
  try {
    const [health, failedWebhooks] = await Promise.all([
      db.doc(`apiHealthDaily/${day}`).get(),
      db.collection('apiWebhookEvents').where('status', '==', 'failed').limit(100).get(),
    ])
    const data = health.data() || {}
    const total = Number(data.totalRequests || 0)
    const serverErrors = Number(data.serverErrors || 0)
    if (total >= 20 && serverErrors / total >= 0.05) {
      await createUsageAlert({
        admin,
        clientId: 'platform',
        recruiterId: 'platform',
        organizationId: 'career-unified',
        type: 'api_error_rate',
        severity: 'critical',
        message: `The Partner API server error rate is ${((serverErrors / total) * 100).toFixed(1)}% today.`,
        dedupeKey: `platform_${day}_api_error_rate`,
      })
    }
    if (failedWebhooks.size >= 10) {
      await createUsageAlert({
        admin,
        clientId: 'platform',
        recruiterId: 'platform',
        organizationId: 'career-unified',
        type: 'webhook_failure_backlog',
        severity: 'critical',
        message: `${failedWebhooks.size} webhook events currently require attention.`,
        dedupeKey: `platform_${day}_webhook_failure_backlog`,
      })
    }
    return {statusCode: 200, body: 'API health checked'}
  } catch (error) {
    console.error('PARTNER_API_MONITOR_ERROR', error)
    return {statusCode: 500, body: 'API health check failed'}
  }
}
