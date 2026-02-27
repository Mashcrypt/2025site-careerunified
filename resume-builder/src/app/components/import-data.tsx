import { useMemo, useState } from 'react'
import { Upload, Linkedin, Loader2, CheckCircle2, Info, FileText, X } from 'lucide-react'
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

export function ImportData({ onImport }: ImportDataProps) {
  const [isImporting, setIsImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // LinkedIn paste
  const [linkedInText, setLinkedInText] = useState('')

  // Upload CV
  const [file, setFile] = useState<File | null>(null)

  const canImport = useMemo(() => linkedInText.trim().length >= 40, [linkedInText])

  const resetAlerts = () => {
    setImportSuccess(false)
    setErrorMsg('')
  }

  /* ===============================
     LinkedIn Import (UNCHANGED)
     =============================== */
  const handleLinkedInPasteImport = async () => {
    if (!canImport) return

    setIsImporting(true)
    resetAlerts()

    try {
      await new Promise((r) => setTimeout(r, 400))
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

  /* ===============================
     Upload CV Import (WORKING)
     =============================== */
  const handleUploadImport = async () => {
    if (!file) return

    setIsImporting(true)
    resetAlerts()

    try {
      // Basic client-side guard
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
        const msg =
          payload?.error ||
          payload?.message ||
          `Upload failed (status ${res.status}). Please try again.`
        setErrorMsg(String(msg))
        return
      }

      if (!payload?.text || typeof payload.text !== 'string') {
        setErrorMsg('We could not extract text from that file. Try a different PDF/DOCX (non-scanned).')
        return
      }

      const parsed = parseLinkedInText(payload.text)
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-purple-600" />
          <CardTitle>Import Resume</CardTitle>
        </div>
        <CardDescription>Import from LinkedIn or upload your existing CV</CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="linkedin">
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
              </div>
            </div>

            <Textarea
              value={linkedInText}
              onChange={(e) => setLinkedInText(e.target.value)}
              rows={10}
              placeholder="Paste your LinkedIn profile here…"
            />

            <Button
              onClick={handleLinkedInPasteImport}
              disabled={!canImport || isImporting}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Linkedin className="h-4 w-4 mr-2" />
                  Import from LinkedIn
                </>
              )}
            </Button>
          </TabsContent>

          {/* Upload CV */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              Upload your existing CV (PDF or DOCX). We’ll extract the text and prepare it for AI Tailor.
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

            <Button
              onClick={handleUploadImport}
              disabled={!file || isImporting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Import CV & Use for AI
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        {/* Alerts */}
        {errorMsg && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{errorMsg}</p>
          </div>
        )}

        {importSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg"
          >
            <p className="text-sm text-green-800">
              Resume imported successfully. You can now use AI Tailor.
            </p>
          </motion.div>
        )}
      </CardContent>
    </Card>
  )
}
