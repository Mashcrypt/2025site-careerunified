import type { ResumeData } from '../types/resume';

export type AtsFindingType = 'critical' | 'warning' | 'success';

export type AtsFinding = {
  type: AtsFindingType;
  title: string;
  detail: string;
};

export type AtsScoreBreakdown = {
  label: string;
  score: number;
  max: number;
  note: string;
};

export type AtsAnalysis = {
  score: number;
  rawScore: number;
  rawMax: number;
  breakdown: AtsScoreBreakdown[];
  findings: AtsFinding[];
  hasJobDescription: boolean;
  matchedKeywords: string[];
  missingKeywords: string[];
  keywordCandidates: string[];
  confidence: string;
};

export const ATS_STRONG_SCORE = 75;
export const ATS_TAILOR_TARGET = 78;

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'among',
  'and',
  'any',
  'applicant',
  'applicants',
  'application',
  'applications',
  'apply',
  'are',
  'based',
  'been',
  'being',
  'can',
  'candidate',
  'candidates',
  'company',
  'could',
  'day',
  'department',
  'description',
  'does',
  'duties',
  'employment',
  'essential',
  'etc',
  'for',
  'from',
  'has',
  'have',
  'having',
  'including',
  'into',
  'job',
  'knowledge',
  'minimum',
  'more',
  'must',
  'our',
  'own',
  'per',
  'position',
  'preferred',
  'qualification',
  'qualifications',
  'required',
  'requirement',
  'requirements',
  'responsibilities',
  'responsibility',
  'role',
  'should',
  'successful',
  'such',
  'that',
  'the',
  'their',
  'this',
  'through',
  'will',
  'with',
  'work',
  'years',
  'you',
  'your',
]);

const HARD_SKILL_TERMS = [
  'accounting',
  'administration',
  'agile',
  'audit',
  'aws',
  'azure',
  'bookkeeping',
  'budgeting',
  'business analysis',
  'c#',
  'c++',
  'cad',
  'call centre',
  'case management',
  'cloud',
  'compliance',
  'crm',
  'customer service',
  'data analysis',
  'data capturing',
  'data management',
  'diary management',
  'docker',
  'excel',
  'financial management',
  'financial reporting',
  'firestore',
  'firebase',
  'git',
  'google cloud',
  'human resources',
  'inventory management',
  'java',
  'javascript',
  'kubernetes',
  'machine learning',
  'microsoft office',
  'minute taking',
  'mongodb',
  'monitoring and evaluation',
  'node',
  'office administration',
  'operations management',
  'payroll',
  'policy development',
  'popia',
  'postgresql',
  'power bi',
  'procurement',
  'project management',
  'public administration',
  'python',
  'quality assurance',
  'react',
  'react native',
  'records management',
  'report writing',
  'research',
  'rest api',
  'risk management',
  'sales',
  'salesforce',
  'sap',
  'sql',
  'stakeholder engagement',
  'stock control',
  'supply chain management',
  'tableau',
  'typescript',
];

const SOFT_SKILL_TERMS = [
  'adaptability',
  'analytical thinking',
  'attention to detail',
  'collaboration',
  'communication',
  'conflict resolution',
  'decision making',
  'leadership',
  'negotiation',
  'problem solving',
  'stakeholder management',
  'teamwork',
  'time management',
];

const ACTION_VERBS = [
  'achieved',
  'administered',
  'analysed',
  'analyzed',
  'automated',
  'built',
  'coordinated',
  'created',
  'delivered',
  'developed',
  'implemented',
  'improved',
  'increased',
  'launched',
  'led',
  'managed',
  'monitored',
  'prepared',
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

const ACRONYM_STOP_WORDS = new Set(['CV', 'EE', 'ID', 'N/A', 'SA']);

export function cleanAtsText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeAtsText(value: unknown) {
  return cleanAtsText(value)
    .toLowerCase()
    .replace(/[^\w+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeAtsText(value: unknown) {
  return normalizeAtsText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function countAtsWords(value: unknown) {
  return tokenizeAtsText(value).length;
}

function containsTerm(haystack: string, term: string) {
  return new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(haystack);
}

export function composeAtsResumeText(data: ResumeData) {
  return [
    data.personalInfo.fullName,
    data.personalInfo.email,
    data.personalInfo.phone,
    data.personalInfo.location,
    data.personalInfo.linkedin,
    data.personalInfo.website,
    data.personalInfo.driversLicense,
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

export function extractAtsKeywordCandidates(jobDescription: string) {
  const normalizedJob = normalizeAtsText(jobDescription);
  if (!normalizedJob) return [];

  const knownTerms = [...HARD_SKILL_TERMS, ...SOFT_SKILL_TERMS].filter((term) =>
    containsTerm(normalizedJob, normalizeAtsText(term)),
  );

  const acronyms = Array.from(
    new Set(
      (jobDescription.match(/\b[A-Z][A-Z0-9.+#-]{1,9}\b/g) || [])
        .filter((term) => !ACRONYM_STOP_WORDS.has(term))
        .map((term) => normalizeAtsText(term))
        .filter((term) => term.length > 1 && !STOP_WORDS.has(term)),
    ),
  );

  const normalizedTokens = normalizedJob.split(' ').filter(Boolean);
  const tokenCounts = new Map<string, number>();
  const phraseCounts = new Map<string, number>();

  normalizedTokens.forEach((token) => {
    if (token.length > 3 && !STOP_WORDS.has(token)) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  });

  for (let index = 0; index < normalizedTokens.length - 1; index += 1) {
    const first = normalizedTokens[index];
    const second = normalizedTokens[index + 1];
    if (
      first.length > 2 &&
      second.length > 2 &&
      !STOP_WORDS.has(first) &&
      !STOP_WORDS.has(second)
    ) {
      const phrase = `${first} ${second}`;
      phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
    }
  }

  const repeatedPhrases = Array.from(phraseCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .slice(0, 5);

  const repeatedTerms = Array.from(tokenCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .slice(0, 8);

  const fallbackTerms = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term)
    .filter((term) => !knownTerms.some((known) => normalizeAtsText(known).includes(term)))
    .slice(0, 8);

  const prioritized = [...knownTerms, ...acronyms, ...repeatedPhrases, ...repeatedTerms];
  if (prioritized.length < 8) prioritized.push(...fallbackTerms);

  return Array.from(new Set(prioritized.map((term) => normalizeAtsText(term)).filter(Boolean))).slice(0, 18);
}

function percentage(score: number, max: number) {
  return Math.round((score / max) * 100);
}

export function analyzeResumeForAts(data: ResumeData, jobDescription: string): AtsAnalysis {
  const resumeText = composeAtsResumeText(data);
  const normalizedResume = normalizeAtsText(resumeText);
  const normalizedJob = normalizeAtsText(jobDescription);
  const hasJobDescription = normalizedJob.length >= 80;
  const findings: AtsFinding[] = [];
  const breakdown: AtsScoreBreakdown[] = [];

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanAtsText(data.personalInfo.email));
  const phoneOk = cleanAtsText(data.personalInfo.phone).replace(/\D/g, '').length >= 9;
  const summaryWords = countAtsWords(data.personalInfo.summary);
  const totalWords = countAtsWords(resumeText);
  const skillCount = data.skills.filter(Boolean).length;
  const experienceCount = data.experience.length;
  const educationCount = data.education.length;
  const projectCount = data.projects?.length || 0;
  const certificationCount = data.certifications?.length || 0;
  const experienceText = data.experience.map((item) => item.description).join(' ');
  const metricMatches =
    experienceText.match(/\b(\d+%|\d+\+?|r\d+|zar|kpi|revenue|cost|budget|users|clients|sales|reduced|increased)\b/gi) || [];
  const actionVerbMatches = ACTION_VERBS.filter((verb) => containsTerm(normalizedResume, verb));
  const weakPhraseMatches = WEAK_PHRASES.filter((phrase) => normalizedResume.includes(normalizeAtsText(phrase)));
  const duplicateSkills = data.skills
    .map((skill) => normalizeAtsText(skill))
    .filter(Boolean)
    .filter((skill, index, list) => list.indexOf(skill) !== index);

  let profileScore = 0;
  if (cleanAtsText(data.personalInfo.fullName)) profileScore += 3;
  if (emailOk) profileScore += 3;
  if (phoneOk) profileScore += 3;
  if (cleanAtsText(data.personalInfo.location)) profileScore += 2;
  if (cleanAtsText(data.personalInfo.linkedin) || cleanAtsText(data.personalInfo.website)) profileScore += 2;
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
  if (data.experience.every((item) => cleanAtsText(item.position) && cleanAtsText(item.company))) structureScore += 3;
  if (data.experience.some((item) => cleanAtsText(item.startDate) || cleanAtsText(item.endDate))) structureScore += 2;
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
  if (data.experience.some((item) => countAtsWords(item.description) >= 45)) impactScore += 4;
  if (data.experience.filter((item) => countAtsWords(item.description) >= 25).length >= 2) impactScore += 3;
  if (weakPhraseMatches.length === 0) impactScore += 2;

  breakdown.push({
    label: 'Evidence and impact',
    score: impactScore,
    max: 22,
    note: 'Measurable achievements, action verbs, and strong bullet content.',
  });

  const keywordCandidates = extractAtsKeywordCandidates(jobDescription);
  const matchedKeywords = hasJobDescription
    ? keywordCandidates.filter((term) => containsTerm(normalizedResume, normalizeAtsText(term)))
    : [];
  const missingKeywords = hasJobDescription
    ? keywordCandidates.filter((term) => !containsTerm(normalizedResume, normalizeAtsText(term)))
    : [];
  const matchRatio = keywordCandidates.length ? matchedKeywords.length / keywordCandidates.length : 0;
  let jobMatchScore = hasJobDescription ? Math.round(matchRatio * 27) : 7;
  const currentRoleTokens = tokenizeAtsText(data.experience[0]?.position);
  const roleMatchCount = currentRoleTokens.filter((token) => containsTerm(normalizedJob, token)).length;
  if (hasJobDescription && currentRoleTokens.length && roleMatchCount >= Math.min(2, currentRoleTokens.length)) {
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

  const rawScore = Math.round(breakdown.reduce((total, item) => total + item.score, 0));
  const rawMax = breakdown.reduce((total, item) => total + item.max, 0);
  let score = percentage(rawScore, rawMax);
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
  if (skillCount < 8 || skillCount > 16) {
    findings.push({
      type: 'warning',
      title: 'Use a focused searchable skills section',
      detail: 'Keep 8-16 relevant skills. Use exact tools, systems, methods, and industry terms from the job advert.',
    });
  }
  if (metricMatches.length < 2 && experienceCount > 0) {
    findings.push({
      type: 'warning',
      title: 'Add measurable achievements where you know the facts',
      detail: 'Include truthful numbers such as %, rand value, volume, turnaround time, users, clients, or targets achieved.',
    });
  }
  if (weakPhraseMatches.length > 0) {
    findings.push({
      type: 'warning',
      title: 'Replace generic phrases',
      detail: `Rewrite phrases like "${weakPhraseMatches.slice(0, 2).join('" and "')}" into specific evidence.`,
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
      detail: `Consider adding the strongest truthful matches: ${missingKeywords.slice(0, 8).join(', ')}.`,
    });
  }
  if (score >= ATS_STRONG_SCORE && findings.every((finding) => finding.type !== 'critical')) {
    findings.push({
      type: 'success',
      title: 'Strong foundation',
      detail: 'This CV has enough structure and evidence to be a good base. Tailor it to each job before sending.',
    });
  }

  return {
    score,
    rawScore,
    rawMax,
    breakdown,
    findings: findings.slice(0, 7),
    hasJobDescription,
    matchedKeywords,
    missingKeywords,
    keywordCandidates,
    confidence: hasJobDescription ? 'Role-specific scan' : 'Profile-only scan',
  };
}

export function buildAtsFeedbackForTailor(analysis: AtsAnalysis, targetScore = ATS_TAILOR_TARGET) {
  const weakestBreakdown = [...analysis.breakdown]
    .sort((a, b) => a.score / a.max - b.score / b.max)
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.score}/${item.max} - ${item.note}`);

  const findings = analysis.findings
    .filter((finding) => finding.type !== 'success')
    .map((finding) => `${finding.title}: ${finding.detail}`);

  return [
    `Current normalized ATS score: ${analysis.score}/100 (${analysis.rawScore}/${analysis.rawMax} rubric points; ${analysis.confidence}).`,
    `One-pass target: at least ${targetScore}/100, while keeping every claim truthful.`,
    analysis.keywordCandidates.length
      ? `Full job keyword set assessed by Analytics: ${analysis.keywordCandidates.join(', ')}.`
      : 'No reliable job keyword set was detected.',
    analysis.missingKeywords.length
      ? `Missing job keywords to add naturally only where the existing facts support them: ${analysis.missingKeywords.join(', ')}.`
      : 'No major missing keywords detected.',
    analysis.matchedKeywords.length
      ? `Already matched keywords to preserve: ${analysis.matchedKeywords.join(', ')}.`
      : 'Few strong keyword matches were detected.',
    weakestBreakdown.length ? `Score breakdown, weakest first: ${weakestBreakdown.join(' | ')}.` : '',
    findings.length ? `Priority ATS feedback: ${findings.join(' | ')}.` : '',
    'Complete the optimization in this single pass: write a targeted 35-95 word summary, keep 8-16 relevant skills, strengthen every supported experience bullet with clear action and evidence, remove weak phrases, and cover all truthful job terms.',
    'Do not invent numbers, tools, employers, qualifications, duties, or achievements. If a missing keyword is unsupported, leave it out and identify that factual limitation in the suggestions.',
  ]
    .filter(Boolean)
    .join('\n');
}
