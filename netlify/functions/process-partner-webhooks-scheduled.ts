import {schedule} from '@netlify/functions'
import {processPendingWebhooks} from './_partnerWebhooks'

const scheduledHandler = async () => {
  try {
    await processPendingWebhooks()
    return {statusCode: 200}
  } catch (error) {
    console.error('SCHEDULED_PARTNER_WEBHOOK_DISPATCH_ERROR', error)
    return {statusCode: 500}
  }
}

// Immediate delivery uses the background function. This low-frequency fallback
// only processes events that need retrying after a partner endpoint failure.
export const handler = schedule('*/15 * * * *', scheduledHandler)
