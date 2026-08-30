import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'

const app = initializeApp({
  apiKey: 'AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M',
  authDomain: 'career-unified.firebaseapp.com',
  projectId: 'career-unified',
  storageBucket: 'career-unified.firebasestorage.app',
  messagingSenderId: '101656817742',
  appId: '1:101656817742:web:22c9a58a822a714e54931f',
})
const auth = getAuth(app)
const provider = new GoogleAuthProvider()
const signInButton = document.getElementById('signInButton')
const identity = document.getElementById('identity')
const notice = document.getElementById('notice')
const workspace = document.getElementById('workspace')
const summary = document.getElementById('summary')
const clientList = document.getElementById('clientList')
const secretDialog = document.getElementById('secretDialog')
const rotatedKey = document.getElementById('rotatedKey')
const copyRotatedKey = document.getElementById('copyRotatedKey')
let currentUser = null

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    (character) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'})[character],
  )
function showNotice(message, error = false) {
  notice.textContent = message
  notice.classList.toggle('error', error)
}
async function request(path, options = {}) {
  if (!currentUser) throw new Error('Sign in first.')
  const token = await currentUser.getIdToken()
  const response = await fetch(`/api/v1/partner/clients${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const body = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(body?.error?.message || 'The partner request failed.')
  return body?.data
}
function money(cents, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {style: 'currency', currency}).format(
    Number(cents || 0) / 100,
  )
}
function percent(client, usage) {
  const quota = Number(usage?.monthlyQuota || client.monthlyQuota || 0)
  return quota ? Math.min(100, Math.round((Number(usage?.requestCount || 0) / quota) * 100)) : 0
}
function alertsMarkup(clientId, alerts = []) {
  const pending = alerts.filter((alert) => !alert.acknowledged)
  if (!pending.length) return '<p class="empty">No open alerts.</p>'
  return pending
    .slice(0, 8)
    .map(
      (alert) =>
        `<div class="alert"><div><p>${escapeHtml(alert.message)}</p><small>${escapeHtml(alert.severity)} - ${escapeHtml(alert.createdAt || '')}</small></div><button data-action="ack" data-client="${escapeHtml(clientId)}" data-alert="${escapeHtml(alert.id)}">Acknowledge</button></div>`,
    )
    .join('')
}
function invoicesMarkup(clientId, invoices = []) {
  if (!invoices.length) return '<p class="empty">No billing statements yet.</p>'
  return invoices
    .slice(0, 8)
    .map(
      (invoice) =>
        `<div class="invoice"><div><p>${escapeHtml(invoice.month)} - ${money(invoice.amountCents, invoice.currency)}</p><small>${Number(invoice.requestCount || 0).toLocaleString()} requests - ${escapeHtml(invoice.status)}</small></div><button data-action="invoice" data-client="${escapeHtml(clientId)}" data-invoice="${escapeHtml(invoice.id)}">CSV</button></div>`,
    )
    .join('')
}
function clientMarkup(details) {
  const {client, usage, alerts, invoices} = details
  const monthly = usage?.monthly || {}
  const quota = Number(monthly.monthlyQuota || client.monthlyQuota || 0)
  return `<article class="client-card" data-client-id="${escapeHtml(client.id)}"><div class="client-heading"><div><h2>${escapeHtml(client.name)}</h2><p>${escapeHtml(client.keyPrefix)} - ${escapeHtml(client.apiPlan)} - ${escapeHtml(client.scopes.join(', '))}</p></div><span class="badge ${client.environment === 'test' ? 'test' : ''}">${escapeHtml(client.environment)}</span></div><div class="usage-track" style="--usage:${percent(client, monthly)}%"><span></span></div><div class="metric-row"><span>${Number(monthly.requestCount || 0).toLocaleString()} requests this month</span><span>${quota ? `${quota.toLocaleString()} limit` : 'No monthly cap'}</span></div><div class="details-grid"><section><div class="section-title"><h3>Alerts</h3></div>${alertsMarkup(client.id, alerts)}</section><section><div class="section-title"><h3>Billing statements</h3></div>${invoicesMarkup(client.id, invoices)}</section></div><div class="actions"><button data-action="rotate" data-client="${escapeHtml(client.id)}">Rotate key</button>${client.previousKeyExpiresAt ? `<button data-action="finalize" data-client="${escapeHtml(client.id)}">End old key now</button>` : ''}<button data-action="usage" data-client="${escapeHtml(client.id)}">Download usage</button></div></article>`
}
async function download(url, filename) {
  const token = await currentUser.getIdToken()
  const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`}})
  if (!response.ok) throw new Error('The report could not be downloaded.')
  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
async function load() {
  showNotice('Loading your approved API clients...')
  const clients = await request('')
  const details = await Promise.all(
    clients.map((client) => request(`/${encodeURIComponent(client.id)}`)),
  )
  const used = details.reduce(
    (total, item) => total + Number(item.usage?.monthly?.requestCount || 0),
    0,
  )
  const alerts = details.reduce(
    (total, item) => total + item.alerts.filter((alert) => !alert.acknowledged).length,
    0,
  )
  summary.innerHTML = `<article><strong>${details.length}</strong><span>API clients</span></article><article><strong>${used.toLocaleString()}</strong><span>Requests this month</span></article><article><strong>${alerts}</strong><span>Open alerts</span></article>`
  clientList.innerHTML = details.length
    ? details.map(clientMarkup).join('')
    : '<p>No API clients are linked to this organisation.</p>'
  workspace.hidden = false
  showNotice('Partner workspace ready.')
}
clientList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  try {
    const clientId = button.dataset.client
    if (button.dataset.action === 'rotate') {
      const data = await request(`/${encodeURIComponent(clientId)}/rotate`, {
        method: 'POST',
        body: JSON.stringify({graceHours: 24}),
      })
      rotatedKey.textContent = data.apiKey
      secretDialog.showModal()
      await load()
    }
    if (button.dataset.action === 'finalize') {
      await request(`/${encodeURIComponent(clientId)}/finalize-rotation`, {method: 'POST'})
      await load()
    }
    if (button.dataset.action === 'ack') {
      await request(
        `/${encodeURIComponent(clientId)}/alerts/${encodeURIComponent(button.dataset.alert)}/acknowledge`,
        {method: 'POST'},
      )
      await load()
    }
    if (button.dataset.action === 'usage')
      await download(
        `/api/v1/partner/clients/${encodeURIComponent(clientId)}/usage.csv`,
        `career-unified-api-usage-${clientId}.csv`,
      )
    if (button.dataset.action === 'invoice')
      await download(
        `/api/v1/partner/clients/${encodeURIComponent(clientId)}/invoices/${encodeURIComponent(button.dataset.invoice)}.csv`,
        `${button.dataset.invoice}.csv`,
      )
  } catch (error) {
    showNotice(error.message, true)
  }
})
copyRotatedKey.addEventListener('click', async () => {
  await navigator.clipboard.writeText(rotatedKey.textContent || '')
  showNotice('New API key copied.')
})
signInButton.addEventListener('click', () => signInWithPopup(auth, provider))
onAuthStateChanged(auth, async (user) => {
  currentUser = user
  if (!user) {
    identity.textContent = 'Sign in with your approved recruiter account.'
    workspace.hidden = true
    return
  }
  identity.textContent = user.email || user.uid
  signInButton.textContent = 'Signed in'
  try {
    await load()
  } catch (error) {
    showNotice(error.message, true)
  }
})
