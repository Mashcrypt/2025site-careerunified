import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import type { ResumeData } from '../types/resume';

interface AITailorProps {
  data: ResumeData;
  onApplySuggestions: (data: ResumeData) => void;
}

export function AITailor({ data, onApplySuggestions }: AITailorProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tailoredData, setTailoredData] = useState<ResumeData | null>(null);

  const analyzeAndTailor = async () => {
    if (!jobDescription.trim()) return;

    setIsAnalyzing(true);
    setSuggestions([]);
    setTailoredData(null);

    // Simulate AI API call - Replace this with your actual API integration
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock AI suggestions
    const mockSuggestions = [
      'Added relevant keywords from job description to summary',
      'Reordered skills to prioritize job requirements',
      'Enhanced experience descriptions with achievement metrics',
      'Highlighted transferable skills matching the role',
      'Optimized formatting for ATS compatibility',
    ];

    // Mock tailored resume data with modified summary and experience
    const mockTailoredData: ResumeData = {
      ...data,
      personalInfo: {
        ...data.personalInfo,
        summary: data.personalInfo.summary
          ? `${data.personalInfo.summary} [AI-Enhanced: Tailored to emphasize skills and experience most relevant to the target position, incorporating key terminology from the job description.]`
          : 'Professional with demonstrated expertise in areas directly aligned with this role. [AI-Generated Summary]',
      },
      experience: data.experience.map((exp) => ({
        ...exp,
        description: exp.description
          ? `${exp.description}\n• [AI-Added] Quantified impact and achievements relevant to job requirements`
          : '• [AI-Generated] Key responsibilities and achievements',
      })),
    };

    setSuggestions(mockSuggestions);
    setTailoredData(mockTailoredData);
    setIsAnalyzing(false);
  };

  const applyTailoredVersion = () => {
    if (tailoredData) {
      onApplySuggestions(tailoredData);
    }
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50/50 to-sky-50/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <CardTitle>AI Resume Tailor</CardTitle>
        </div>
        <CardDescription>
          Paste the job description below and let AI optimize your resume to match the requirements
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
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This is a prototype with mock AI responses. Connect your own
                AI API (OpenAI, Claude, etc.) to enable real resume tailoring. The API integration
                point is in the <code className="bg-amber-100 px-1 rounded">analyzeAndTailor</code>{' '}
                function.
              </p>
            </div>
          </div>
        )}

        {!suggestions.length && !isAnalyzing && (
          <div className="bg-white rounded-lg p-6 border border-dashed border-blue-200 text-center">
            <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-3" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}