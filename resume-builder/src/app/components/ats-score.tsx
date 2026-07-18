import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import type { ResumeData } from '../types/resume';
import { motion } from 'motion/react';
import { trackAnalyticsEvent } from '../utils/analytics';
import {
  analyzeResumeForAts,
  buildAtsFeedbackForTailor,
  countAtsWords,
} from '../utils/ats-analysis';

interface ATSScoreProps {
  data: ResumeData;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  onOpenAITailor: (atsFeedback: string) => void;
}

function percentage(score: number, max: number) {
  return Math.round((score / max) * 100);
}

export function ATSScore({ data, jobDescription, onJobDescriptionChange, onOpenAITailor }: ATSScoreProps) {
  const analysis = useMemo(() => analyzeResumeForAts(data, jobDescription), [data, jobDescription]);
  const atsFeedbackForTailor = useMemo(() => buildAtsFeedbackForTailor(analysis), [analysis]);
  const [score, setScore] = useState(analysis.score);
  const lastTrackedJobDescriptionRef = useRef('');

  useEffect(() => {
    const normalizedJobDescription = jobDescription.trim().replace(/\s+/g, ' ');
    if (!normalizedJobDescription || normalizedJobDescription === lastTrackedJobDescriptionRef.current) return;

    const timer = window.setTimeout(() => {
      trackAnalyticsEvent('ats_analysis_run', {
        job_description_words: countAtsWords(jobDescription),
        ats_score: analysis.score,
        score_band: analysis.score >= 75 ? 'strong' : analysis.score >= 55 ? 'needs_tailoring' : 'high_risk',
        matched_keyword_count: analysis.matchedKeywords.length,
        missing_keyword_count: analysis.missingKeywords.length,
      });
      lastTrackedJobDescriptionRef.current = normalizedJobDescription;
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [analysis.matchedKeywords.length, analysis.missingKeywords.length, analysis.score, jobDescription]);

  useEffect(() => {
    const timer = setInterval(() => {
      setScore((prev) => {
        if (prev < analysis.score) return Math.min(prev + 2, analysis.score);
        if (prev > analysis.score) return Math.max(prev - 2, analysis.score);
        return prev;
      });
    }, 20);

    return () => clearInterval(timer);
  }, [analysis.score]);

  const scoreColor = score >= 75 ? 'text-emerald-600' : score >= 55 ? 'text-amber-600' : 'text-red-600';
  const scoreLabel = score >= 75 ? 'Strong' : score >= 55 ? 'Needs tailoring' : 'High risk';
  const badgeClass =
    score >= 75
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : score >= 55
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-red-100 text-red-800 border-red-200';

  return (
    <Card className="border border-blue-100 bg-white">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Honest ATS Score</CardTitle>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                This scan estimates ATS readiness and recruiter clarity. It is guidance, not a guarantee that any employer system will rank your CV.
              </p>
            </div>
          </div>
          <Badge className={badgeClass}>{scoreLabel}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-blue-700" />
              <h4 className="text-sm font-semibold text-slate-900">Job requirements</h4>
            </div>
            <Badge variant="outline" className="bg-white">
              {analysis.confidence}
            </Badge>
          </div>
          <Textarea
            value={jobDescription}
            onChange={(event) => onJobDescriptionChange(event.target.value)}
            rows={7}
            className="bg-white"
            placeholder="Paste the job advert or requirements here to check real keyword match, missing skills, and role alignment..."
          />
          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{jobDescription.trim() ? `${countAtsWords(jobDescription)} useful words detected` : 'No job post pasted yet'}</span>
            {jobDescription ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onJobDescriptionChange('')}>
                Clear job post
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
          <div className="text-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 180 }}
              className="relative inline-block"
            >
              <svg className="h-36 w-36 -rotate-90">
                <circle cx="72" cy="72" r="61" stroke="currentColor" strokeWidth="10" fill="none" className="text-slate-200" />
                <motion.circle
                  cx="72"
                  cy="72"
                  r="61"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  className={scoreColor}
                  initial={{ strokeDasharray: '0 383' }}
                  animate={{ strokeDasharray: `${(score / 100) * 383} 383` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div>
                  <div className={`text-4xl font-semibold ${scoreColor}`}>{score}</div>
                  <div className="text-xs text-slate-500">/ 100</div>
                </div>
              </div>
            </motion.div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Target 75+ after pasting the actual job advert.</p>
          </div>

          <div className="space-y-3">
            {analysis.breakdown.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-semibold text-slate-900">{item.label}</h5>
                    <p className="text-xs text-slate-500">{item.note}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">
                    {item.score}/{item.max}
                  </span>
                </div>
                <Progress value={percentage(item.score, item.max)} className="h-2" />
              </div>
            ))}
          </div>
        </div>

        {analysis.hasJobDescription ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                Matched keywords
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.matchedKeywords.length ? (
                  analysis.matchedKeywords.map((term) => (
                    <span key={term} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-800">
                      {term}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-emerald-900">No strong job keywords found in the CV yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900">
                <XCircle className="h-4 w-4" />
                Missing keywords
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.missingKeywords.length ? (
                  analysis.missingKeywords.map((term) => (
                    <span key={term} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-red-800">
                      {term}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-red-900">No major missing keywords detected from this job post.</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-700" />
            <h4 className="text-sm font-semibold text-slate-900">Priority feedback</h4>
          </div>
          <div className="space-y-2">
            {analysis.findings.map((finding, index) => {
              const Icon =
                finding.type === 'critical' ? XCircle : finding.type === 'warning' ? AlertTriangle : CheckCircle2;
              const color =
                finding.type === 'critical'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : finding.type === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800';

              return (
                <motion.div
                  key={`${finding.title}-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${color}`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <h5 className="text-sm font-semibold">{finding.title}</h5>
                    <p className="mt-1 text-xs leading-5">{finding.detail}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <Gauge className="mb-2 h-5 w-5 text-blue-700" />
            <h5 className="text-sm font-semibold text-slate-900">Be realistic</h5>
            <p className="mt-1 text-xs leading-5 text-slate-600">A score is a diagnostic, not a promise. Different ATS tools parse documents differently.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <ShieldCheck className="mb-2 h-5 w-5 text-blue-700" />
            <h5 className="text-sm font-semibold text-slate-900">Keep it truthful</h5>
            <p className="mt-1 text-xs leading-5 text-slate-600">Add only keywords you can defend in an interview. Forced keyword stuffing hurts trust.</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <ClipboardCheck className="mb-2 h-5 w-5 text-blue-700" />
            <h5 className="text-sm font-semibold text-slate-900">Next best step</h5>
            <p className="mt-1 text-xs leading-5 text-slate-700">Use AI Tailor to naturally align your summary, skills, and bullets to this job post.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Convert the feedback into edits</h4>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                AI Tailor can use the job post to rewrite your CV sections while keeping the claims honest.
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => {
              trackAnalyticsEvent('ats_feedback_to_tailor', {
                ats_score: analysis.score,
                score_band: analysis.score >= 75 ? 'strong' : analysis.score >= 55 ? 'needs_tailoring' : 'high_risk',
                matched_keyword_count: analysis.matchedKeywords.length,
                missing_keyword_count: analysis.missingKeywords.length,
              });
              onOpenAITailor(atsFeedbackForTailor);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Open AI Tailor
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
