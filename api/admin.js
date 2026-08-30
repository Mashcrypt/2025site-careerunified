import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'

const firebaseConfig = {
  apiKey: 'AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M',
  authDomain: 'career-unified.firebaseapp.com',
  projectId: 'career-unified',
  storageBucket: 'career-unified.firebasestorage.app',
  messagingSenderId: '101656817742',
  appId: '1:101656817742:web:22c9a58a822a714e54931f',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const provider = new GoogleAuthProvider()

const statusNotice = document.getElementById('statusNotice')
const adminWorkspace = document.getElementById('adminWorkspace')
const adminIdentity = document.getElementById('adminIdentity')
const signInButton = document.getElementById('signInButton')
const refreshButton = document.getElementById('refreshButton')
const clientForm = document.getElementById('clientForm')
const clientList = document.getElementById('clientList')
const keyPanel = document.getElementById('keyPanel')
const createdKey = document.getElementById('createdKey')
const copyCreatedKey = document.getElementById('copyCreatedKey')
const reloadClients = document.getElementById('reloadClients')

let currentUser = null

function setNotice(message, isError = false) {
  statusNotice.textContent = message
  statusNotice.classList.toggle('is-error', isError)
}

async function adminToken() {
  if (!currentUser) throw new Error('Sign in first.')
  return currentUser.getIdToken()
}

async function apiRequest(path, options = {}) {
  const token = await adminToken()
  const response = await fetch(`/api/v1/admin/clients${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    const message = body?.error?.message || 'The API admin request failed.'
    throw new Error(message)
  }
  return body
}

function activeBadge(client) {
  return `<span class="badge ${client.active ? '' : 'is-revoked'}">${client.active ? 'Active' : 'Revoked'}</span>`
}

function percentUsed(usage) {
  const quota = Number(usage?.monthlyQuota || 0)
  const count = Number(usage?.requestCount || 0)
  return quota > 0 ? Math.min(100, Math.round((count / quota) * 100)) : 0
}

function dailyBars(daily) {
  const days = (daily || []).slice(-14)
  const max = Math.max(1, ...days.map((item) => Number(item.requestCount || 0)))
  return days
    .map((item) => {
      const height = Math.max(3, Math.round((Number(item.requestCount || 0) / max) * 54))
      return `<span title="${item.day}: ${item.requestCount} requests" style="height:${height}px"></span>`
    })
    .join('')
}

async function loadClientDetails(clientId) {
  const response = await apiRequest(`/${encodeURIComponent(clientId)}`)
  return response.data
}

function clientCard({client, usage, alerts, invoices}) {
  const monthly = usage?.monthly || usage || {}
  const daily = usage?.daily || []
  const used = Number(monthly.requestCount || 0)
  const quota = Number(monthly.monthlyQuota || client.monthlyQuota || 0)
  const alertMarkup = (alerts || [])
    .filter((alert) => !alert.acknowledged)
    .slice(0, 3)
    .map(
      (alert) =>
        `<div><strong>${alert.severity}</strong> - ${alert.message} <button type="button" data-action="acknowledge" data-alert-id="${alert.id}">Acknowledge</button></div>`,
    )
    .join('')
  const invoiceMarkup = (invoices || [])
    .slice(0, 3)
    .map(
      (invoice) =>
        `<span>${invoice.month}: R${(Number(invoice.amountCents || 0) / 100).toFixed(2)} (${invoice.status})</span>`,
    )
    .join('')
  return `
    <article class="client-card" data-client-id="${client.id}">
      <div class="client-top">
        <div>
          <div class="client-title">${client.name || 'Untitled client'}</div>
          <div class="client-meta">${client.environment} - ${client.apiPlan} - ${client.keyPrefix || 'no prefix'} - ${client.recruiterId}</div>
        </div>
        ${activeBadge(client)}
      </div>
      <div class="scope-list">${(client.scopes || []).map((scope) => `<span>${scope}</span>`).join('')}</div>
      <div class="usage-bar" style="--usage-width:${percentUsed({requestCount: used, monthlyQuota: quota})}%"><span></span></div>
      <div class="metric-row"><span>${used.toLocaleString()} requests this month</span><span>${quota ? `${quota.toLocaleString()} quota` : 'No monthly cap'}</span></div>
      <div class="daily-bars">${dailyBars(daily)}</div>
      ${alertMarkup ? `<div class="alert-list">${alertMarkup}</div>` : ''}
      ${invoiceMarkup ? `<div class="invoice-list">${invoiceMarkup}</div>` : ''}
      <div class="client-actions">
        <button type="button" data-action="rotate">Rotate key</button>
        ${client.previousKeyExpiresAt ? '<button type="button" data-action="finalize">End old key</button>' : ''}
        <button type="button" data-action="download">Download usage CSV</button>
        <button type="button" class="danger-button" data-action="revoke" ${client.active ? '' : 'disabled'}>Revoke</button>
      </div>
    </article>
  `
}

async function loadClients() {
  clientList.innerHTML = '<p>Loading API clients...</p>'
  try {
    const response = await apiRequest('')
    const clientSummaries = response.data || []
    const detailedClients = await Promise.all(
      clientSummaries.map((client) =>
        loadClientDetails(client.id).catch(() => ({
          client,
          usage: {monthly: client.usage, daily: []},
          alerts: [],
        })),
      ),
    )
    clientList.innerHTML = detailedClients.length
      ? detailedClients.map(clientCard).join('')
      : '<p>No API clients yet.</p>'
    setNotice('API admin console ready.')
  } catch (error) {
    clientList.innerHTML = ''
    setNotice(error.message, true)
  }
}

function formPayload(form) {
  const data = new FormData(form)
  const scopes = data.getAll('scopes')
  const allowedOrigins = String(data.get('allowedOrigins') || '')
    .split(/\s+/)
    .map((origin) => origin.trim())
    .filter(Boolean)
  const alertEmails = String(data.get('alertEmails') || '')
    .split(/\s+/)
    .map((email) => email.trim())
    .filter(Boolean)
  return {
    name: data.get('name'),
    recruiterId: data.get('recruiterId'),
    environment: data.get('environment'),
    apiPlan: data.get('apiPlan'),
    rateLimitPerMinute: Number(data.get('rateLimitPerMinute') || 600),
    monthlyQuota: data.get('monthlyQuota') ? Number(data.get('monthlyQuota')) : undefined,
    billingMode: data.get('billingMode'),
    overageRateCents: Number(data.get('overageRateCents') || 0),
    scopes,
    allowedOrigins,
    alertEmails,
  }
}

clientForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const response = await apiRequest('', {
      method: 'POST',
      body: JSON.stringify(formPayload(clientForm)),
    })
    createdKey.textContent = response.data.apiKey
    keyPanel.hidden = false
    clientForm.reset()
    setNotice('API key created. Copy it now because it will not be shown again.')
    await loadClients()
  } catch (error) {
    setNotice(error.message, true)
  }
})

clientList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  const card = button.closest('[data-client-id]')
  const clientId = card?.dataset.clientId
  if (!clientId) return
  try {
    if (button.dataset.action === 'revoke') {
      await apiRequest(`/${encodeURIComponent(clientId)}`, {method: 'DELETE'})
      setNotice('API client revoked.')
      await loadClients()
    }
    if (button.dataset.action === 'rotate') {
      const response = await apiRequest(`/${encodeURIComponent(clientId)}/rotate`, {
        method: 'POST',
        body: JSON.stringify({graceHours: 24}),
      })
      createdKey.textContent = response.data.apiKey
      keyPanel.hidden = false
      setNotice('API key rotated. Copy the new secret now.')
      await loadClients()
    }
    if (button.dataset.action === 'finalize') {
      await apiRequest(`/${encodeURIComponent(clientId)}/finalize-rotation`, {method: 'POST'})
      setNotice('The previous API key has been disabled.')
      await loadClients()
    }
    if (button.dataset.action === 'acknowledge') {
      await apiRequest(
        `/${encodeURIComponent(clientId)}/alerts/${encodeURIComponent(button.dataset.alertId)}/acknowledge`,
        {method: 'POST'},
      )
      setNotice('API alert acknowledged.')
      await loadClients()
    }
    if (button.dataset.action === 'download') {
      const token = await adminToken()
      const response = await fetch(
        `/api/v1/admin/clients/${encodeURIComponent(clientId)}/usage.csv`,
        {
          headers: {Authorization: `Bearer ${token}`},
        },
      )
      if (!response.ok) throw new Error('Could not download the usage report.')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `career-unified-api-usage-${clientId}.csv`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  } catch (error) {
    setNotice(error.message, true)
  }
})

copyCreatedKey.addEventListener('click', async () => {
  await navigator.clipboard.writeText(createdKey.textContent || '')
  setNotice('API key copied.')
})

signInButton.addEventListener('click', async () => {
  await signInWithPopup(auth, provider)
})

refreshButton.addEventListener('click', loadClients)
reloadClients.addEventListener('click', loadClients)

onAuthStateChanged(auth, async (user) => {
  currentUser = user
  if (!user) {
    adminWorkspace.hidden = true
    refreshButton.hidden = true
    adminIdentity.textContent = 'Not signed in'
    setNotice('Sign in with an administrator account to manage API clients.')
    return
  }
  adminIdentity.textContent = user.email || user.uid
  refreshButton.hidden = false
  adminWorkspace.hidden = false
  await loadClients()
})
