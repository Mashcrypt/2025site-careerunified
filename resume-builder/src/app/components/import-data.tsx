import { useMemo, useState } from 'react'
import { Upload, Linkedin, Loader2, CheckCircle2, Info, FileText, X, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'
import type { ResumeData } from '../types/resume'
import { motion } from 'motion/react'

interface ImportDataProps {
  onImport: (data: ResumeData) => void
}

function emptyResume(): ResumeData {
  return {
    personalInfo: {
      fullName: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      website: '',
      summary: '',
    },
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
  }
}

/* ===============================
   LinkedIn / Text Parser (UNCHANGED)
   =============================== */
function parseLinkedInText(raw: string): ResumeData {
  const data = emptyResume()
  const text = raw.replace(/\r/g, '').replace(/[•·▪]/g, '•').trim()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  const findEmail = (s: string) =>
    s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
  const findPhone = (s: string) =>
    s.match(/(\+\d{1,3}\s?\d{1,4}[\s-]?\d{3}[\s-]?\d{3,4})/)?.[0] ||
    s.match(/(\b0\d{2}\s?\d{3}\s?\d{4}\b)/)?.[0] ||
    ''
  const findLinkedIn = (s: string) =>
    s.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[^\s]+/i)?.[0] || ''

  const joined = lines.join(' ')
  data.personalInfo.email = findEmail(joined)
  data.personalInfo.phone = findPhone(joined)
  data.personalInfo.linkedin = findLinkedIn(joined)

  data.personalInfo.summary = raw.slice(0, 800)

  return data
}

/* ===============================
   CV / Resume Text Parser (NEW)
   - Used for extracted PDF/DOCX text
   - Best-effort section parsing into ResumeData
   =============================== */
function parseResumeText(raw: string): ResumeData {
  const data = emptyResume()

  const text = raw
    .replace(/\r/g, '')
    .replace(/[•·▪]/g, '•')
    .replace(/\u00A0/g, ' ')
    .trim()

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const joined = lines.join(' ')

  // ---- contact extraction
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
  const phone =
    joined.match(/(\+\d{1,3}\s?\d{1,4}[\s-]?\d{3}[\s-]?\d{3,4})/)?.[0] ||
    joined.match(/(\b0\d{2}\s?\d{3}\s?\d{4}\b)/)?.[0] ||
    ''
  const linkedin = joined.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[^\s]+/i)?.[0] || ''
  const website = joined.match(/(https?:\/\/)?(www\.)?[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?/i)?.[0] || ''

  if (email) data.personalInfo.email = email
  if (phone) data.personalInfo.phone = phone
  if (linkedin) data.personalInfo.linkedin = linkedin
  if (website && !/linkedin\.com/i.test(website) && !/@/.test(website)) data.personalInfo.website = website

  // ---- name + location guess
  const isBadNameLine = (s: string) =>
    /@|linkedin\.com|http|www\./i.test(s) || /\d{6,}/.test(s) || s.length > 60

  const looksLikeName = (s: string) => {
    const parts = s.split(/\s+/)
    if (parts.length < 2 || parts.length > 4) return false
    if (isBadNameLine(s)) return false
    return parts.every((p) => /^[A-Za-zÀ-ÿ'-]+$/.test(p))
  }

  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (!data.personalInfo.fullName && looksLikeName(lines[i])) data.personalInfo.fullName = lines[i]
    if (!data.personalInfo.location && /,/.test(lines[i]) && lines[i].length <= 60) {
      if (!/@|linkedin\.com|http/i.test(lines[i])) data.personalInfo.location = lines[i]
    }
  }

  // ---- section splitting
  type Section = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'other'

  const headerOf = (line: string): Section | null => {
    const h = line.toLowerCase()
    const is = (keywords: string[]) => keywords.some((k) => h === k || h.includes(k))

    if (is(['professional summary', 'summary', 'profile', 'about'])) return 'summary'
    if (is(['experience', 'work experience', 'employment', 'employment history'])) return 'experience'
    if (is(['education', 'academic', 'qualification', 'qualifications'])) return 'education'
    if (is(['skills', 'technical skills', 'core skills', 'competencies'])) return 'skills'
    if (is(['projects', 'project experience'])) return 'projects'
    if (is(['certifications', 'licenses', 'licences', 'certificates'])) return 'certifications'
    return null
  }

  const buckets: Record<Section, string[]> = {
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    other: [],
  }

  let current: Section = 'other'
  for (const line of lines) {
    const h = headerOf(line)
    if (h) {
      current = h
      continue
    }
    buckets[current].push(line)
  }

  // ---- summary
  const summaryText = buckets.summary.join('\n').trim()
  if (summaryText) {
    data.personalInfo.summary = summaryText.slice(0, 1200)
  } else {
    const firstPara = text.split(/\n{2,}/).map((p) => p.trim()).find((p) => p.length > 80) || ''
    data.personalInfo.summary = firstPara ? firstPara.slice(0, 1200) : ''
  }

  // ---- skills
  const skillsRaw = buckets.skills.join(' • ')
  const skills = skillsRaw
    .split(/•|,|\||;/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 50)

  if (skills.length) data.skills = Array.from(new Set(skills))

  // ---- certifications
  const certs = buckets.certifications.map((s) => s.replace(/^•\s*/, '').trim()).filter(Boolean)
  if (certs.length) data.certifications = Array.from(new Set(certs))

  // ---- education blocks
  const eduLines = buckets.education
  if (eduLines.length) {
    const blocks: string[][] = []
    let block: string[] = []

    const newSchool = (l: string) =>
      /(university|college|institute|school|academy|tvet|technik)/i.test(l) && block.length >= 2

    for (const l of eduLines) {
      if (newSchool(l)) {
        blocks.push(block)
        block = [l]
      } else {
        block.push(l)
      }
    }
    if (block.length) blocks.push(block)

    data.education = blocks
      .map((b, idx) => {
        const institution = b[0] || ''
        const degree = b[1] || ''
        const rest = b.slice(2).join(' ')
        const graduationDate = rest.match(/(20\d{2}|19\d{2}|present)/i)?.[0] || ''
        const location = rest.includes(',') && rest.length <= 60 ? rest : ''
        return {
          id: `edu-${Date.now()}-${idx}`,
          institution,
          degree,
          location,
          graduationDate,
          gpa: '',
        }
      })
      .filter((e) => e.institution || e.degree)
  }

  // ---- experience blocks
  const expLines = buckets.experience
  if (expLines.length) {
    const entries: string[][] = []
    let block: string[] = []

    const looksLikeDateRange = (s: string) =>
      /(\bjan\b|\bfeb\b|\bmar\b|\bapr\b|\bmay\b|\bjun\b|\bjul\b|\baug\b|\bsep\b|\boct\b|\bnov\b|\bdec\b|\b20\d{2}\b|\bpresent\b).*(\-|to).*(\b20\d{2}\b|\bpresent\b)/i.test(
        s
      )

    const looksLikeRoleLine = (s: string) =>
      s.length <= 80 && !/@|linkedin\.com|http/i.test(s) && !looksLikeDateRange(s)

    for (const l of expLines) {
      const startNew = block.length >= 3 && looksLikeRoleLine(l)
      if (startNew) {
        entries.push(block)
        block = [l]
      } else {
        block.push(l)
      }
    }
    if (block.length) entries.push(block)

    data.experience = entries
      .map((b, idx) => {
        const position = b[0] || ''
        const company = b[1] || ''
        let startDate = ''
        let endDate = ''
        let currentJob = false
        let location = ''

        const dateLine = b.find((x) => looksLikeDateRange(x)) || ''
        if (dateLine) {
          const parts = dateLine.split(/-|to/i).map((p) => p.trim())
          startDate = parts[0] || ''
          endDate = parts[1] || ''
          currentJob = /present/i.test(endDate)
        }

        const locLine =
          b.find((x) => x.includes(',') && x.length <= 60 && !/@|http|linkedin/i.test(x)) || ''
        if (locLine && locLine !== company) location = locLine

        const skip = new Set([position, company, dateLine, locLine])
        const descLines = b.filter((x) => !skip.has(x)).map((x) => (x.startsWith('•') ? x : `• ${x}`))

        const description = descLines.join('\n').trim()

        return {
          id: `exp-${Date.now()}-${idx}`,
          position,
          company,
          location,
          startDate,
          endDate: currentJob ? 'Present' : endDate,
          current: currentJob,
          description,
        }
      })
      .filter((e) => e.position || e.company)
  }

  // ---- projects (basic)
  const projLines = buckets.projects
  if (projLines.length) {
    const chunks = projLines
      .join('\n')
      .split(/\n{2,}/)
      .map((c) => c.trim())
      .filter(Boolean)

    data.projects = chunks.map((chunk, idx) => {
      const firstLine = chunk.split('\n')[0]?.replace(/^•\s*/, '') || `Project ${idx + 1}`
      const rest = chunk.split('\n').slice(1).join('\n').trim()
      return {
        id: `proj-${Date.now()}-${idx}`,
        name: firstLine,
        description: rest || chunk,
        technologies: [],
        link: '',
      }
    })
  }

  // ---- fallback name from email
  if (!data.personalInfo.fullName && data.personalInfo.email) {
    const nameGuess = data.personalInfo.email.split('@')[0]?.replace(/[._-]+/g, ' ')
    if (nameGuess) data.personalInfo.fullName = nameGuess.replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return data
}

export function ImportData({ onImport }: ImportDataProps) {
  const [activeTab, setActiveTab] = useState<'linkedin' | 'upload'>('linkedin')

  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // LinkedIn paste
  const [linkedInText, setLinkedInText] = useState('')

  // Upload CV
  const [file, setFile] = useState<File | null>(null)

  const canImportLinkedIn = useMemo(() => linkedInText.trim().length >= 40, [linkedInText])

  const resetAlerts = () => {
    setImportSuccess(false)
    setErrorMsg('')
  }

  const handleLinkedInPasteImport = async () => {
    if (!canImportLinkedIn) return

    setIsImporting(true)
    resetAlerts()

    try {
      await new Promise((r) => setTimeout(r, 250))
      const parsed = parseLinkedInText(linkedInText)
      onImport(parsed)
      setImportSuccess(true)
      setLinkedInText('')
      setTimeout(() => setImportSuccess(false), 2500)
    } catch (e) {
      console.error(e)
      setErrorMsg('Could not import. Please paste more of your LinkedIn profile (About + Experience + Education).')
    } finally {
      setIsImporting(false)
    }
  }

  const handleUploadImport = async () => {
    if (!file) return

    setIsImporting(true)
    resetAlerts()

    try {
      const allowed = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]
      const looksOk = allowed.includes(file.type) || /\.pdf$|\.docx$/i.test(file.name)
      if (!looksOk) {
        setErrorMsg('Please upload a PDF or DOCX file.')
        return
      }

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/.netlify/functions/extract-resume-text', {
        method: 'POST',
        body: formData,
      })

      let payload: any = null
      try {
        payload = await res.json()
      } catch {
        payload = null
      }

      if (!res.ok) {
        const msg = payload?.error || payload?.message || `Upload failed (status ${res.status}). Please try again.`
        setErrorMsg(String(msg))
        return
      }

      if (!payload?.text || typeof payload.text !== 'string') {
        setErrorMsg('We could not extract text from that file. Try a different PDF/DOCX (non-scanned).')
        return
      }

      // ✅ Use CV parser (NOT the LinkedIn parser)
      const parsed = parseResumeText(payload.text)
      onImport(parsed)

      setImportSuccess(true)
      setFile(null)
      setTimeout(() => setImportSuccess(false), 2500)
    } catch (e: any) {
      console.error(e)
      setErrorMsg(e?.message || 'Failed to import CV. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  const buttonLabel = activeTab === 'linkedin' ? 'Import from LinkedIn' : 'Import CV & Use for AI'
  const canClick = activeTab === 'linkedin' ? canImportLinkedIn : !!file
  const onClick = activeTab === 'linkedin' ? handleLinkedInPasteImport : handleUploadImport
  const buttonIcon =
    activeTab === 'linkedin' ? <Linkedin className="h-4 w-4 mr-2" /> : <FileText className="h-4 w-4 mr-2" />

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {/* ✅ Make icon BLUE to match UX */}
          <Upload className="h-5 w-5 text-blue-600" />
          <CardTitle>Import Resume</CardTitle>
        </div>
        <CardDescription>Import from LinkedIn or upload your existing CV</CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            resetAlerts()
            setActiveTab(v as 'linkedin' | 'upload')
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="linkedin" className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn (Paste)
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Upload CV
            </TabsTrigger>
          </TabsList>

          {/* LinkedIn Paste */}
          <TabsContent value="linkedin" className="space-y-4 mt-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex gap-3">
              <Info className="h-5 w-5 mt-0.5 text-blue-700" />
              <div>
                <p className="font-semibold">How to import (30 seconds)</p>
                <ol className="list-decimal ml-5 mt-1 space-y-1">
                  <li>Open your LinkedIn profile</li>
                  <li>
                    Copy your <b>About</b>, <b>Experience</b>, <b>Education</b>, and <b>Skills</b>
                  </li>
                  <li>
                    Paste below → click <b>Import</b>
                  </li>
                </ol>
                <p className="mt-2 text-xs text-blue-700">
                  This does not connect to LinkedIn — you’re importing text you provide.
                </p>
              </div>
            </div>

            <Textarea
              value={linkedInText}
              onChange={(e) => setLinkedInText(e.target.value)}
              rows={10}
              placeholder="Paste your LinkedIn profile here…"
            />

            <p className="text-xs text-gray-500">
              Tip: Paste more content (especially Experience) for better results.
            </p>
          </TabsContent>

          {/* Upload CV */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Upload your existing CV (PDF or DOCX). We’ll extract the text and fill your resume fields for AI Tailor.
            </div>

            {/* Styled picker */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Choose a file</p>
                  <p className="text-xs text-gray-500 mt-1">Supported: PDF, DOCX (scanned PDFs may not work)</p>

                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium cursor-pointer">
                      <FileText className="h-4 w-4" />
                      {file ? 'Change File' : 'Select File'}
                      <input
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => {
                          resetAlerts()
                          setFile(e.target.files?.[0] || null)
                        }}
                      />
                    </label>

                    {file && (
                      <button
                        type="button"
                        onClick={() => {
                          resetAlerts()
                          setFile(null)
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </button>
                    )}
                  </div>

                  {file && (
                    <div className="mt-3 text-sm text-gray-700">
                      <span className="font-medium">Selected:</span> {file.name}{' '}
                      <span className="text-gray-500">({Math.round(file.size / 1024)} KB)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* ✅ Single main action button (prevents “demo-looking” disabled button confusion) */}
        <Button
          onClick={onClick}
          disabled={!canClick || isImporting}
          className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {isImporting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : importSuccess ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Imported Successfully!
            </>
          ) : (
            <>
              {buttonIcon}
              {buttonLabel}
            </>
          )}
        </Button>

        {/* Alerts */}
        {errorMsg && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{errorMsg}</p>
            </div>
          </div>
        )}

        {importSuccess && !errorMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg"
          >
            <p className="text-sm text-green-800">Resume imported successfully. You can now use AI Tailor.</p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}
