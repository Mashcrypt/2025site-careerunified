import { useMemo, useState } from 'react'
import { Upload, Linkedin, Loader2, CheckCircle2, Info } from 'lucide-react'
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

/**
 * LinkedIn Paste Import (Option 3)
 * Users paste profile content (About + Experience + Education + Skills)
 * We parse it into ResumeData as best-effort.
 */
function parseLinkedInText(raw: string): ResumeData {
  const data = emptyResume()

  const text = raw
    .replace(/\r/g, '')
    .replace(/[•·▪]/g, '•')
    .trim()

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // --- Helpers
  const findEmail = (s: string) => {
    const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    return m?.[0] || ''
  }

  const findPhone = (s: string) => {
    // Best-effort: SA + intl patterns
    // Examples: +27 82 123 4567, 082 123 4567, (021) 555-0100
    const m =
      s.match(/(\+\d{1,3}\s?\d{1,4}[\s-]?\d{3}[\s-]?\d{3,4})/) ||
      s.match(/(\b0\d{2}\s?\d{3}\s?\d{4}\b)/) ||
      s.match(/(\(\d{3}\)\s?\d{3}[-\s]?\d{4})/)
    return m?.[0] || ''
  }

  const findLinkedIn = (s: string) => {
    const m = s.match(/(https?:\/\/)?(www\.)?linkedin\.com\/[^\s]+/i)
    return m?.[0] || ''
  }

  const looksLikeName = (s: string) => {
    // 2-4 words, mostly letters
    const parts = s.split(/\s+/)
    if (parts.length < 2 || parts.length > 4) return false
    if (s.length > 40) return false
    if (/[0-9@]/.test(s)) return false
    return parts.every((p) => /^[A-Za-zÀ-ÿ'-]+$/.test(p))
  }

  const isSectionHeader = (s: string) => {
    const h = s.toLowerCase()
    return (
      h === 'about' ||
      h === 'summary' ||
      h === 'experience' ||
      h === 'work experience' ||
      h === 'education' ||
      h === 'skills' ||
      h === 'licenses & certifications' ||
      h === 'certifications' ||
      h === 'projects'
    )
  }

  const normalizeHeader = (s: string) => {
    const h = s.toLowerCase()
    if (h === 'about' || h === 'summary') return 'about'
    if (h === 'experience' || h === 'work experience') return 'experience'
    if (h === 'education') return 'education'
    if (h === 'skills') return 'skills'
    if (h === 'projects') return 'projects'
    if (h === 'licenses & certifications' || h === 'certifications') return 'certifications'
    return ''
  }

  // --- Step 1: Basic contact extraction from entire text
  const joined = lines.join(' ')
  const email = findEmail(joined)
  const phone = findPhone(joined)
  const linkedin = findLinkedIn(joined)

  if (email) data.personalInfo.email = email
  if (phone) data.personalInfo.phone = phone
  if (linkedin) data.personalInfo.linkedin = linkedin

  // --- Step 2: Guess name + headline from first few lines
  // Common LinkedIn paste: Name, Headline, Location, etc.
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    if (!data.personalInfo.fullName && looksLikeName(lines[i])) {
      data.personalInfo.fullName = lines[i]
      // Often the next line is headline/title
      const next = lines[i + 1]
      if (next && !isSectionHeader(next) && next.length <= 80) {
        // Put it into summary first line if summary is empty (your data has no "title" field)
        if (!data.personalInfo.summary) data.personalInfo.summary = next
      }
    }
    // Location often appears early and contains comma
    if (!data.personalInfo.location && /,/.test(lines[i]) && lines[i].length <= 60) {
      // Avoid emails/urls
      if (!/@|linkedin\.com|http/i.test(lines[i])) {
        data.personalInfo.location = lines[i]
      }
    }
  }

  // --- Step 3: Split into sections
  type Section = 'about' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'unknown'
  let current: Section = 'unknown'

  const buckets: Record<Section, string[]> = {
    about: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    unknown: [],
  }

  for (const line of lines) {
    if (isSectionHeader(line)) {
      const h = normalizeHeader(line) as Section
      current = h || 'unknown'
      continue
    }
    buckets[current].push(line)
  }

  // --- About/Summary
  const aboutText = buckets.about.join('\n').trim()
  if (aboutText) {
    // If summary already holds headline, keep both
    if (data.personalInfo.summary) {
      // Avoid duplicating
      if (!aboutText.toLowerCase().includes(data.personalInfo.summary.toLowerCase())) {
        data.personalInfo.summary = `${data.personalInfo.summary}\n\n${aboutText}`.trim()
      }
    } else {
      data.personalInfo.summary = aboutText
    }
  }

  // --- Skills
  // LinkedIn often has skills listed as comma separated or bullet/line items
  const skillsRaw = buckets.skills.join(' • ')
  const skills = skillsRaw
    .split(/•|,|\|/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 40)

  if (skills.length) data.skills = Array.from(new Set(skills))

  // --- Certifications (optional)
  const certs = buckets.certifications
    .map((s) => s.replace(/^•\s*/, '').trim())
    .filter(Boolean)
  if (certs.length) data.certifications = Array.from(new Set(certs))

  // --- Education parsing (best-effort)
  // We will create entries when we see lines that look like a school/institution or degree
  // Format varies; we try:
  //  - Line 1: Institution
  //  - Line 2: Degree / Field
  //  - Line 3: Dates/Location (optional)
  const eduLines = buckets.education
  if (eduLines.length) {
    const items: string[][] = []
    let currentBlock: string[] = []
    for (const l of eduLines) {
      // Start a new block if line looks like a new institution (has "University", "College", etc.)
      const isNew =
        /(university|college|institute|school|academy|technik|tvet)/i.test(l) &&
        currentBlock.length >= 2
      if (isNew) {
        items.push(currentBlock)
        currentBlock = [l]
      } else {
        currentBlock.push(l)
      }
    }
    if (currentBlock.length) items.push(currentBlock)

    data.education = items
      .map((block, idx) => {
        const institution = block[0] || ''
        const degree = block[1] || ''
        const rest = block.slice(2).join(' ')
        const graduationDate =
          rest.match(/(20\d{2}|19\d{2}|present)/i)?.[0] || ''
        const location =
          rest.includes(',') && rest.length <= 60 ? rest : ''
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

  // --- Experience parsing (best-effort)
  // Common pattern:
  //  - Title
  //  - Company
  //  - Dates (Jan 2020 - Present)
  //  - Location (optional)
  //  - Bullets / description lines
  const expLines = buckets.experience

  if (expLines.length) {
    const entries: string[][] = []
    let block: string[] = []

    const looksLikeDateRange = (s: string) =>
      /(\bjan\b|\bfeb\b|\bmar\b|\bapr\b|\bmay\b|\bjun\b|\bjul\b|\baug\b|\bsep\b|\boct\b|\bnov\b|\bdec\b|\b20\d{2}\b|\bpresent\b).*(\-|to).*(\b20\d{2}\b|\bpresent\b)/i.test(
        s
      )

    const looksLikeRoleLine = (s: string) =>
      s.length <= 70 && !/@|linkedin\.com|http/i.test(s) && !looksLikeDateRange(s)

    for (const l of expLines) {
      // Heuristic: a new experience often starts with a role line, after a block already has content
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

        // find date range line
        const dateLine = b.find((x) => looksLikeDateRange(x)) || ''
        if (dateLine) {
          // Extract start/end roughly
          const parts = dateLine.split(/-|to/i).map((p) => p.trim())
          startDate = parts[0] || ''
          endDate = parts[1] || ''
          currentJob = /present/i.test(endDate)
        }

        // location candidate: short line with comma, not company/email/url
        const locLine =
          b.find((x) => x.includes(',') && x.length <= 60 && !/@|http|linkedin/i.test(x)) ||
          ''
        // avoid picking company line if it contains a comma like "Company, Inc."
        if (locLine && locLine !== company) location = locLine

        // description: everything after the first 2-4 lines excluding date/location lines
        const skip = new Set([position, company, dateLine, locLine])
        const descLines = b
          .filter((x) => !skip.has(x))
          .map((x) => (x.startsWith('•') ? x : `• ${x}`))

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

  // --- Projects parsing (optional basic)
  // If user pasted "Projects" section, treat each paragraph or bullet group as one project
  const projLines = buckets.projects
  if (projLines.length) {
    const joinedProj = projLines.join('\n')
    const chunks = joinedProj
      .split(/\n{2,}/)
      .map((c) => c.trim())
      .filter(Boolean)

    data.projects = chunks.map((chunk, idx) => {
      const firstLine = chunk.split('\n')[0]?.replace(/^•\s*/, '') || `Project ${idx + 1}`
      const rest = chunk
        .split('\n')
        .slice(1)
        .join('\n')
        .trim()
      return {
        id: `proj-${Date.now()}-${idx}`,
        name: firstLine,
        description: rest || chunk,
        technologies: [],
        link: '',
      }
    })
  }

  // --- Fallbacks
  if (!data.personalInfo.summary) {
    // If no About section exists, try to use first meaningful paragraph
    const firstParagraph = raw.split(/\n{2,}/).map((p) => p.trim()).find(Boolean) || ''
    if (firstParagraph && firstParagraph.length > 40) data.personalInfo.summary = firstParagraph
  }

  // If still no name, try email prefix
  if (!data.personalInfo.fullName && data.personalInfo.email) {
    const nameGuess = data.personalInfo.email.split('@')[0]?.replace(/[._-]+/g, ' ')
    if (nameGuess) data.personalInfo.fullName = nameGuess.replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return data
}

export function ImportData({ onImport }: ImportDataProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  // LinkedIn paste
  const [linkedInText, setLinkedInText] = useState('')

  const canImport = useMemo(() => linkedInText.trim().length >= 40, [linkedInText])

  const handleLinkedInPasteImport = async () => {
    if (!canImport) return

    setIsImporting(true)
    setImportSuccess(false)

    // Small delay for UX (feels responsive, no “fake long wait”)
    await new Promise((r) => setTimeout(r, 400))

    try {
      const parsed = parseLinkedInText(linkedInText)
      onImport(parsed)
      setImportSuccess(true)
      setLinkedInText('')
      setTimeout(() => setImportSuccess(false), 2500)
    } catch (e) {
      console.error(e)
      alert('Could not import. Please paste more of your LinkedIn profile (About + Experience + Education).')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-purple-600" />
          <CardTitle>Import Resume</CardTitle>
        </div>
        <CardDescription>
          Paste your LinkedIn profile content to auto-fill your resume
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="linkedin">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="linkedin" className="flex items-center gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn (Paste)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="linkedin" className="space-y-4 mt-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex gap-3">
              <Info className="h-5 w-5 mt-0.5 text-blue-700" />
              <div>
                <p className="font-semibold">How to import (30 seconds)</p>
                <ol className="list-decimal ml-5 mt-1 space-y-1">
                  <li>Open your LinkedIn profile</li>
                  <li>Copy your <b>About</b>, <b>Experience</b>, <b>Education</b>, and <b>Skills</b></li>
                  <li>Paste below → click <b>Import</b></li>
                </ol>
                <p className="mt-2 text-xs text-blue-700">
                  This does not connect to LinkedIn or require login — you’re importing text you provide.
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2">
                Paste your LinkedIn profile text here:
              </p>
              <Textarea
                value={linkedInText}
                onChange={(e) => setLinkedInText(e.target.value)}
                placeholder={`Example:\n\nName\nHeadline\nLocation\n\nAbout\n...\n\nExperience\nRole\nCompany\nDates\n• Bullet\n\nEducation\n...\n\nSkills\nReact, Node.js, ...`}
                rows={10}
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: The more you paste (especially Experience), the better the import.
              </p>
            </div>

            <Button
              onClick={handleLinkedInPasteImport}
              disabled={isImporting || importSuccess || !canImport}
              className="w-full bg-blue-600 hover:bg-blue-700"
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
                  <Linkedin className="h-4 w-4 mr-2" />
                  Import from LinkedIn (Paste)
                </>
              )}
            </Button>

            {importSuccess && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-green-50 border border-green-200 rounded-lg"
              >
                <p className="text-sm text-green-800">
                  Imported! Please review and adjust dates, locations and bullets.
                </p>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
