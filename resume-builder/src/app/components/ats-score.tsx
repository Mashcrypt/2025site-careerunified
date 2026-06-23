import { useEffect, useMemo, useState } from 'react';
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

interface ATSScoreProps {
  data: ResumeData;
}

type FindingType = 'critical' | 'warning' | 'success';

type Finding = {
  type: FindingType;
  title: string;
  detail: string;
};

type ScoreBreakdown = {
  label: string;
  score: number;
  max: number;
  note: string;
};

const ATS_JOB_STORAGE_KEY = 'careerUnifiedATSJobDescriptionV1';

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'among',
  'and',
  'any',
  'are',
  'based',
  'been',
  'being',
  'can',
  'candidate',
  'company',
  'could',
  'day',
  'does',
  'for',
  'from',
  'has',
  'have',
  'having',
  'into',
  'job',
  'more',
  'must',
  'our',
  'own',
  'per',
  'role',
  'should',
  'such',
  'that',
  'the',
  'their',
  'this',
  'through',
  'will',
  'with',
  'work',
  'you',
  'your',
]);

const HARD_SKILL_TERMS = [
  'accounting',
  'administration',
  'agile',
  'audit',
  'bookkeeping',
  'budgeting',
  'business analysis',
  'c#',
  'c++',
  'cad',
  'call centre',
  'cloud',
  'compliance',
  'crm',
  'customer service',
  'data analysis',
  'data capturing',
  'docker',
  'excel',
  'financial reporting',
  'firestore',
  'firebase',
  'git',
  'java',
  'javascript',
  'machine learning',
  'microsoft office',
  'node',
  'payroll',
  'power bi',
  'project management',
  'python',
  'react',
  'report writing',
  'sales',
  'salesforce',
  'sap',
  'sql',
  'stock control',
  'tableau',
  'typescript',
];

const SOFT_SKILL_TERMS = [
  'adaptability',
  'attention to detail',
  'collaboration',
  'communication',
  'leadership',
  'problem solving',
  'stakeholder management',
  'teamwork',
  'time management',
];

const ACTION_VERBS = [
  'achieved',
  'automated',
  'built',
  'coordinated',
  'created',
  'delivered',
  'developed',
  'improved',
  'increased',
  'launched',
  'led',
  'managed',
  'reduced',
  'resolved',
  'streamlined',
  'supported',
];

const WEAK_PHRASES = [
  'hard worker',
  'team player',
  'responsible for',
  'duties included',
  'worked on',
  'helped with',
  'go getter',
  'fast learner',
];

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\w+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: unknown) {
  return normalize(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function countWords(value: unknown) {
  return tokenize(value).length;
}

function containsTerm(haystack: string, term: string) {
  return new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(haystack);
}

function composeResumeText(data: ResumeData) {
  return [
    data.personalInfo.fullName,
    data.personalInfo.email,
    data.personalInfo.phone,
    data.personalInfo.location,
    data.personalInfo.linkedin,
    data.personalInfo.website,
    data.personalInfo.summary,
    data.skills.join(' '),
    ...data.experience.flatMap((item) => [
      item.position,
      item.company,
      item.location,
      item.startDate,
      item.endDate,
      item.description,
    ]),
    ...data.education.flatMap((item) => [item.degree, item.institution, item.location, item.graduationDate]),
    ...(data.projects || []).flatMap((item) => [item.name, item.description, item.technologies.join(' ')]),
    ...(data.certifications || []),
    ...(data.additionalSections || []).flatMap((section) => [section.title, ...section.items]),
  ]
    .filter(Boolean)
    .join(' ');
}

function extractKeywordCandidates(jobDescription: string) {
  const normalizedJob = normalize(jobDescription);
  if (!normalizedJob) return [];

  const jobHardSkills = HARD_SKILL_TERMS.filter((term) => containsTerm(normalizedJob, normalize(term)));
  const jobSoftSkills = SOFT_SKILL_TERMS.filter((term) => containsTerm(normalizedJob, normalize(term)));
  const counts = new Map<string, number>();
  const tokens = tokenize(jobDescription).filter((token) => token.length > 3);

  tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const phrase = `${tokens[index]} ${tokens[index + 1]}`;
    if (phrase.length <= 28) counts.set(phrase, (counts.get(phrase) || 0) + 1.5);
  }

  const frequentTerms = Array.from(counts.entries())
    .filter(([term]) => !jobHardSkills.includes(term) && !jobSoftSkills.includes(term))
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .filter((term) => !/^(apply|submit|requirements|experience|years|skills|duties|responsibilities)$/.test(term))
    .slice(0, 12);

  return Array.from(new Set([...jobHardSkills, ...jobSoftSkills, ...frequentTerms])).slice(0, 22);
}

function percentage(score: number, max: number) {
  return Math.round((score / max) * 100);
}

function scoreResume(data: ResumeData, jobDescription: string) {
  const resumeText = composeResumeText(data);
  const normalizedResume = normalize(resumeText);
  const normalizedJob = normalize(jobDescription);
  const hasJobDescription = normalizedJob.length >= 80;
  const findings: Finding[] = [];
  const breakdown: ScoreBreakdown[] = [];

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(data.personalInfo.email));
  const phoneOk = clean(data.personalInfo.phone).replace(/\D/g, '').length >= 9;
  const summaryWords = countWords(data.personalInfo.summary);
  const totalWords = countWords(resumeText);
  const skillCount = data.skills.filter(Boolean).length;
  const experienceCount = data.experience.length;
  const educationCount = data.education.length;
  const projectCount = data.projects?.length || 0;
  const certificationCount = data.certifications?.length || 0;
  const experienceText = data.experience.map((item) => item.description).join(' ');
  const metricMatches = experienceText.match(/\b(\d+%|\d+\+?|r\d+|zar|kpi|revenue|cost|budget|users|clients|sales|reduced|increased)\b/gi) || [];
  const actionVerbMatches = ACTION_VERBS.filter((verb) => containsTerm(normalizedResume, verb));
  const weakPhraseMatches = WEAK_PHRASES.filter((phrase) => normalizedResume.includes(normalize(phrase)));
  const duplicateSkills = data.skills
    .map((skill) => normalize(skill))
    .filter(Boolean)
    .filter((skill, index, list) => list.indexOf(skill) !== index);

  let profileScore = 0;
  if (clean(data.personalInfo.fullName)) profileScore += 3;
  if (emailOk) profileScore += 3;
  if (phoneOk) profileScore += 3;
  if (clean(data.personalInfo.location)) profileScore += 2;
  if (clean(data.personalInfo.linkedin) || clean(data.personalInfo.website)) profileScore += 2;
  if (summaryWords >= 35 && summaryWords <= 95) profileScore += 4;
  else if (summaryWords >= 15) profileScore += 2;
  if (skillCount >= 8 && skillCount <= 16) profileScore += 4;
  else if (skillCount >= 5) profileScore += 2;

  breakdown.push({
    label: 'Profile basics',
    score: profileScore,
    max: 21,
    note: 'Contact details, summary, and skills completeness.',
  });

  let structureScore = 0;
  if (experienceCount >= 1) structureScore += 5;
  if (educationCount >= 1) structureScore += 4;
  if (data.experience.every((item) => clean(item.position) && clean(item.company))) structureScore += 3;
  if (data.experience.some((item) => clean(item.startDate) || clean(item.endDate))) structureScore += 2;
  if (projectCount || certificationCount) structureScore += 3;
  if (totalWords >= 320 && totalWords <= 850) structureScore += 3;
  else if (totalWords >= 220) structureScore += 1;

  breakdown.push({
    label: 'ATS readability',
    score: structureScore,
    max: 20,
    note: 'Standard sections and enough parsable text for scanners.',
  });

  let impactScore = 0;
  if (metricMatches.length >= 5) impactScore += 8;
  else if (metricMatches.length >= 2) impactScore += 5;
  else if (metricMatches.length >= 1) impactScore += 2;
  if (actionVerbMatches.length >= 6) impactScore += 5;
  else if (actionVerbMatches.length >= 3) impactScore += 3;
  if (data.experience.some((item) => countWords(item.description) >= 45)) impactScore += 4;
  if (data.experience.filter((item) => countWords(item.description) >= 25).length >= 2) impactScore += 3;
  if (weakPhraseMatches.length === 0) impactScore += 2;

  breakdown.push({
    label: 'Evidence and impact',
    score: impactScore,
    max: 22,
    note: 'Measurable achievements, action verbs, and strong bullet content.',
  });

  const keywordCandidates = extractKeywordCandidates(jobDescription);
  const matchedKeywords = hasJobDescription
    ? keywordCandidates.filter((term) => containsTerm(normalizedResume, normalize(term)))
    : [];
  const missingKeywords = hasJobDescription
    ? keywordCandidates.filter((term) => !containsTerm(normalizedResume, normalize(term))).slice(0, 10)
    : [];
  const matchRatio = keywordCandidates.length ? matchedKeywords.length / keywordCandidates.length : 0;
  let jobMatchScore = hasJobDescription ? Math.round(matchRatio * 27) : 7;
  if (hasJobDescription && clean(data.experience[0]?.position) && normalizedJob.includes(normalize(data.experience[0].position))) {
    jobMatchScore += 3;
  }

  breakdown.push({
    label: 'Job match',
    score: Math.min(jobMatchScore, 30),
    max: 30,
    note: hasJobDescription
      ? 'Keyword and role alignment against the pasted job post.'
      : 'Paste a job description for an honest match score.',
  });

  let score = Math.round(breakdown.reduce((total, item) => total + item.score, 0));
  if (!hasJobDescription && score > 72) score = 72;
  score = Math.max(0, Math.min(100, score));

  if (!hasJobDescription) {
    findings.push({
      type: 'critical',
      title: 'Paste the job requirements for a real ATS match',
      detail: 'Without a job post, this can only score your CV structure. It cannot know the keywords the employer is likely to search for.',
    });
  }
  if (!emailOk || !phoneOk) {
    findings.push({
      type: 'critical',
      title: 'Fix contact details before applying',
      detail: 'ATS and recruiters need a valid email and phone number in the body of the CV.',
    });
  }
  if (!data.personalInfo.summary || summaryWords < 35) {
    findings.push({
      type: 'warning',
      title: 'Make the summary more targeted',
      detail: 'Use 3-4 lines that mention your role, years or level, core tools, and the value you bring.',
    });
  }
  if (skillCount < 8) {
    findings.push({
      type: 'warning',
      title: 'Add more searchable skills',
      detail: 'Aim for 8-16 relevant skills. Use exact tools, systems, methods, and industry terms from the job advert.',
    });
  }
  if (metricMatches.length < 2 && experienceCount > 0) {
    findings.push({
      type: 'warning',
      title: 'Add measurable achievements',
      detail: 'Include numbers such as %, rand value, volume, turnaround time, users, clients, or targets achieved.',
    });
  }
  if (weakPhraseMatches.length > 0) {
    findings.push({
      type: 'warning',
      title: 'Replace generic phrases',
      detail: `Rewrite phrases like "${weakPhraseMatches.slice(0, 2).join('" and "')}" into specific outcomes.`,
    });
  }
  if (duplicateSkills.length > 0) {
    findings.push({
      type: 'warning',
      title: 'Remove repeated skills',
      detail: 'Repeated skills look like keyword stuffing. Keep each skill once and prove it inside your experience bullets.',
    });
  }
  if (hasJobDescription && missingKeywords.length > 0) {
    findings.push({
      type: 'critical',
      title: 'Important job keywords are missing',
      detail: `Consider adding the strongest truthful matches: ${missingKeywords.slice(0, 6).join(', ')}.`,
    });
  }
  if (score >= 75 && findings.every((finding) => finding.type !== 'critical')) {
    findings.push({
      type: 'success',
      title: 'Strong foundation',
      detail: 'This CV has enough structure and evidence to be a good base. Tailor it to each job before sending.',
    });
  }

  return {
    score,
    breakdown,
    findings: findings.slice(0, 7),
    hasJobDescription,
    matchedKeywords: matchedKeywords.slice(0, 10),
    missingKeywords,
    keywordCandidates,
    confidence: hasJobDescription ? 'Role-specific scan' : 'Profile-only scan',
  };
}

function getInitialJobDescription() {
  if (typeof window === 'undefined') return '';

  try {
    const saved = window.localStorage.getItem(ATS_JOB_STORAGE_KEY);
    if (saved) return saved;

    const importedJob = window.sessionStorage.getItem('careerUnifiedAITailorJob');
    if (!importedJob) return '';

    const payload = JSON.parse(importedJob) as { fullText?: unknown };
    return typeof payload.fullText === 'string' ? payload.fullText : '';
  } catch {
    return '';
  }
}

export function ATSScore({ data }: ATSScoreProps) {
  const [jobDescription, setJobDescription] = useState(() => getInitialJobDescription());
  const analysis = useMemo(() => scoreResume(data, jobDescription), [data, jobDescription]);
  const [score, setScore] = useState(analysis.score);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ATS_JOB_STORAGE_KEY, jobDescription);
  }, [jobDescription]);

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
            onChange={(event) => setJobDescription(event.target.value)}
            rows={7}
            className="bg-white"
            placeholder="Paste the job advert or requirements here to check real keyword match, missing skills, and role alignment..."
          />
          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>{jobDescription.trim() ? `${countWords(jobDescription)} useful words detected` : 'No job post pasted yet'}</span>
            {jobDescription ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setJobDescription('')}>
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
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <a href="/cv-generator/?tab=ai">Open AI Tailor</a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
