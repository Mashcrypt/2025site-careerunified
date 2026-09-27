import {ApplicationError, cleanText} from './_applicationUtils'
import {PROVIDER_CONFIG, providerConfig} from './_recruiterIntegrations'

export type ProviderOperation =
  | 'send_email'
  | 'read_email'
  | 'create_calendar_event'
  | 'update_calendar_event'
  | 'cancel_calendar_event'
  | 'send_assessment'
  | 'create_video_interview'
  | 'create_background_check'
  | 'sync_hris'

const OPERATION_CATEGORIES: Record<ProviderOperation, string[]> = {
  send_email: ['email'],
  read_email: ['email'],
  create_calendar_event: ['calendar'],
  update_calendar_event: ['calendar'],
  cancel_calendar_event: ['calendar'],
  send_assessment: ['assessment'],
  create_video_interview: ['video'],
  create_background_check: ['verification'],
  sync_hris: ['hris'],
}

export function assertProviderOperation(providerId: string, operation: ProviderOperation) {
  const normalizedProviderId = cleanText(providerId, 80).toLowerCase()
  const config = providerConfig(normalizedProviderId)
  if (!config) throw new ApplicationError(400, 'Unknown integration provider.')
  if (!OPERATION_CATEGORIES[operation]?.includes(config.category)) {
    throw new ApplicationError(400, 'That operation is not supported by this provider.')
  }
  if (config.capability !== 'oauth') {
    throw new ApplicationError(
      409,
      config.capability === 'api_access_required'
        ? 'Provider API access is required before this operation is available.'
        : 'Provider configuration is required before this operation is available.',
    )
  }
  throw new ApplicationError(501, 'This provider operation is not enabled yet.')
}

export function providerOperationCapability(providerId: string, operation: ProviderOperation) {
  const config = PROVIDER_CONFIG[cleanText(providerId, 80).toLowerCase()]
  if (!config || !OPERATION_CATEGORIES[operation]?.includes(config.category)) return 'unsupported'
  return config.capability === 'oauth' ? 'adapter_pending' : config.capability
}
