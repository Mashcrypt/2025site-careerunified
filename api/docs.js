(() => {
  'use strict'

  const baseUrl = 'https://careerunified.com/api/v1'
  const referencePages = document.getElementById('referencePages')

  const endpoints = [
    {
      id: 'list-jobs',
      method: 'GET',
      path: '/jobs',
      title: 'List jobs',
      description: 'Return active Career Unified editorial and approved recruiter jobs.',
      access: 'Public',
      parameters: [
        ['limit', 'integer', 'Number of records to return. Minimum 1, maximum 100. Defaults to 25.'],
        ['cursor', 'string', 'Opaque cursor returned by the previous page.'],
        ['q', 'string', 'Search title, organisation, location, category, and employment type.'],
        ['category', 'string', 'Return jobs matching an exact category.'],
        ['source', 'string', 'Filter by Career Unified editorial or partner API source.'],
        ['applicationMethod', 'string', 'Filter by direct, external, or email application method.'],
      ],
      curl: `curl "${baseUrl}/jobs?limit=25&q=finance"`,
      node: `const response = await fetch(
  '${baseUrl}/jobs?limit=25&q=finance'
)
const result = await response.json()`,
      python: `import requests

result = requests.get(
    "${baseUrl}/jobs",
    params={"limit": 25, "q": "finance"},
).json()`,
      response: `{
  "data": [
    {
      "id": "job_8f4c",
      "source": "career_unified_recruiter",
      "slug": "junior-financial-analyst--api_8f",
      "title": "Junior Financial Analyst",
      "category": "internship",
      "employmentType": "Full-time",
      "location": { "display": "Johannesburg, South Africa" },
      "organization": { "name": "Example Finance" },
      "application": { "method": "direct" }
    }
  ],
  "meta": {
    "total": 58,
    "limit": 25,
    "hasMore": true,
    "nextCursor": "eyJ2IjoxLCJvZmZzZXQiOjI1fQ"
  }
}`,
    },
    {
      id: 'get-job', method: 'GET', path: '/jobs/{slug-or-id}', title: 'Retrieve a job', access: 'Public',
      description: 'Retrieve one active job by its canonical slug or Career Unified identifier.',
      parameters: [['slug-or-id', 'string · path', 'The job slug or identifier.', true]],
      curl: `curl "${baseUrl}/jobs/junior-financial-analyst--api_8f"`,
      node: `const job = await fetch(
  '${baseUrl}/jobs/junior-financial-analyst--api_8f'
).then(response => response.json())`,
      python: `import requests

job = requests.get(
    "${baseUrl}/jobs/junior-financial-analyst--api_8f"
).json()`,
      response: `{
  "data": {
    "id": "job_8f4c",
    "title": "Junior Financial Analyst",
    "description": "Role description and responsibilities.",
    "organization": { "name": "Example Finance" },
    "dates": { "closing": "2026-09-30" },
    "links": { "web": "https://careerunified.com/jobs/..." }
  }
}`,
    },
    {
      id: 'create-job', method: 'POST', path: '/jobs', title: 'Create a job', access: 'jobs:write',
      description: 'Publish a vacancy for the organisation linked to the API client.',
      note: 'The linked recruiter company profile controls the company name, logo, website, email, and social profiles.',
      parameters: [
        ['Idempotency-Key', 'string · header', 'Unique key of 8 to 180 safe characters. Reuse it only when retrying the same payload.', true],
        ['title', 'string · body', 'Public job title.', true],
        ['category', 'string · body', 'Career Unified job category.', true],
        ['employmentType', 'string · body', 'Employment arrangement shown to applicants.', true],
        ['description', 'string · body', 'Job responsibilities and requirements.', true],
        ['city', 'string · body', 'City or town.', true],
        ['country', 'string · body', 'Country. Defaults to South Africa.'],
        ['closingDate', 'date · body', 'Closing date in YYYY-MM-DD format.'],
        ['applicationMethod', 'string · body', 'direct, external, or email. Defaults to direct.'],
        ['applyLink', 'HTTPS URL · body', 'Required when applicationMethod is external.'],
        ['screeningQuestions', 'array · body', 'Structured questions for Direct Apply jobs.'],
      ],
      curl: `curl -X POST "${baseUrl}/jobs" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY" \\
  -H "Idempotency-Key: ats-job-48392-create" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Junior Financial Analyst",
    "category": "internship",
    "employmentType": "Full-time",
    "description": "Role description and responsibilities.",
    "city": "Johannesburg",
    "country": "South Africa",
    "closingDate": "2026-09-30",
    "applicationMethod": "direct",
    "screeningQuestions": []
  }'`,
      node: `const response = await fetch('${baseUrl}/jobs', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.CAREER_UNIFIED_API_KEY,
    'Idempotency-Key': 'ats-job-48392-create',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: 'Junior Financial Analyst',
    category: 'internship',
    employmentType: 'Full-time',
    description: 'Role description and responsibilities.',
    city: 'Johannesburg',
    country: 'South Africa',
    closingDate: '2026-09-30',
    applicationMethod: 'direct',
    screeningQuestions: [],
  }),
})`,
      python: `import os
import requests

response = requests.post(
    "${baseUrl}/jobs",
    headers={
        "X-API-Key": os.environ["CAREER_UNIFIED_API_KEY"],
        "Idempotency-Key": "ats-job-48392-create",
    },
    json={
        "title": "Junior Financial Analyst",
        "category": "internship",
        "employmentType": "Full-time",
        "description": "Role description and responsibilities.",
        "city": "Johannesburg",
        "applicationMethod": "direct",
        "screeningQuestions": [],
    },
)`,
      response: `{
  "data": {
    "id": "api_7eb96a1a8d91",
    "source": "career_unified_recruiter",
    "slug": "junior-financial-analyst-example-finance--api_7e",
    "title": "Junior Financial Analyst",
    "status": "active"
  },
  "meta": {
    "usedSingleJobCredit": false,
    "idempotentReplay": false
  }
}`,
    },
    {
      id: 'update-job', method: 'PATCH', path: '/jobs/{jobId}', title: 'Update a job', access: 'jobs:write',
      description: 'Update an active job owned by the API client organisation.',
      parameters: [['jobId', 'string · path', 'Career Unified job identifier.', true], ['title', 'string · body', 'Updated public job title.'], ['description', 'string · body', 'Updated role content.'], ['closingDate', 'date · body', 'Replacement closing date in YYYY-MM-DD format.'], ['status', 'string · body', 'Supported job status where permitted.']],
      curl: `curl -X PATCH "${baseUrl}/jobs/api_7eb96a1a8d91" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"closingDate":"2026-10-07"}'`,
      node: `await fetch('${baseUrl}/jobs/api_7eb96a1a8d91', {
  method: 'PATCH',
  headers: {
    'X-API-Key': process.env.CAREER_UNIFIED_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ closingDate: '2026-10-07' }),
})`,
      python: `requests.patch(
    "${baseUrl}/jobs/api_7eb96a1a8d91",
    headers={"X-API-Key": api_key},
    json={"closingDate": "2026-10-07"},
)`,
      response: `{
  "data": {
    "id": "api_7eb96a1a8d91",
    "title": "Junior Financial Analyst",
    "dates": { "closing": "2026-10-07" }
  }
}`,
    },
    {
      id: 'close-job', method: 'POST', path: '/jobs/{jobId}/close', title: 'Close a job', access: 'jobs:write',
      description: 'Stop an organisation job from accepting new applications.',
      parameters: [['jobId', 'string · path', 'Career Unified job identifier.', true]],
      curl: `curl -X POST "${baseUrl}/jobs/api_7eb96a1a8d91/close" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY"`,
      node: `await fetch('${baseUrl}/jobs/api_7eb96a1a8d91/close', {
  method: 'POST',
  headers: { 'X-API-Key': process.env.CAREER_UNIFIED_API_KEY },
})`,
      python: `requests.post(
    "${baseUrl}/jobs/api_7eb96a1a8d91/close",
    headers={"X-API-Key": api_key},
)`,
      response: `{
  "data": {
    "id": "api_7eb96a1a8d91",
    "status": "closed"
  }
}`,
    },
    {
      id: 'list-applications', method: 'GET', path: '/jobs/{jobId}/applications', title: 'List applications', access: 'applications:read',
      description: 'List Direct Apply applications submitted to one organisation job.',
      parameters: [['jobId', 'string · path', 'Career Unified job identifier.', true], ['limit', 'integer', 'Number of records to return. Maximum 100.'], ['cursor', 'string', 'Opaque cursor returned by the previous page.'], ['status', 'string', 'Filter by application stage.']],
      curl: `curl "${baseUrl}/jobs/api_7eb96a1a8d91/applications?status=submitted" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY"`,
      node: `const applications = await fetch(
  '${baseUrl}/jobs/api_7eb96a1a8d91/applications?status=submitted',
  { headers: { 'X-API-Key': process.env.CAREER_UNIFIED_API_KEY } }
).then(response => response.json())`,
      python: `applications = requests.get(
    "${baseUrl}/jobs/api_7eb96a1a8d91/applications",
    headers={"X-API-Key": api_key},
    params={"status": "submitted"},
).json()`,
      response: `{
  "data": [
    {
      "id": "app_4b21",
      "jobId": "api_7eb96a1a8d91",
      "status": "submitted",
      "candidate": {
        "name": "Candidate Name",
        "email": "candidate@example.com"
      },
      "submittedAt": "2026-08-17T12:30:00.000Z"
    }
  ],
  "meta": { "hasMore": false, "nextCursor": null }
}`,
    },
    {
      id: 'get-application', method: 'GET', path: '/applications/{applicationId}', title: 'Retrieve application', access: 'applications:read',
      description: 'Retrieve the structured candidate snapshot, answers, and application workflow data.',
      note: 'Storage paths, blob keys, API credentials, private recruiter notes, CV binary data, and employment-equity profile fields are never returned.',
      parameters: [['applicationId', 'string · path', 'Career Unified application identifier.', true]],
      curl: `curl "${baseUrl}/applications/app_4b21" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY"`,
      node: `const application = await fetch(
  '${baseUrl}/applications/app_4b21',
  { headers: { 'X-API-Key': process.env.CAREER_UNIFIED_API_KEY } }
).then(response => response.json())`,
      python: `application = requests.get(
    "${baseUrl}/applications/app_4b21",
    headers={"X-API-Key": api_key},
).json()`,
      response: `{
  "data": {
    "id": "app_4b21",
    "jobId": "api_7eb96a1a8d91",
    "status": "submitted",
    "candidate": {
      "name": "Candidate Name",
      "email": "candidate@example.com",
      "phone": "+27 00 000 0000"
    },
    "answers": [],
    "statusHistory": []
  }
}`,
    },
    {
      id: 'update-application', method: 'PATCH', path: '/applications/{applicationId}', title: 'Update application stage', access: 'applications:write',
      description: 'Move an organisation application through a supported recruitment stage.',
      parameters: [['applicationId', 'string · path', 'Career Unified application identifier.', true], ['status', 'string · body', 'viewed, shortlisted, interview, offer, hired, or unsuccessful.', true]],
      curl: `curl -X PATCH "${baseUrl}/applications/app_4b21" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"shortlisted"}'`,
      node: `await fetch('${baseUrl}/applications/app_4b21', {
  method: 'PATCH',
  headers: {
    'X-API-Key': process.env.CAREER_UNIFIED_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ status: 'shortlisted' }),
})`,
      python: `requests.patch(
    "${baseUrl}/applications/app_4b21",
    headers={"X-API-Key": api_key},
    json={"status": "shortlisted"},
)`,
      response: `{
  "data": {
    "id": "app_4b21",
    "status": "shortlisted"
  }
}`,
    },
    {
      id: 'list-bursaries', method: 'GET', path: '/bursaries', title: 'List bursaries', access: 'Public',
      description: 'Return active bursaries published by Career Unified.',
      parameters: [['limit', 'integer', 'Number of records to return. Maximum 100.'], ['cursor', 'string', 'Opaque cursor from the previous page.'], ['q', 'string', 'Search bursary name, provider, and faculty.'], ['faculty', 'string', 'Return bursaries matching an exact faculty.']],
      curl: `curl "${baseUrl}/bursaries?faculty=Engineering&limit=25"`,
      node: `const bursaries = await fetch(
  '${baseUrl}/bursaries?faculty=Engineering&limit=25'
).then(response => response.json())`,
      python: `bursaries = requests.get(
    "${baseUrl}/bursaries",
    params={"faculty": "Engineering", "limit": 25},
).json()`,
      response: `{
  "data": [
    {
      "id": "bursary_42",
      "name": "Engineering Bursary 2027",
      "provider": "Example Foundation",
      "faculties": ["Engineering"],
      "closingDate": "2026-11-30"
    }
  ]
}`,
    },
    {
      id: 'get-bursary', method: 'GET', path: '/bursaries/{slug-or-id}', title: 'Retrieve a bursary', access: 'Public',
      description: 'Retrieve one active bursary by its canonical slug or identifier.',
      parameters: [['slug-or-id', 'string · path', 'Bursary slug or identifier.', true]],
      curl: `curl "${baseUrl}/bursaries/engineering-bursary-2027"`,
      node: `const bursary = await fetch(
  '${baseUrl}/bursaries/engineering-bursary-2027'
).then(response => response.json())`,
      python: `bursary = requests.get(
    "${baseUrl}/bursaries/engineering-bursary-2027"
).json()`,
      response: `{
  "data": {
    "id": "bursary_42",
    "name": "Engineering Bursary 2027",
    "provider": "Example Foundation",
    "description": "Bursary details and eligibility.",
    "applicationUrl": "https://example.org/apply"
  }
}`,
    },
    {
      id: 'create-webhook', method: 'POST', path: '/webhooks', title: 'Create a webhook endpoint', access: 'webhooks:manage',
      description: 'Register a public HTTPS endpoint for selected organisation events.',
      note: 'The signing secret is returned once. Store it in a server-side secret manager.',
      parameters: [['url', 'HTTPS URL · body', 'Public endpoint that receives signed POST requests.', true], ['events', 'array · body', 'One or more supported event names.', true], ['description', 'string · body', 'Internal label for this destination.']],
      curl: `curl -X POST "${baseUrl}/webhooks" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://partner.example.com/webhooks/career-unified",
    "events": ["application.received", "application.stage_changed"],
    "description": "Production recruitment events"
  }'`,
      node: `await fetch('${baseUrl}/webhooks', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.CAREER_UNIFIED_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://partner.example.com/webhooks/career-unified',
    events: ['application.received', 'application.stage_changed'],
    description: 'Production recruitment events',
  }),
})`,
      python: `requests.post(
    "${baseUrl}/webhooks",
    headers={"X-API-Key": api_key},
    json={
        "url": "https://partner.example.com/webhooks/career-unified",
        "events": ["application.received", "application.stage_changed"],
    },
)`,
      response: `{
  "data": {
    "endpoint": {
      "id": "wh_21fb",
      "url": "https://partner.example.com/webhooks/career-unified",
      "active": true
    },
    "signingSecret": "whsec_...",
    "notice": "Store this secret securely. It will not be shown again."
  }
}`,
    },
    {
      id: 'list-webhooks', method: 'GET', path: '/webhooks', title: 'List webhook endpoints', access: 'webhooks:manage',
      description: 'List webhook destinations configured for the organisation.',
      parameters: [],
      curl: `curl "${baseUrl}/webhooks" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY"`,
      node: `const webhooks = await fetch('${baseUrl}/webhooks', {
  headers: { 'X-API-Key': process.env.CAREER_UNIFIED_API_KEY },
}).then(response => response.json())`,
      python: `webhooks = requests.get(
    "${baseUrl}/webhooks",
    headers={"X-API-Key": api_key},
).json()`,
      response: `{
  "data": [
    {
      "id": "wh_21fb",
      "url": "https://partner.example.com/webhooks/career-unified",
      "events": ["application.received"],
      "active": true
    }
  ]
}`,
    },
    {
      id: 'delete-webhook', method: 'DELETE', path: '/webhooks/{webhookId}', title: 'Disable a webhook endpoint', access: 'webhooks:manage',
      description: 'Disable delivery to an organisation webhook endpoint without deleting its audit history.',
      parameters: [['webhookId', 'string · path', 'Webhook endpoint identifier.', true]],
      curl: `curl -X DELETE "${baseUrl}/webhooks/wh_21fb" \\
  -H "X-API-Key: $CAREER_UNIFIED_API_KEY"`,
      node: `await fetch('${baseUrl}/webhooks/wh_21fb', {
  method: 'DELETE',
  headers: { 'X-API-Key': process.env.CAREER_UNIFIED_API_KEY },
})`,
      python: `requests.delete(
    "${baseUrl}/webhooks/wh_21fb",
    headers={"X-API-Key": api_key},
)`,
      response: `HTTP/1.1 204 No Content`,
    },
  ]

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

  const methodClass = (method) => `method-${method.toLowerCase() === 'delete' ? 'delete' : method.toLowerCase()}`

  const renderParameters = (parameters) => {
    if (!parameters.length) return '<p>No parameters are required for this endpoint.</p>'
    return `<div class="parameter-list">${parameters.map(([name, type, description, required]) => `
      <div class="parameter-row">
        <div class="parameter-name"><strong>${escapeHtml(name)}${required ? '<em>required</em>' : ''}</strong><span>${escapeHtml(type)}</span></div>
        <p>${escapeHtml(description)}</p>
      </div>`).join('')}</div>`
  }

  const renderEndpoint = (endpoint) => `
    <article class="doc-page endpoint-page" data-doc-page="${endpoint.id}" data-title="${escapeHtml(endpoint.title)}" data-description="${escapeHtml(endpoint.description)}">
      <div class="doc-grid landing-grid">
        <div class="doc-copy">
          <p class="eyebrow">API REFERENCE · ${escapeHtml(endpoint.access)}</p>
          <div class="endpoint-heading"><span class="method ${methodClass(endpoint.method)}">${endpoint.method === 'DELETE' ? 'DEL' : endpoint.method}</span><code>${escapeHtml(endpoint.path)}</code></div>
          <h1>${escapeHtml(endpoint.title)}</h1>
          <p class="lead">${escapeHtml(endpoint.description)}</p>
          ${endpoint.note ? `<div class="callout callout-info"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><div><strong>Important</strong><p>${escapeHtml(endpoint.note)}</p></div></div>` : ''}
          <section class="content-section" id="${endpoint.id}-parameters"><h2>Parameters</h2>${renderParameters(endpoint.parameters)}</section>
          <section class="content-section" id="${endpoint.id}-responses"><h2>Response</h2><p>Successful responses use the standard Career Unified response envelope. See the example request panel for the exact payload shape.</p></section>
          <section class="content-section" id="${endpoint.id}-headers"><h2>Response headers</h2><div class="table-wrap"><table><thead><tr><th>Header</th><th>Description</th></tr></thead><tbody><tr><td><code>X-Request-Id</code></td><td>Identifier for support and audit tracing.</td></tr><tr><td><code>X-API-Version</code></td><td>API version that handled the request.</td></tr></tbody></table></div></section>
        </div>
        <aside class="code-rail" aria-label="${escapeHtml(endpoint.title)} example">
          <div class="code-window sticky-code">
            <div class="code-window-header"><span>Example request</span><button class="copy-button" type="button"><i class="fa-regular fa-copy" aria-hidden="true"></i><span>Copy</span></button></div>
            <div class="code-tabs" role="tablist" aria-label="Code language">
              <button class="is-active" type="button" role="tab" aria-selected="true" data-code-tab="curl" data-code-group="${endpoint.id}">cURL</button>
              <button type="button" role="tab" aria-selected="false" data-code-tab="node" data-code-group="${endpoint.id}">Node.js</button>
              <button type="button" role="tab" aria-selected="false" data-code-tab="python" data-code-group="${endpoint.id}">Python</button>
            </div>
            <pre data-code-panel="curl" data-code-group="${endpoint.id}"><code>${escapeHtml(endpoint.curl)}</code></pre>
            <pre hidden data-code-panel="node" data-code-group="${endpoint.id}"><code>${escapeHtml(endpoint.node)}</code></pre>
            <pre hidden data-code-panel="python" data-code-group="${endpoint.id}"><code>${escapeHtml(endpoint.python)}</code></pre>
            <div class="response-label">Example response</div>
            <pre class="response-code"><code>${escapeHtml(endpoint.response)}</code></pre>
          </div>
        </aside>
      </div>
    </article>`

  referencePages.innerHTML = endpoints.map(renderEndpoint).join('')

  const docPages = [...document.querySelectorAll('[data-doc-page]')]
  const docLinks = [...document.querySelectorAll('[data-doc-link]')]
  const sidebar = document.getElementById('docsSidebar')
  const sidebarScrim = document.getElementById('sidebarScrim')
  const mobileMenuButton = document.getElementById('mobileMenuButton')
  const searchDialog = document.getElementById('searchDialog')
  const searchInput = document.getElementById('docsSearch')
  const searchResults = document.getElementById('searchResults')
  const copyToast = document.getElementById('copyToast')
  let toastTimer

  const pageIndex = docPages.map((page) => ({
    id: page.dataset.docPage,
    title: page.dataset.title || '',
    description: page.dataset.description || '',
    text: page.textContent.replace(/\s+/g, ' ').trim(),
  }))

  const closeSidebar = () => {
    sidebar.classList.remove('is-open')
    sidebarScrim.hidden = true
    mobileMenuButton.setAttribute('aria-expanded', 'false')
  }

  const routeTo = (requestedId, updateHistory = true) => {
    const target = docPages.find((page) => page.dataset.docPage === requestedId) || docPages[0]
    const id = target.dataset.docPage
    docPages.forEach((page) => page.classList.toggle('is-visible', page === target))
    docLinks.forEach((link) => link.classList.toggle('is-active', link.dataset.docLink === id))
    document.title = `${target.dataset.title} | Career Unified API`
    if (updateHistory && window.location.hash !== `#${id}`) history.pushState(null, '', `#${id}`)
    window.scrollTo({top: 0, behavior: 'auto'})
    closeSidebar()
    return id
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-doc-link]')
    if (!link) return
    event.preventDefault()
    routeTo(link.dataset.docLink)
  })

  window.addEventListener('popstate', () => routeTo(window.location.hash.slice(1), false))

  mobileMenuButton.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open')
    sidebarScrim.hidden = !open
    mobileMenuButton.setAttribute('aria-expanded', String(open))
  })
  sidebarScrim.addEventListener('click', closeSidebar)

  const activeRequestCode = (button) => {
    const windowElement = button.closest('.code-window')
    if (!windowElement) return null
    const requested = button.dataset.copyTarget && document.getElementById(button.dataset.copyTarget)
    if (requested && !requested.hidden) return requested
    return windowElement.querySelector('pre[data-code-panel]:not([hidden])') || windowElement.querySelector('pre')
  }

  const showCopyToast = () => {
    clearTimeout(toastTimer)
    copyToast.classList.add('is-visible')
    toastTimer = setTimeout(() => copyToast.classList.remove('is-visible'), 1600)
  }

  const copyText = async (value) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    showCopyToast()
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.copy-button, [data-copy-text]')
    if (!button) return
    const value = button.dataset.copyText || activeRequestCode(button)?.innerText
    copyText(value)
  })

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-code-tab]')
    if (!tab) return
    const group = tab.dataset.codeGroup
    const language = tab.dataset.codeTab
    document.querySelectorAll(`[data-code-tab][data-code-group="${group}"]`).forEach((button) => {
      const selected = button.dataset.codeTab === language
      button.classList.toggle('is-active', selected)
      button.setAttribute('aria-selected', String(selected))
    })
    document.querySelectorAll(`[data-code-panel][data-code-group="${group}"]`).forEach((panel) => {
      panel.hidden = panel.dataset.codePanel !== language
    })
  })

  const renderSearch = (query = '') => {
    const normalized = query.trim().toLowerCase()
    const matches = pageIndex
      .filter((page) => !normalized || `${page.title} ${page.description} ${page.text}`.toLowerCase().includes(normalized))
      .slice(0, 9)
    if (!normalized) {
      searchResults.innerHTML = '<p class="search-hint">Search for authentication, jobs, applications, webhooks, or errors.</p>'
      return
    }
    if (!matches.length) {
      searchResults.innerHTML = '<p class="search-empty">No documentation matched your search.</p>'
      return
    }
    searchResults.innerHTML = ''
    matches.forEach((page) => {
      const result = document.createElement('a')
      result.href = `#${page.id}`
      result.className = 'search-result'
      result.dataset.docLink = page.id
      const icon = document.createElement('i')
      icon.className = 'fa-regular fa-file-lines'
      icon.setAttribute('aria-hidden', 'true')
      const copy = document.createElement('span')
      const title = document.createElement('strong')
      title.textContent = page.title
      const description = document.createElement('small')
      description.textContent = page.description
      copy.append(title, description)
      const arrow = document.createElement('i')
      arrow.className = 'fa-solid fa-arrow-right'
      arrow.setAttribute('aria-hidden', 'true')
      result.append(icon, copy, arrow)
      result.addEventListener('click', () => searchDialog.close())
      searchResults.appendChild(result)
    })
  }

  const openSearch = () => {
    if (!searchDialog.open) searchDialog.showModal()
    searchInput.value = ''
    renderSearch()
    requestAnimationFrame(() => searchInput.focus())
  }

  document.getElementById('searchTrigger').addEventListener('click', openSearch)
  document.getElementById('closeSearch').addEventListener('click', () => searchDialog.close())
  searchInput.addEventListener('input', () => renderSearch(searchInput.value))
  searchDialog.addEventListener('click', (event) => {
    if (event.target === searchDialog) searchDialog.close()
  })
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      openSearch()
    }
  })

  routeTo(window.location.hash.slice(1) || 'introduction', false)
})()
