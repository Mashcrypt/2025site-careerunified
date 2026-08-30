import type {Config, Handler} from '@netlify/functions'
import {getAdmin} from './_firebaseAdmin'
import {processPersonalizedNotifications} from './_personalizedNotifications'

export const config: Config = {schedule: '*/15 * * * *'}

export const handler: Handler = async () => {
  if (String(process.env.PERSONALIZED_NOTIFICATIONS_ENABLED || '').toLowerCase() !== 'true') {
    console.info('PERSONALISED_NOTIFICATIONS_PAUSED')
    return {statusCode: 200, body: JSON.stringify({status: 'paused'})}
  }
  try {
    const testEmails = String(process.env.PERSONALIZED_NOTIFICATIONS_TEST_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
    const result = await processPersonalizedNotifications(getAdmin(), {
      dryRun: String(process.env.PERSONALIZED_NOTIFICATIONS_DRY_RUN || '').toLowerCase() === 'true',
      testEmails,
    })
    console.info('PERSONALISED_NOTIFICATION_RUN_COMPLETE', result)
    return {statusCode: 200, body: JSON.stringify(result)}
  } catch (error) {
    console.error('PERSONALISED_NOTIFICATION_PROCESSOR_FAILED', error)
    return {statusCode: 500, body: 'Notification processing failed'}
  }
}
