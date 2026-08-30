import {createHash} from 'node:crypto'
import {getActiveBursaries, getActiveJobs, getCareerGuides, getUniversities} from '../lib/sanity'
import {sendTransactionalEmail} from './_notify'

type Preferences = {
  enabled: boolean
  opportunityTypes: string[]
  industries: string[]
  channels: string[]
  frequency: 'instant' | 'daily' | 'weekly'
  updates: string[]
}

type Opportunity = {
  id: string
  title: string
  kind: string
  types: string[]
  industries: string[]
  url: string
  deadline?: string
  publishedAt: Date
}

const INDUSTRIES: Record<string, string[]> = {
  'Accounting & Finance': ['accounting', 'finance', 'audit', 'banking', 'actuarial', 'tax'],
  'Information Technology': ['software', 'developer', 'technology', 'information technology', 'data', 'cyber'],
  Engineering: ['engineer', 'engineering', 'mechanical', 'electrical', 'civil'],
  Healthcare: ['health', 'medical', 'nursing', 'pharmacy'],
  Education: ['education', 'teacher', 'teaching', 'university', 'school'],
  Legal: ['legal', 'law', 'attorney'],
  Marketing: ['marketing', 'communications', 'brand', 'media'],
  'Human Resources': ['human resources', 'recruitment', 'talent', 'hr '],
  Administration: ['administration', 'administrator', 'clerk', 'office'],
  Retail: ['retail', 'store', 'sales assistant'],
  Government: ['government', 'department', 'municipal', 'public service', 'saps', 'defence force'],
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function preferences(value: unknown): Preferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (data.enabled !== true) return null
  const frequency = ['instant', 'daily', 'weekly'].includes(String(data.frequency))
    ? (String(data.frequency) as Preferences['frequency'])
    : 'daily'
  return {
    enabled: true,
    opportunityTypes: list(data.opportunityTypes),
    industries: list(data.industries),
    channels: list(data.channels),
    frequency,
    updates: list(data.updates),
  }
}

function date(value: unknown) {
  if (value && typeof (value as {toDate?: unknown}).toDate === 'function') {
    return (value as {toDate: () => Date}).toDate()
  }
  const parsed = new Date(String(value || ''))
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed
}

function inferIndustries(...values: unknown[]) {
  const text = values.map((value) => String(value || '')).join(' ').toLowerCase()
  return Object.entries(INDUSTRIES)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([industry]) => industry)
}

function jobTypes(category: unknown, title: unknown) {
  const types = new Set(['Jobs'])
  const value = String(category || '').toLowerCase()
  const mapped: Record<string, string> = {
    internship: 'Internships', learnership: 'Learnerships', 'graduate-program': 'Graduate Programmes',
    'yes-programmes': 'YES Programmes', 'youth-opportunities': 'Youth Opportunities',
    'vacation-work': 'Vacation Work', 'part-time': 'Part-time Jobs',
  }
  if (mapped[value]) types.add(mapped[value])
  const text = String(title || '').toLowerCase()
  if (/matric|grade 12/.test(text)) types.add('Matric Opportunities')
  if (/entry.level|no experience/.test(text)) types.add('Entry-level / No Experience')
  if (/government|department|municipal|public service|saps|defence force/.test(text)) types.add('Government Vacancies')
  return [...types]
}

function matches(item: Opportunity, prefs: Preferences) {
  if (!item.types.some((type) => prefs.opportunityTypes.includes(type))) return false
  if (!item.industries.length) return true
  if (!prefs.industries.length || prefs.industries.includes('General / Any Industry')) return true
  return item.industries.some((industry) => prefs.industries.includes(industry))
}

function escapeHtml(value: unknown) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character)
}

function digestEmail(items: Opportunity[], reminders: Opportunity[], frequency: string) {
  const rows = [...reminders, ...items].slice(0, 12)
  const heading = frequency === 'weekly' ? 'Your weekly Career Unified update' : 'New opportunities selected for you'
  const htmlRows = rows.map((item) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb"><a href="${escapeHtml(item.url)}" style="color:#185FA5;font-weight:600;text-decoration:none">${escapeHtml(item.title)}</a><div style="color:#64748b;font-size:13px;margin-top:4px">${escapeHtml(item.kind)}${item.deadline ? ` · Closing ${escapeHtml(item.deadline)}` : ''}</div></td></tr>`).join('')
  const text = [heading, '', ...rows.map((item) => `${item.title}${item.deadline ? ` (closes ${item.deadline})` : ''}\n${item.url}`), '', 'Manage alerts: https://careerunified.com/account-page.html?tab=notifications'].join('\n')
  return {
    subject: reminders.length ? `${reminders.length} closing reminder${reminders.length === 1 ? '' : 's'} and new matches` : heading,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#0f172a"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p style="color:#475569">These updates match the choices in your Career Unified notification settings.</p><table style="width:100%;border-collapse:collapse">${htmlRows}</table><p style="font-size:12px;color:#64748b;margin-top:24px">You are receiving this because personalised email alerts are enabled. <a href="https://careerunified.com/account-page.html?tab=notifications" style="color:#185FA5">Manage alerts</a>.</p></div>`,
  }
}

function key(...parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)
}

function bucket(now: Date, frequency: string) {
  const iso = now.toISOString().slice(0, 10)
  if (frequency !== 'weekly') return iso
  const first = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  return `${now.getUTCFullYear()}-${Math.ceil((((now.getTime() - first.getTime()) / 86400000) + first.getUTCDay() + 1) / 7)}`
}

async function claim(db: any, uid: string, id: string, data: Record<string, unknown>) {
  const ref = db.doc(`users/${uid}/notificationDeliveries/${id}`)
  return db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref)
    if (snapshot.exists) {
      const existing = snapshot.data() || {}
      const failedAt = date(existing.failedAt)
      if (existing.status !== 'failed' || Date.now() - failedAt.getTime() < 60 * 60000) return false
      transaction.set(ref, {...data, status: 'claimed', retriedAt: new Date()}, {merge: true})
      return true
    }
    transaction.create(ref, {...data, status: 'claimed', createdAt: new Date()})
    return true
  })
}

async function recentOpportunities(admin: any, since: Date): Promise<Opportunity[]> {
  const db = admin.firestore()
  const [sanityJobs, bursaries, universities, recruiterJobs] = await Promise.all([
    getActiveJobs(250), getActiveBursaries(150), getUniversities(100),
    db.collection('jobs').where('status', '==', 'active').limit(250).get(),
  ])
  const result: Opportunity[] = []
  for (const raw of sanityJobs as any[]) {
    const publishedAt = date(raw._createdAt || raw.posted)
    if (publishedAt < since) continue
    result.push({id: `sanity-job-${raw._id}`, title: raw.title, kind: 'Job', types: jobTypes(raw.category, raw.title), industries: inferIndustries(raw.category, raw.title, raw.description), url: `https://careerunified.com/jobs/${raw.slug}`, deadline: raw.deadline || raw.deadlineText, publishedAt})
  }
  for (const raw of recruiterJobs.docs.map((doc: any) => ({id: doc.id, ...doc.data()}))) {
    const publishedAt = date(raw.createdAt || raw.updatedAt)
    if (publishedAt < since) continue
    const slug = raw.slug || raw.id
    result.push({id: `recruiter-job-${raw.id}`, title: raw.title, kind: 'Job', types: jobTypes(raw.category || raw.type, raw.title), industries: raw.companyIndustry ? [raw.companyIndustry] : inferIndustries(raw.title, raw.description), url: `https://careerunified.com/jobs/${slug}`, deadline: raw.deadline, publishedAt})
  }
  for (const raw of bursaries as any[]) {
    const publishedAt = date(raw._createdAt || raw._updatedAt)
    if (publishedAt < since) continue
    result.push({id: `bursary-${raw._id}`, title: raw.name, kind: 'Bursary', types: ['Bursaries'], industries: inferIndustries(raw.faculty, raw.faculties, raw.description), url: `https://careerunified.com/bursary/${raw.slug}`, deadline: raw.deadline, publishedAt})
  }
  for (const raw of universities as any[]) {
    const publishedAt = date(raw._createdAt || raw._updatedAt)
    if (publishedAt < since) continue
    result.push({id: `university-${raw._id}`, title: raw.name, kind: 'University application', types: ['University Applications'], industries: [], url: `https://careerunified.com/varsity/${raw.slug}`, deadline: raw.deadline, publishedAt})
  }
  return result
}

async function recentCareerUpdates(admin: any, since: Date): Promise<Opportunity[]> {
  const db = admin.firestore()
  const [guides, updates] = await Promise.all([
    getCareerGuides(50),
    db.collection('careerUpdates').where('published', '==', true).limit(50).get().catch(() => null),
  ])
  const result: Opportunity[] = []
  for (const raw of (guides || []) as any[]) {
    const publishedAt = date(raw._updatedAt || raw._createdAt)
    if (publishedAt < since) continue
    result.push({id: `guide-${raw._id}`, title: raw.title, kind: raw.category || 'Career guide', types: [], industries: [], url: 'https://careerunified.com/cv-tips', publishedAt})
  }
  for (const document of updates?.docs || []) {
    const raw = document.data()
    const publishedAt = date(raw.publishedAt || raw.createdAt)
    if (publishedAt < since) continue
    const url = String(raw.url || '')
    result.push({id: `career-update-${document.id}`, title: String(raw.title || 'Career Unified update'), kind: raw.kind === 'event' ? 'Career event' : 'Career guide', types: [], industries: [], url: url.startsWith('https://careerunified.com/') ? url : 'https://careerunified.com/cv-tips', publishedAt})
  }
  return result
}

async function deadlineReminders(db: any, uid: string) {
  const saved = await db.collection(`users/${uid}/saved`).limit(100).get()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return saved.docs.flatMap((document: any) => {
    const raw = document.data()
    const deadline = date(raw.deadlineDate || raw.deadline)
    deadline.setHours(0, 0, 0, 0)
    const days = Math.round((deadline.getTime() - today.getTime()) / 86400000)
    if (![1, 3, 7].includes(days)) return []
    const isBursary = raw.type === 'bursary'
    return [{id: `deadline-${document.id}-${deadline.toISOString().slice(0, 10)}`, title: raw.title || raw.name || 'Saved opportunity', kind: `${days} day closing reminder`, types: [isBursary ? 'Bursaries' : 'Jobs'], industries: [], url: isBursary ? `https://careerunified.com/bursary/${raw.slug || ''}` : `https://careerunified.com/jobs/${raw.slug || ''}`, deadline: deadline.toISOString().slice(0, 10), publishedAt: new Date()}]
  })
}

export async function processPersonalizedNotifications(admin: any, options: {
  limit?: number
  dryRun?: boolean
  testEmails?: string[]
} = {}) {
  const db = admin.firestore()
  const now = new Date()
  const stateRef = db.doc('system/personalizedNotificationProcessor')
  const state = await stateRef.get()
  const cursor = state.data()?.cursor
  const testEmails = (options.testEmails || []).map((email) => email.toLowerCase()).slice(0, 30)
  let query = testEmails.length
    ? db.collection('users').where('email', 'in', testEmails).limit(options.limit || 75)
    : db.collection('users').where('notificationPreferences.enabled', '==', true).orderBy('__name__').limit(options.limit || 75)
  if (cursor && !testEmails.length) query = query.startAfter(cursor)
  let users = await query.get()
  if (users.empty && cursor && !testEmails.length) users = await db.collection('users').where('notificationPreferences.enabled', '==', true).orderBy('__name__').limit(options.limit || 75).get()
  const earliest = new Date(now.getTime() - 8 * 86400000)
  const [opportunities, careerUpdates] = await Promise.all([
    recentOpportunities(admin, earliest),
    recentCareerUpdates(admin, earliest),
  ])
  let emails = 0; let inApp = 0; let eligibleUsers = 0; let matchedItems = 0
  for (const user of users.docs) {
    const data = user.data()
    const prefs = preferences(data.notificationPreferences)
    if (!prefs) continue
    const last = date(data.notificationDelivery?.[`last${prefs.frequency[0].toUpperCase()}${prefs.frequency.slice(1)}At`])
    const wait = prefs.frequency === 'instant' ? 10 * 60000 : prefs.frequency === 'daily' ? 20 * 3600000 : 6 * 86400000
    if (last.getTime() && now.getTime() - last.getTime() < wait) continue
    const since = last.getTime() ? last : new Date(now.getTime() - (prefs.frequency === 'weekly' ? 8 : 2) * 86400000)
    const opportunityMatches = opportunities.filter((item) => item.publishedAt >= since && matchesOpportunity(item, prefs))
    const guideMatches = prefs.updates.includes('careerGuides')
      ? careerUpdates.filter((item) => item.publishedAt >= since)
      : []
    const matches = [...opportunityMatches, ...guideMatches]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 20)
    const reminders = prefs.updates.includes('deadlineReminders') ? await deadlineReminders(db, user.id) : []
    if (matches.length || reminders.length) {
      eligibleUsers += 1
      matchedItems += matches.length + reminders.length
    }
    if (options.dryRun) continue
    const deliveryId = key('digest', user.id, prefs.frequency, bucket(now, prefs.frequency), [...reminders, ...matches].map((item) => item.id).sort().join(','))
    if (!matches.length && !reminders.length) {
      await user.ref.set({notificationDelivery: {[`last${prefs.frequency[0].toUpperCase()}${prefs.frequency.slice(1)}At`]: now}}, {merge: true})
      continue
    }
    if (!(await claim(db, user.id, deliveryId, {frequency: prefs.frequency}))) continue
    if (prefs.channels.includes('inApp')) {
      const batch = db.batch()
      for (const item of [...reminders, ...matches]) {
        batch.set(db.doc(`users/${user.id}/notifications/${key(item.id)}`), {title: item.title, message: item.deadline ? `${item.kind} · Closing ${item.deadline}` : item.kind, url: item.url, type: item.id.startsWith('deadline-') ? 'deadline' : 'match', read: false, createdAt: now}, {merge: true})
        inApp += 1
      }
      await batch.commit()
    }
    const recipient = String(data.email || '').trim()
    try {
      if (prefs.channels.includes('email') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
        const message = digestEmail(matches, reminders, prefs.frequency)
        await sendTransactionalEmail({to: recipient, ...message, tag: 'personalised-alert'})
        emails += 1
      }
      await user.ref.set({notificationDelivery: {[`last${prefs.frequency[0].toUpperCase()}${prefs.frequency.slice(1)}At`]: now}}, {merge: true})
      await db.doc(`users/${user.id}/notificationDeliveries/${deliveryId}`).set({status: 'sent', sentAt: now}, {merge: true})
    } catch (error) {
      await db.doc(`users/${user.id}/notificationDeliveries/${deliveryId}`).set({status: 'failed', failedAt: now}, {merge: true})
      console.error('PERSONALISED_NOTIFICATION_DELIVERY_FAILED', {userId: user.id, deliveryId})
    }
  }
  const lastUser = users.docs.at(-1)
  if (!options.dryRun && !testEmails.length) {
    await stateRef.set({cursor: lastUser?.id || null, processedAt: now}, {merge: true})
  }
  return {dryRun: options.dryRun === true, restrictedToTestRecipients: testEmails.length > 0, users: users.size, eligibleUsers, matchedItems, emails, inApp}
}

// Kept separate to make the matching rule directly testable.
export const matchesOpportunity = matches
