import crypto from 'crypto'
import {ApiError, cleanText} from './_apiV1'

export type SapJobSyncEntry = {
  externalJobId: string
  state: 'active' | 'closed'
  source: Record<string, any>
}

export function normalizeSapJobBatch(body: unknown): SapJobSyncEntry[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(
      400,
      'invalid_sap_batch',
      'Send one SAP job record or an object containing a jobs array.',
    )
  }
  const payload = body as Record<string, any>
  if (payload.jobs !== undefined && !Array.isArray(payload.jobs)) {
    throw new ApiError(400, 'invalid_sap_batch', 'The jobs field must be an array.')
  }
  const entries = Array.isArray(payload.jobs) ? payload.jobs : [payload]
  if (!entries.length || entries.length > 100) {
    throw new ApiError(
      400,
      'invalid_sap_batch',
      'Send between 1 and 100 SAP job records per request.',
    )
  }

  const normalized = entries.map((entry: any) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ApiError(400, 'invalid_sap_job', 'Each SAP job record must be a JSON object.')
    }
    const externalJobId = cleanText(entry.externalJobId || entry.jobReqId, 180)
    const state = cleanText(entry.status, 40).toLowerCase()
    if (!externalJobId || !['active', 'closed'].includes(state)) {
      throw new ApiError(
        400,
        'invalid_sap_job',
        'Each record needs externalJobId and status mapped to active or closed.',
      )
    }
    return {
      externalJobId,
      state: state as SapJobSyncEntry['state'],
      source:
        entry.job && typeof entry.job === 'object' && !Array.isArray(entry.job) ? entry.job : entry,
    }
  })
  const uniqueIds = new Set(normalized.map((entry) => entry.externalJobId))
  if (uniqueIds.size !== normalized.length) {
    throw new ApiError(
      400,
      'duplicate_sap_job_id',
      'A batch cannot contain duplicate SAP requisition IDs.',
    )
  }
  return normalized
}

export function sapJobDocumentId(clientId: string, externalJobId: string) {
  return `sap_${crypto
    .createHash('sha256')
    .update(`${clientId}:${externalJobId}`)
    .digest('hex')
    .slice(0, 32)}`
}
