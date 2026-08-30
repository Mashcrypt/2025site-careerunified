import type {Handler} from '@netlify/functions'
import {ApiError, cleanText} from './_apiV1'
import {processWebhookQueue} from './_partnerWebhooks'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return {statusCode: 405, body: 'Method Not Allowed'}

  try {
    const body = JSON.parse(event.body || '{}')
    const eventId = cleanText(body.eventId, 180)
    const environment = cleanText(body.environment, 20) === 'test' ? 'test' : 'live'
    const signature = cleanText(
      event.headers['x-career-unified-dispatch'] || event.headers['X-Career-Unified-Dispatch'],
      128,
    )
    if (!eventId || !signature) return {statusCode: 401, body: 'Unauthorized'}
    await processWebhookQueue(eventId, environment, signature)
    return {statusCode: 202, body: 'Accepted'}
  } catch (error) {
    if (error instanceof ApiError) return {statusCode: error.statusCode, body: error.message}
    console.error('PARTNER_WEBHOOK_DISPATCH_ERROR', error)
    return {statusCode: 500, body: 'Webhook dispatch failed'}
  }
}
