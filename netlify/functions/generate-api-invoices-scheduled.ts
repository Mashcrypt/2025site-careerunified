import type {Config, Handler} from '@netlify/functions'
import {generateApiInvoicesForMonth} from './_apiBilling'

export const config: Config = {
  schedule: '30 2 * * *',
}

export const handler: Handler = async () => {
  try {
    const result = await generateApiInvoicesForMonth()
    return {statusCode: 200, body: JSON.stringify(result)}
  } catch (error) {
    console.error('API_INVOICE_GENERATION_ERROR', error)
    return {statusCode: 500, body: 'API invoice generation failed'}
  }
}
