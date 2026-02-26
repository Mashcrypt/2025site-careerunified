import { useMemo, useState } from 'react'
import { Upload, Linkedin, Loader2, CheckCircle2, Info, FileText } from 'lucide-react'
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
  // ⬅️ YOUR EXISTING PARSER — UNCHANGED
  // (kept exactly as-is for safety)
  const data = emptyResume()
  const text = raw.replace(/\r/g, '').replace(/[•·▪]/g, '•').trim()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const findEmail = (s: string) => s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
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

export function ImportData({ onImport }: ImportDataProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  // LinkedIn paste
  const [linkedInText, setLinkedInText] = useState('')

  // Upload CV
  const [file, setFile] = useState<File | null>(null)

  const canImport = useMemo(() => linkedInText.trim().length >= 40, [linkedInText])

  /* ===============================
     LinkedIn Import (UNCHANGED)
     =============================== */
  const handleLinkedInPasteImport = async () => {
    if (!canImport) return
    setIsImporting(true)
    setImportSuccess(false)

    try {
      await new Promise(r => setTimeout(r, 400))
      const parsed = parseLinkedInText(linkedInText)
      onImport(parsed)
      setImportSuccess(true)
      setLinkedInText('')
      setTimeout(() => setImportSuccess(false), 2500)
    } finally {
      setIsImporting(false)
    }
  }

  /* ===============================
     Upload CV Import (NEW)
     =============================== */
  const handleUploadImport = async () => {
    if (!file) return

    setIsImporting(true)
    setImportSuccess(false)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/.netlify/functions/extract-resume-text', {
        method: 'POST',
        body: formData,
      })

      const payload = await res.json()
      if (!res.ok || !payload?.text) {
        throw new Error('Could not read CV text')
      }

      // ✅ Reuse SAME parser
      const parsed = parseLinkedInText(payload.text)
      onImport(parsed)

      setImportSuccess(true)
      setFile(null)
      setTimeout(() => setImportSuccess(false), 2500)
    } catch (e) {
      alert('Failed to import CV. Please upload a PDF or DOCX.')
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
          Import from LinkedIn or upload your existing CV
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="linkedin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="linkedin">
              <Linkedin className="h-4 w-4 mr-2" />
              LinkedIn (Paste)
            </TabsTrigger>
            <TabsTrigger value="upload">
              <FileText className="h-4 w-4 mr-2" />
              Upload CV
            </TabsTrigger>
          </TabsList>

          {/* LinkedIn Paste */}
          <TabsContent value="linkedin" className="space-y-4 mt-4">
            <Textarea
              value={linkedInText}
              onChange={(e) => setLinkedInText(e.target.value)}
              rows={10}
              placeholder="Paste your LinkedIn profile here…"
            />

            <Button
              onClick={handleLinkedInPasteImport}
              disabled={!canImport || isImporting}
              className="w-full"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Linkedin className="h-4 w-4 mr-2" />}
              Import from LinkedIn
            </Button>
          </TabsContent>

          {/* Upload CV */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Upload your existing CV (PDF or DOCX).  
              We’ll extract the text and prepare it for AI Tailor.
            </div>

            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <Button
              onClick={handleUploadImport}
              disabled={!file || isImporting}
              className="w-full"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Import CV & Use for AI
            </Button>
          </TabsContent>
        </Tabs>

        {importSuccess && (
          <motion.div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              Resume imported successfully. You can now use AI Tailor.
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}
