import {cleanText, timestampToIso} from './_apiV1'
import {getAdmin} from './_firebaseAdmin'

function previousMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 7)
}

export async function generateApiInvoicesForMonth(month = previousMonth()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid invoice month')
  const admin = getAdmin()
  const db = admin.firestore()
  const clients = await db.collection('apiClients').where('active', '==', true).limit(500).get()
  let created = 0
  for (const clientDoc of clients.docs) {
    const client = clientDoc.data() || {}
    const usage = await db.doc(`apiUsageMonthly/${clientDoc.id}_${month}`).get()
    const requestCount = Number(usage.data()?.requestCount || 0)
    const billingMode = cleanText(client.billingMode, 40) || 'included'
    const unitRateCents = Math.max(0, Number(client.overageRateCents || 0))
    const billableRequests = billingMode === 'usage' ? requestCount : 0
    const amountCents = Math.round(billableRequests * unitRateCents)
    const invoiceRef = db.doc(`apiInvoices/${clientDoc.id}_${month}`)
    const existing = await invoiceRef.get()
    if (existing.exists) continue
    await invoiceRef.set({
      clientId: clientDoc.id,
      recruiterId: cleanText(client.recruiterId, 160),
      organizationId: cleanText(client.organizationId, 160),
      month,
      environment: cleanText(client.environment, 20) || 'live',
      billingMode,
      requestCount,
      billableRequests,
      unitRateCents,
      amountCents,
      currency: 'ZAR',
      status: amountCents > 0 ? 'draft' : 'no_charge',
      paymentMethod: 'manual_partner_invoice',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    created += 1
  }
  return {month, created}
}

export async function listApiInvoices(clientId: string) {
  const snapshot = await getAdmin()
    .firestore()
    .collection('apiInvoices')
    .where('clientId', '==', clientId)
    .limit(36)
    .get()
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {}
      return {
        id: doc.id,
        month: cleanText(data.month, 20),
        requestCount: Number(data.requestCount || 0),
        billableRequests: Number(data.billableRequests || 0),
        unitRateCents: Number(data.unitRateCents || 0),
        amountCents: Number(data.amountCents || 0),
        currency: cleanText(data.currency, 10) || 'ZAR',
        status: cleanText(data.status, 40),
        createdAt: timestampToIso(data.createdAt),
      }
    })
    .sort((left, right) => right.month.localeCompare(left.month))
}

export function invoiceCsv(invoice: Record<string, any>) {
  const rows = [
    ['invoice_id', invoice.id],
    ['month', invoice.month],
    ['currency', invoice.currency],
    ['requests', invoice.requestCount],
    ['billable_requests', invoice.billableRequests],
    ['unit_rate_cents', invoice.unitRateCents],
    ['amount_cents', invoice.amountCents],
    ['status', invoice.status],
  ]
  return rows
    .map(([key, value]) => `"${key}","${String(value ?? '').replace(/"/g, '""')}"`)
    .join('\n')
}
