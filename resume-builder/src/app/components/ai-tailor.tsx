import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import type { ResumeData } from '../types/resume';

interface AITailorProps {
  data: ResumeData;
  onApplySuggestions: (data: ResumeData) => void;
}

type TailorResponse = {
  suggestions: string[];
  tailoredData: ResumeData;
};

export function AITailor({ data, onApplySuggestions }: AITailorProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tailoredData, setTailoredData] = useState<ResumeData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const analyzeAndTailor = async () => {
    if (!jobDescription.trim()) return;

    setIsAnalyzing(true);
    setSuggestions([]);
    setTailoredData(null);
    setErrorMsg('');

    try {
      const res = await fetch('/.netlify/functions/ai-tailor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeData: data,
          jobDescription,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const details =
          payload?.error || payload?.details || 'AI request failed. Please try again.';
        setErrorMsg(String(details));
        setIsAnalyzing(false);
        return;
      }

      const typed = payload as TailorResponse;

      if (!typed?.tailoredData || !Array.isArray(typed?.suggestions)) {
        setErrorMsg('AI returned an unexpected response format.');
        setIsAnalyzing(false);
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

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-sky-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <CardTitle>AI Resume Tailor</CardTitle>
        </div>
        <CardDescription>
          Paste the job description below and let AI optimize your resume to match the requirements.
        </CardDescription>
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
          onClick={analyzeAndTailor}
          disabled={!jobDescription.trim() || isAnalyzing}
          className="w-full bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing & Tailoring...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Tailor Resume with AI
            </>
          )}
        </Button>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">AI Tailor Error</p>
                <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
                <p className="text-xs text-red-600 mt-2">
                  Tip: If this only happens on Netlify, make sure <b>GEMINI_API_KEY</b> is set in
                  Netlify environment variables.
                </p>
              </div>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setSuggestions([]);
                    setTailoredData(null);
                    setErrorMsg('');
                  }}
                >
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

        {!suggestions.length && !isAnalyzing && !errorMsg && (
          <div className="bg-white rounded-lg p-6 border border-dashed border-blue-200 text-center">
            <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
