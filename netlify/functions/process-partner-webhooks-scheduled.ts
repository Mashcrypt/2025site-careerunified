import type {Config, Handler} from '@netlify/functions'
import {processPendingWebhooks} from './_partnerWebhooks'

export const config: Config = {
  schedule: '*/5 * * * *',
}

export const handler: Handler = async () => {
  try {
    await processPendingWebhooks()
    return {statusCode: 200, body: 'Webhook queue processed'}
  } catch (error) {
    console.error('PARTNER_WEBHOOK_SCHEDULE_ERROR', error)
    return {statusCode: 500, body: 'Webhook queue processing failed'}
  }
}
