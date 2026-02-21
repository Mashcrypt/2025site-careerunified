import { useMemo, useState } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Copy,
  Trash2
} from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from './ui/card';
import type { ResumeData } from '../types/resume';

interface AITailorProps {
  data: ResumeData;
  onApplySuggestions: (data: ResumeData) => void;
}

type TailorMode = 'tailor' | 'cover_letter';

type TailorResponse = {
  suggestions: string[];
  tailoredData: ResumeData;
};

type CoverLetterResponse = {
  coverLetter: string;
  talkingPoints: string[];
};

export function AITailor({ data, onApplySuggestions }: AITailorProps) {
  const [mode, setMode] = useState<TailorMode>('tailor');

  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Tailor results
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tailoredData, setTailoredData] = useState<ResumeData | null>(null);

  // Cover letter results
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const headerText = useMemo(() => {
    if (mode === 'cover_letter') return 'AI Cover Letter Generator';
    return 'AI Resume Tailor';
  }, [mode]);

  const descriptionText = useMemo(() => {
    if (mode === 'cover_letter') {
      return 'Paste the job description and generate a professional cover letter aligned to your resume.';
    }
    return 'Paste the job description below and let AI optimize your resume to match the requirements.';
  }, [mode]);

  const resetResults = () => {
    setSuggestions([]);
    setTailoredData(null);
    setCoverLetter('');
    setTalkingPoints([]);
    setErrorMsg('');
    setCopied(false);
  };

  const analyze = async () => {
    if (!jobDescription.trim()) return;

    setIsAnalyzing(true);
    resetResults();

    try {
      const res = await fetch('/.netlify/functions/ai-tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          resumeData: data,
          jobDescription
        })
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const details =
          payload?.error || payload?.details || 'AI request failed. Please try again.';
        setErrorMsg(String(details));
        return;
      }

      if (mode === 'cover_letter') {
        const typed = payload as CoverLetterResponse;

        if (!typed?.coverLetter || !Array.isArray(typed?.talkingPoints)) {
          setErrorMsg('AI returned an unexpected response format (cover letter).');
          return;
        }

        setCoverLetter(typed.coverLetter);
        setTalkingPoints(typed.talkingPoints);
        return;
      }

      const typed = payload as TailorResponse;

      if (!typed?.tailoredData || !Array.isArray(typed?.suggestions)) {
        setErrorMsg('AI returned an unexpected response format (tailor).');
        return;
      }

      setSuggestions(typed.suggestions);
      setTailoredData(typed.tailoredData);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyTailoredVersion = () => {
    if (tailoredData) onApplySuggestions(tailoredData);
  };

  const copyCoverLetter = async () => {
    try {
      await navigator.clipboard.writeText(coverLetter || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: do nothing (browser permissions)
      setCopied(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-sky-50/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {mode === 'cover_letter' ? (
              <Mail className="h-5 w-5 text-blue-600" />
            ) : (
              <Sparkles className="h-5 w-5 text-blue-600" />
            )}
            <CardTitle>{headerText}</CardTitle>
          </div>

          {/* Mode Toggle */}
          <div className="inline-flex rounded-lg border border-blue-200 bg-white p-1">
            <button
              type="button"
              onClick={() => {
                setMode('tailor');
                resetResults();
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                mode === 'tailor'
                  ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              Tailor Resume
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('cover_letter');
                resetResults();
              }}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                mode === 'cover_letter'
                  ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              Cover Letter
            </button>
          </div>
        </div>

        <CardDescription>{descriptionText}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="jobDescription">Job Description</Label>
          <Textarea
            id="jobDescription"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the job description here. Include required skills, qualifications, and responsibilities..."
            rows={8}
            className="bg-white"
          />
        </div>

        <Button
          onClick={analyze}
          disabled={!jobDescription.trim() || isAnalyzing}
          className="w-full bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === 'cover_letter' ? 'Generating Cover Letter...' : 'Analyzing & Tailoring...'}
            </>
          ) : (
            <>
              {mode === 'cover_letter' ? (
                <Mail className="h-4 w-4 mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {mode === 'cover_letter' ? 'Generate Cover Letter' : 'Tailor Resume with AI'}
            </>
          )}
        </Button>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  {mode === 'cover_letter' ? 'Cover Letter Error' : 'AI Tailor Error'}
                </p>
                <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
                <p className="text-xs text-red-600 mt-2">
                  Tip: If this only happens on Netlify, make sure <b>GEMINI_API_KEY</b> is set in
                  Netlify environment variables and you triggered a redeploy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tailor results */}
        {mode === 'tailor' && suggestions.length > 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                AI Suggestions Applied
              </h3>
              <ul className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h3 className="font-medium text-gray-900 mb-2">Preview Changes</h3>
              <p className="text-sm text-gray-600 mb-3">
                The AI has optimized your resume. Review the changes in the preview pane.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={applyTailoredVersion}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700"
                >
                  Apply Tailored Version
                </Button>
                <Button variant="outline" onClick={resetResults}>
                  Discard
                </Button>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-800">
                <strong>Powered by Gemini</strong> (server-side via Netlify Function). Your API key is safe.
              </p>
            </div>
          </div>
        )}

        {/* Cover letter results */}
        {mode === 'cover_letter' && coverLetter && !errorMsg && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Cover Letter Generated
              </h3>

              {talkingPoints.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">Key talking points</p>
                  <ul className="space-y-2">
                    {talkingPoints.map((tp, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>{tp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-900 mb-2">Cover letter text</p>
                <Textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  rows={12}
                  className="bg-white"
                />
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={copyCoverLetter}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    {copied ? 'Copied!' : 'Copy Cover Letter'}
                  </Button>
                  <Button variant="outline" onClick={resetResults}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Discard
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-800">
                <strong>Powered by Gemini</strong> (server-side via Netlify Function). Your API key is safe.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        !suggestions.length && !coverLetter && !isAnalyzing && !errorMsg && (
          <div className="bg-white rounded-lg p-6 border border-dashed border-blue-200 text-center">
            <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              Choose <b>Tailor Resume</b> or <b>Cover Letter</b>, paste a job description, then run AI.
            </p>
          </div>
        )
      </CardContent>
    </Card>
  );
}
