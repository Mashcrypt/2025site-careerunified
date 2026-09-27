;(() => {
  'use strict'

  const CATEGORY_ALL = 'all'
  const STATUS = {
    disconnected: 'disconnected',
    connecting: 'connecting',
    connected: 'connected',
    connected_sync_unavailable: 'connected_sync_unavailable',
    needs_attention: 'needs_attention',
    error: 'error',
  }

  const CATEGORIES = [
    {id: 'email', name: 'Email Integrations'},
    {id: 'calendar', name: 'Calendar Integrations'},
    {id: 'assessment', name: 'Assessment Integrations'},
    {id: 'video', name: 'Video Interviewing'},
    {id: 'verification', name: 'Background Verification'},
    {id: 'hris', name: 'HRIS & ERP Integrations'},
  ]

  const INTEGRATIONS = [
    {
      id: 'gmail',
      name: 'Gmail',
      category: 'email',
      capability: 'oauth',
      description:
        'Connect your email account to send and receive recruiter messages from the Career Unified inbox.',
      logo: 'https://cdn.simpleicons.org/gmail',
      icon: 'bx-envelope',
      iconClass: 'is-gmail',
      learnMoreUrl: '#',
      requiredScopes: [
        'Sending email',
        'Reading email',
        'Managing drafts',
        'Reading mailbox metadata',
      ],
    },
    {
      id: 'outlook-email',
      name: 'Outlook Email',
      category: 'email',
      capability: 'oauth',
      description:
        'Connect your email account to send and receive recruiter messages from the Career Unified inbox.',
      logo: 'https://cdn.simpleicons.org/microsoftoutlook',
      icon: 'bx-envelope',
      iconClass: 'is-outlook',
      learnMoreUrl: '#',
      requiredScopes: [
        'Sending email',
        'Reading email',
        'Managing drafts',
        'Reading mailbox metadata',
      ],
    },
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      category: 'calendar',
      capability: 'oauth',
      description:
        'Sync interviews, meetings, availability, and candidate events with your calendar.',
      logo: 'https://cdn.simpleicons.org/googlecalendar',
      icon: 'bx-calendar-event',
      iconClass: 'is-google-calendar',
      learnMoreUrl: '#',
      requiredScopes: [
        'Create calendar events',
        'Read availability',
        'Update or cancel interview events',
      ],
    },
    {
      id: 'office-365-calendar',
      name: 'Office 365 Calendar',
      category: 'calendar',
      capability: 'oauth',
      description:
        'Sync interviews, meetings, availability, and candidate events with your calendar.',
      logo: 'https://cdn.simpleicons.org/microsoft',
      icon: 'bx-calendar-event',
      iconClass: 'is-office-calendar',
      learnMoreUrl: '#',
      requiredScopes: [
        'Create calendar events',
        'Read availability',
        'Update or cancel interview events',
      ],
    },
    {
      id: 'indeed-assessments',
      name: 'Indeed Assessments',
      category: 'assessment',
      capability: 'api_access_required',
      description:
        'Send skills assessments to candidates and track assessment results from the recruiter workspace.',
      logo: 'https://cdn.simpleicons.org/indeed',
      icon: 'bx-check-shield',
      iconClass: 'is-assessment',
      learnMoreUrl: '#',
      requiredScopes: ['Create assessment invitations', 'Read assessment results'],
    },
    {
      id: 'testgorilla',
      name: 'TestGorilla',
      category: 'assessment',
      capability: 'api_access_required',
      description:
        'Send skills assessments to candidates and track assessment results from the recruiter workspace.',
      logo: 'https://cdn.simpleicons.org/testgorilla',
      icon: 'bx-check-shield',
      iconClass: 'is-assessment',
      learnMoreUrl: '#',
      requiredScopes: ['Create assessment invitations', 'Read assessment results'],
    },
    {
      id: 'hirevue',
      name: 'HireVue',
      category: 'video',
      capability: 'api_access_required',
      description:
        'Invite candidates to structured video interviews and review interview responses.',
      logo: 'https://cdn.simpleicons.org/hirevue',
      icon: 'bx-video',
      iconClass: 'is-video',
      learnMoreUrl: '#',
      requiredScopes: ['Create interview invitations', 'Read interview responses'],
    },
    {
      id: 'smart-vetting-solutions',
      name: 'Smart Vetting Solutions',
      category: 'verification',
      capability: 'api_access_required',
      description:
        'Request and track candidate background verification checks from the hiring workflow.',
      logo: '',
      icon: 'bx-badge-check',
      iconClass: 'is-verification',
      learnMoreUrl: '#',
      requiredScopes: ['Create verification requests', 'Read verification results'],
    },
    {
      id: 'payspace',
      name: 'PaySpace',
      category: 'hris',
      capability: 'configuration_required',
      description:
        'Connect your HR or ERP system to synchronize employee, hiring, and onboarding information.',
      logo: 'https://cdn.simpleicons.org/payspace',
      icon: 'bx-buildings',
      iconClass: 'is-hris',
      learnMoreUrl: '#',
      requiredScopes: ['Read employee records', 'Create onboarding records'],
    },
    {
      id: 'sage',
      name: 'Sage',
      category: 'hris',
      capability: 'configuration_required',
      description:
        'Connect your HR or ERP system to synchronize employee, hiring, and onboarding information.',
      logo: 'https://cdn.simpleicons.org/sage',
      icon: 'bx-buildings',
      iconClass: 'is-hris',
      learnMoreUrl: '#',
      requiredScopes: ['Read employee records', 'Create onboarding records'],
    },
    {
      id: 'oracle',
      name: 'Oracle',
      category: 'hris',
      capability: 'configuration_required',
      description:
        'Connect your HR or ERP system to synchronize employee, hiring, and onboarding information.',
      logo: 'https://cdn.simpleicons.org/oracle',
      icon: 'bx-buildings',
      iconClass: 'is-hris',
      learnMoreUrl: '#',
      requiredScopes: ['Read employee records', 'Create onboarding records'],
    },
    {
      id: 'sap',
      name: 'SAP',
      category: 'hris',
      capability: 'configuration_required',
      description:
        'Connect your HR or ERP system to synchronize employee, hiring, and onboarding information.',
      logo: 'https://cdn.simpleicons.org/sap',
      icon: 'bx-buildings',
      iconClass: 'is-hris',
      learnMoreUrl: '#',
      requiredScopes: ['Read employee records', 'Create onboarding records'],
    },
  ].map((provider) => ({
    ...provider,
    apiConfiguration: {status: 'not_configured', endpoint: '', clientId: ''},
    enabled: true,
  }))

  // Provider tokens and connection records are server-owned. This client only receives redacted status.
  const integrationService = {
    async request(action, providerId = '') {
      const token = await context.getIdToken()
      const response = await fetch('/.netlify/functions/recruiter-integrations', {
        method: action === 'status' ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(action === 'status' ? {} : {'Content-Type': 'application/json'}),
        },
        body: action === 'status' ? undefined : JSON.stringify({providerId, action}),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const error = new Error(payload.error || 'The integration request could not be completed.')
        error.status = response.status
        error.payload = payload
        throw error
      }
      return payload
    },
  }

  let context = null
  let records = {}
  let activeProviderId = ''
  let modalAction = 'connect'

  function getProvider(providerId) {
    return INTEGRATIONS.find((provider) => provider.id === providerId)
  }

  function categoryName(categoryId) {
    return CATEGORIES.find((category) => category.id === categoryId)?.name || categoryId
  }

  function statusLabel(status) {
    return (
      {
        [STATUS.disconnected]: 'Not connected',
        [STATUS.connecting]: 'Connecting',
        [STATUS.connected]: 'Connected',
        [STATUS.connected_sync_unavailable]: 'Connected (sync unavailable)',
        [STATUS.needs_attention]: 'Needs attention',
        [STATUS.error]: 'Error',
        configuration_required: 'Configuration required',
        api_access_required: 'API access required',
      }[status] || 'Not connected'
    )
  }

  function iconForStatus(status) {
    return status === STATUS.connected || status === STATUS.connected_sync_unavailable
      ? 'bx-check-circle'
      : status === STATUS.error || status === STATUS.needs_attention
        ? 'bx-error-circle'
        : 'bx-link'
  }

  function canConnect(status) {
    return ['not_connected', 'disconnected', 'connecting', 'needs_attention', 'error'].includes(status)
  }

  function matchesSearch(provider, query) {
    const haystack =
      `${provider.name} ${categoryName(provider.category)} ${provider.description}`.toLowerCase()
    return haystack.includes(query.toLowerCase().trim())
  }

  function filteredProviders() {
    const query = document.getElementById('integrationSearch')?.value || ''
    const category = document.getElementById('integrationCategory')?.value || CATEGORY_ALL
    return INTEGRATIONS.filter(
      (provider) =>
        (category === CATEGORY_ALL || provider.category === category) &&
        matchesSearch(provider, query),
    )
  }

  function renderCategoryOptions() {
    const select = document.getElementById('integrationCategory')
    if (!select) return
    select.replaceChildren(new Option('All integrations', CATEGORY_ALL))
    CATEGORIES.forEach((category) => select.append(new Option(category.name, category.id)))
  }

  function renderCounts() {
    const pills = document.getElementById('integrationCategoryPills')
    if (!pills) return
    pills.replaceChildren(
      ...[{id: CATEGORY_ALL, name: 'All'}, ...CATEGORIES].map((category, index) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `integration-category-pill${index === 0 ? ' is-active' : ''}`
        button.dataset.integrationCategoryPill = category.id
        button.textContent = category.id === CATEGORY_ALL ? 'All' : category.name.replace(' Integrations', '')
        return button
      }),
    )
  }

  function renderSummary() {
    const values = Object.values(records)
    const connected = values.filter((record) => {
      const status = record.status || record.connectionStatus
      return status === STATUS.connected || status === STATUS.connected_sync_unavailable
    }).length
    const unhealthy = values.filter((record) => [STATUS.error, STATUS.needs_attention].includes(record.status || record.connectionStatus)).length
    const total = INTEGRATIONS.length
    const setText = (id, value) => {
      const element = document.getElementById(id)
      if (element) element.textContent = String(value)
    }
    setText('integrationConnectedMetric', connected)
    setText('integrationConnectedTotal', `/${total}`)
    setText('integrationUnconfiguredMetric', Math.max(total - connected, 0))
    setText('integrationHealthyMetric', Math.max(total - unhealthy, 0))
    setText('integrationHealthyTotal', `/${total}`)
  }

  function renderCards() {
    const groups = document.getElementById('integrationGroups')
    const empty = document.getElementById('integrationEmptyState')
    if (!groups || !empty) return
    const providers = filteredProviders()
    groups.replaceChildren(
      ...CATEGORIES.map((category) => {
        const categoryProviders = providers.filter((provider) => provider.category === category.id)
        if (!categoryProviders.length) return null
        const section = document.createElement('section')
        section.className = 'integration-category-section'
        section.innerHTML = `<div class="integration-category-heading"><h3>${category.name}</h3><span>${categoryProviders.length}</span></div><div class="integration-grid"></div>`
        section
          .querySelector('.integration-grid')
          .replaceChildren(...categoryProviders.map(renderCard))
        return section
      }).filter(Boolean),
    )
    empty.hidden = providers.length > 0
  }

  function renderCard(provider) {
    const record = records[provider.id] || {providerId: provider.id, status: 'not_connected'}
    const status = record.status || record.connectionStatus || 'not_connected'
    const isConnected = status === STATUS.connected || status === STATUS.connected_sync_unavailable
    
    let actionHtml = ''
    if (isConnected) {
      const syncUnavailable = status === STATUS.connected_sync_unavailable
      actionHtml = `
        <button class="integration-status-button" type="button" data-integration-disconnect="${provider.id}">Connected</button>
        <button class="integration-icon-button" type="button" data-integration-reconnect="${provider.id}" title="Refresh connection" ${syncUnavailable ? 'disabled' : ''}>
          <i class="bx bx-refresh" aria-hidden="true"></i>
        </button>
        <a class="integration-icon-button" href="${provider.learnMoreUrl}" data-integration-learn="${provider.id}" title="Open provider details">
          <i class="bx bx-link-external" aria-hidden="true"></i>
        </a>`
    } else {
      // A provider callback can be interrupted, leaving a stale connecting
      // record. Keep the action retryable so the recruiter is never locked out.
      const disabled = !canConnect(status) || !context.canManage
      actionHtml = `
        <button class="integration-status-button is-muted" type="button" data-integration-connect="${provider.id}" ${disabled ? 'disabled' : ''}>
          ${status === STATUS.connecting ? 'Retry connection' : status === STATUS.needs_attention && record.lastErrorCode ? `Needs attention (${record.lastErrorCode})` : statusLabel(status)}
        </button>`
      actionHtml += `<button class="integration-icon-button" type="button" data-integration-reconnect="${provider.id}" title="Refresh connection" ${disabled ? 'disabled' : ''}><i class="bx bx-refresh" aria-hidden="true"></i></button>`
      actionHtml += `<a class="integration-icon-button" href="${provider.learnMoreUrl}" data-integration-learn="${provider.id}" title="Open provider details"><i class="bx bx-link-external" aria-hidden="true"></i></a>`
    }
    
    const card = document.createElement('article')
    card.className = 'integration-card'
    card.dataset.providerId = provider.id
    card.innerHTML = `
      <div class="integration-card__topline">
        <div class="integration-provider-icon ${provider.iconClass}" aria-hidden="true">
          ${provider.logo ? `<img src="${provider.logo}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false;"><i class="bx ${provider.icon}" hidden></i>` : `<i class="bx ${provider.icon}"></i>`}
        </div>
        <label class="integration-toggle" title="${isConnected ? 'Connected' : 'Not connected'}">
          <input type="checkbox" data-integration-toggle="${provider.id}" ${isConnected ? 'checked' : ''} ${!context.canManage || !canConnect(status) && !isConnected ? 'disabled' : ''}>
          <span></span>
        </label>
      </div>
      <div class="integration-card__copy">
        <div class="integration-card__title-row">
          <h4>${provider.name}</h4>
          <a class="integration-learn-more" href="${provider.learnMoreUrl}" data-integration-learn="${provider.id}">Learn more</a>
        </div>
        <p>${provider.description}</p>
      </div>
      <div class="integration-card__action">
        ${actionHtml}
        ${!context.canManage ? `<span class="integration-permission-note">Only authorised team members can manage integrations.</span>` : ''}
      </div>`
    return card
  }

  function openModal(providerId, action) {
    const provider = getProvider(providerId)
    const modal = document.getElementById('integrationConfirmModal')
    if (!provider || !modal) return
    activeProviderId = providerId
    modalAction = action
    document.getElementById('integrationModalTitle').textContent =
      action === 'connect' || action === 'reconnect'
        ? `${action === 'reconnect' ? 'Reconnect' : 'Connect'} ${provider.name}`
        : `Disconnect ${provider.name}`
    document.getElementById('integrationModalDescription').textContent =
      action === 'connect' || action === 'reconnect'
        ? `Career Unified will open ${provider.name}'s secure authorization page. You will review and approve the requested permissions there.`
        : `Disconnecting ${provider.name} will stop this workspace from using its future connected services.`
    document.getElementById('integrationModalScopes').replaceChildren(
      ...(action === 'connect' || action === 'reconnect'
        ? provider.requiredScopes
        : ['The server-side connection record and encrypted token references for this provider']
      ).map((scope) => {
        const item = document.createElement('li')
        item.textContent = scope
        return item
      }),
    )
    document.getElementById('integrationModalNote').textContent =
      action === 'connect' || action === 'reconnect'
        ? 'Access and refresh tokens are encrypted and retained only on the server. They are never stored in your browser.'
        : 'Disconnecting removes the server-side token references. It does not delete your provider account.'
    document.getElementById('integrationModalConfirm').textContent =
      action === 'connect' || action === 'reconnect' ? 'Continue to provider' : 'Disconnect'
    modal.hidden = false
    document.body.classList.add('integration-modal-open')
    document.getElementById('integrationModalConfirm').focus()
  }

  function closeModal() {
    const modal = document.getElementById('integrationConfirmModal')
    if (modal) modal.hidden = true
    document.body.classList.remove('integration-modal-open')
    activeProviderId = ''
  }

  async function confirmModal() {
    const providerId = activeProviderId
    if (!providerId || !context?.canManage) return
    const action = modalAction
    closeModal()
    try {
      if (action === 'connect' || action === 'reconnect') {
        renderRecords({[providerId]: {...records[providerId], status: STATUS.connecting}})
        const result = await integrationService.request(action, providerId)
        if (result.authorizationUrl) {
          window.location.assign(result.authorizationUrl)
          return
        }
        await loadRecords()
      } else {
        await integrationService.request('disconnect', providerId)
        await loadRecords()
        window.showToast?.(
          'info',
          'Integration disconnected',
          `${getProvider(providerId).name} was disconnected.`,
        )
      }
    } catch {
      records[providerId] = {...records[providerId], status: STATUS.error}
      renderRecords()
      window.showToast?.(
        'error',
        'Connection unavailable',
        'The provider connection could not be completed. Check configuration or permissions and try again.',
      )
    }
  }

  function renderRecords(overrides = {}) {
    records = {...records, ...overrides}
    renderCards()
    renderSummary()
    const connectedCount = Object.values(records).filter(
      (record) => (record.status || record.connectionStatus) === STATUS.connected,
    ).length
    void connectedCount
  }

  async function loadRecords() {
    const payload = await integrationService.request('status')
    records = Object.fromEntries(
      (payload.integrations || []).map((record) => [record.providerId, record]),
    )
    const params = new URLSearchParams(window.location.search)
    const result = params.get('integration_result')
    const providerId = params.get('integration')
    if (providerId && result && result !== 'connected') {
      records[providerId] = {
        ...(records[providerId] || {providerId}),
        status: STATUS.error,
      }
    }
    renderRecords()
    updateEmailAccountSelectors()
  }

  function updateEmailAccountSelectors() {
    document
      .querySelectorAll('[data-recruiter-email-account-select], #applicationMessageSender')
      .forEach((select) => {
        const selected = select.value || 'resend'
        const options = [new Option('Career Unified', 'resend')]
        ;[
          ['gmail', 'Gmail'],
          ['outlook-email', 'Outlook Email'],
        ].forEach(([providerId, label]) => {
          const record = records[providerId] || {}
          const connected = (record.status || record.connectionStatus) === STATUS.connected
          const option = new Option(
            connected && record.providerEmail
              ? `${label} · ${record.providerEmail}`
              : `${label} · Connect in Integrations`,
            providerId,
            false,
            connected && selected === providerId,
          )
          option.disabled = !connected
          options.push(option)
        })
        select.replaceChildren(...options)
        select.value = options.some((option) => option.value === selected && !option.disabled)
          ? selected
          : 'resend'
      })
  }

  function bindEvents() {
    document.getElementById('integrationSearch')?.addEventListener('input', renderCards)
    document.getElementById('integrationCategory')?.addEventListener('change', (event) => {
      document.querySelectorAll('[data-integration-category-pill]').forEach((pill) => {
        pill.classList.toggle('is-active', pill.dataset.integrationCategoryPill === event.target.value)
      })
      renderCards()
    })
    document.getElementById('integrationCategoryPills')?.addEventListener('click', (event) => {
      const pill = event.target.closest('[data-integration-category-pill]')
      if (!pill) return
      const select = document.getElementById('integrationCategory')
      if (select) select.value = pill.dataset.integrationCategoryPill
      document.querySelectorAll('[data-integration-category-pill]').forEach((item) => item.classList.toggle('is-active', item === pill))
      renderCards()
    })
    document.getElementById('integrationModalConfirm')?.addEventListener('click', confirmModal)
    document.getElementById('integrationModalCancel')?.addEventListener('click', closeModal)
    document.getElementById('integrationConfirmModal')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeModal()
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.getElementById('integrationConfirmModal')?.hidden)
        closeModal()
    })
    document.getElementById('integrationGroups')?.addEventListener('click', (event) => {
      const target = event.target.closest(
        '[data-integration-connect], [data-integration-disconnect], [data-integration-reconnect], [data-integration-learn], [data-integration-toggle]',
      )
      if (!target) return
      if (target.dataset.integrationLearn) {
        event.preventDefault()
        window.showToast?.(
          'info',
          'Provider information',
          'Provider details and live connection setup will be added when this integration is available.',
        )
      } else if (target.dataset.integrationToggle) {
        openModal(target.dataset.integrationToggle, target.checked ? 'connect' : 'disconnect')
      } else if (target.dataset.integrationConnect) {
        openModal(target.dataset.integrationConnect, 'connect')
      } else if (target.dataset.integrationReconnect) {
        openModal(target.dataset.integrationReconnect, 'reconnect')
      } else {
        openModal(target.dataset.integrationDisconnect, 'disconnect')
      }
    })
  }

  window.initRecruiterIntegrations = function (nextContext) {
    context = nextContext
    renderCategoryOptions()
    renderCounts()
    loadRecords().catch(() => {
      records = Object.fromEntries(
        INTEGRATIONS.map((provider) => [provider.id, {providerId: provider.id, status: 'error'}]),
      )
      renderRecords()
      window.showToast?.(
        'error',
        'Integrations unavailable',
        'Connection status could not be loaded. Please refresh and try again.',
      )
    })

    const result = new URLSearchParams(window.location.search).get('integration_result')
    const providerId = new URLSearchParams(window.location.search).get('integration')
    if (result && providerId) {
      const provider = getProvider(providerId)
      const message =
        result === 'connected'
          ? `${provider?.name || 'The provider'} is connected and ready for configured features.`
          : result === 'permission_denied'
            ? 'The provider permissions were not granted. No connection was created.'
            : 'The provider connection could not be completed. Check configuration and try again.'
      window.showToast?.(
        result === 'connected' ? 'success' : 'error',
        result === 'connected' ? 'Integration connected' : 'Integration not connected',
        message,
      )
      window.history.replaceState({}, document.title, `${window.location.pathname}#integrations`)
    }
  }

  window.updateRecruiterEmailAccountSelectors = updateEmailAccountSelectors

  window.recruiterIntegrationMetadata = INTEGRATIONS
  bindEvents()
})()
