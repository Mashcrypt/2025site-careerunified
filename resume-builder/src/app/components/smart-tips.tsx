import { useState, useEffect } from 'react';
import {
  Award,
  BadgeCheck,
  Building2,
  CalendarDays,
  Contact,
  FileCheck2,
  Landmark,
  SearchCheck,
  ShieldCheck,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import type { ResumeData } from '../types/resume';
import { motion, AnimatePresence } from 'motion/react';

interface SmartTipsProps {
  data: ResumeData;
  jobDescription?: string;
}

type TipContext = {
  hasJobDescription: boolean;
  isGovernmentRole: boolean;
  isPublicServiceRole: boolean;
  requiresDriversLicense: boolean;
  requiresProfessionalRegistration: boolean;
  mentionsForeignQualifications: boolean;
};

type SmartTip = {
  icon: typeof Award;
  title: string;
  description: string;
  condition: (data: ResumeData, context: TipContext) => boolean;
};

const GENERIC_CLAIMS_PATTERN = /\b(hardworking|motivated|passionate|team player|results[- ]oriented|good communicator|fast learner)\b/i;
const OUTCOME_PATTERN = /\b(increased|reduced|improved|saved|delivered|resolved|processed|supported|managed|trained|served|completed|achieved)\b/i;
const PROFESSIONAL_BODY_PATTERN = /\b(ECSA|SACE|HPCSA|SACPCMP|SAICA|SAIPA|SANC|PSIRA|professional registration|registered with)\b/i;

function words(value: string | undefined) {
  return (value || '').trim().split(/\s+/).filter(Boolean).length;
}

function resumeSearchText(data: ResumeData) {
  return [
    data.personalInfo.summary,
    data.personalInfo.driversLicense,
    ...data.skills,
    ...(data.certifications || []),
    ...data.experience.flatMap((experience) => [experience.position, experience.company, experience.description]),
    ...(data.additionalSections || []).flatMap((section) => [section.title, ...section.items]),
  ].join(' ');
}

function getTipContext(jobDescription: string): TipContext {
  const description = jobDescription.trim();
  const governmentSignals = [
    /\b(z83|dpsa|public service)\b/i,
    /\b(national|provincial)\s+(government|department|administration)\b/i,
    /\b(department of|municipality|municipal)\b/i,
    /\b(salary level|centre\s*:|enquiries\s*:|ref(?:erence)?\s*(?:no\.?|number)\s*:)/i,
  ].filter((pattern) => pattern.test(description)).length;

  return {
    hasJobDescription: Boolean(description),
    isGovernmentRole: governmentSignals >= 2 || /\b(z83|dpsa|public service)\b/i.test(description),
    isPublicServiceRole: /\b(z83|dpsa|public service)\b/i.test(description),
    requiresDriversLicense: /\b(driver'?s?\s+licen[cs]e|valid\s+(?:code\s+)?(?:b|8|10|14)\s+licen[cs]e)\b/i.test(description),
    requiresProfessionalRegistration: /\b(professional registration|registered with|ECSA|SACE|HPCSA|SACPCMP|SAICA|SAIPA|SANC|PSIRA)\b/i.test(description),
    mentionsForeignQualifications: /\b(foreign qualification|SAQA evaluation|evaluated by SAQA)\b/i.test(description),
  };
}

const tipsDatabase: SmartTip[] = [
  {
    icon: FileCheck2,
    title: 'Government: Treat the advert as a checklist',
    description: 'Use the exact post title, reference number, submission channel, file format and closing time stated in the advert. A strong CV can still be excluded when one application instruction is missed.',
    condition: (_data, context) => context.isGovernmentRole,
  },
  {
    icon: Landmark,
    title: 'Public Service: Complete one Z83 per post',
    description: 'Use the current Z83, complete every required field, initial and sign where instructed, and attach the detailed CV requested for that specific reference number. Do not reuse one Z83 for several posts.',
    condition: (_data, context) => context.isPublicServiceRole,
  },
  {
    icon: CalendarDays,
    title: 'Government: Make your experience verifiable',
    description: 'For every role, give the employer, exact job title, month-and-year dates and relevant duties. Selection panels need enough detail to verify that you meet the required years and level of experience.',
    condition: (data, context) =>
      context.isGovernmentRole &&
      (data.experience.length === 0 || data.experience.some((experience) =>
        !experience.position || !experience.company || !experience.startDate || (!experience.current && !experience.endDate) || words(experience.description) < 30
      )),
  },
  {
    icon: ShieldCheck,
    title: 'Government: Send only what the advert requests',
    description: 'Many Public Service adverts request a Z83 and detailed CV first, with certified documents only from shortlisted candidates. Requirements differ, so follow the advert rather than adding or omitting documents by habit.',
    condition: (_data, context) => context.isGovernmentRole,
  },
  {
    icon: Landmark,
    title: 'Applying to government?',
    description: 'Read the advert\'s NOTE section before submitting. Confirm whether it needs a current Z83, the exact reference number, a detailed CV, a specific email subject and separate applications for separate posts.',
    condition: (_data, context) => !context.hasJobDescription,
  },
  {
    icon: Building2,
    title: 'Company roles: Win the first-page scan',
    description: 'The opening section should quickly show the target occupation, relevant years of experience, strongest role-specific skills and one credible result. Do not make the recruiter assemble your fit from several pages.',
    condition: (_data, context) => !context.isGovernmentRole,
  },
  {
    icon: SearchCheck,
    title: 'Match requirements with evidence',
    description: 'For each minimum requirement you genuinely meet, show where you gained it: a qualification, role, project, duty or result. Copying keywords without evidence will not survive screening or an interview.',
    condition: (_data, context) => context.hasJobDescription,
  },
  {
    icon: BadgeCheck,
    title: 'State a required licence exactly',
    description: 'The advert asks for a driver\'s licence. Add the correct code, such as Code B, Code 10 or Code 14, only if you currently hold it. Do not imply that a learner\'s licence meets a full-licence requirement.',
    condition: (data, context) => {
      const licence = data.personalInfo.driversLicense?.trim() || '';
      return context.requiresDriversLicense && (!licence || /learner/i.test(licence));
    },
  },
  {
    icon: BadgeCheck,
    title: 'Show professional registration clearly',
    description: 'If registration is mandatory, name the professional body and your current registration status in certifications or a dedicated section. Include only accurate, current details that the employer can verify.',
    condition: (data, context) =>
      context.requiresProfessionalRegistration && !PROFESSIONAL_BODY_PATTERN.test(resumeSearchText(data)),
  },
  {
    icon: FileCheck2,
    title: 'Foreign qualification? Check the SAQA instruction',
    description: 'If the advert requires a SAQA evaluation, state the South African equivalence only when it has been formally evaluated and keep the evidence ready for the stage specified by the employer.',
    condition: (_data, context) => context.mentionsForeignQualifications,
  },
  {
    icon: Award,
    title: 'Use truthful scale, not invented percentages',
    description: 'If you do not know a percentage, use evidence you can defend: team size, customers served, cases processed, turnaround time, budget range, sites supported or work completed before deadline.',
    condition: (data) =>
      data.experience.some((experience) =>
        !/\d/.test(experience.description) && !OUTCOME_PATTERN.test(experience.description)
      ),
  },
  {
    icon: Target,
    title: 'Separate duties from proof of impact',
    description: 'A duty explains what you were responsible for; an achievement shows what changed because of your work. Include both, especially for the requirements that matter most in the target role.',
    condition: (data) => data.experience.some((experience) => words(experience.description) >= 15),
  },
  {
    icon: CalendarDays,
    title: 'Make every employment date reconcile',
    description: 'Use one date format throughout and mark current roles consistently. Correct month-and-year dates help employers calculate experience and prevent avoidable questions about overlaps or unexplained gaps.',
    condition: (data) => data.experience.some((experience) =>
      !experience.startDate || (!experience.current && !experience.endDate)
    ),
  },
  {
    icon: TrendingUp,
    title: 'Prove the important skills in your history',
    description: 'A skills list helps with screening, but the strongest skills should also appear naturally in experience or projects. Show how and where you used them instead of listing every tool you have seen.',
    condition: (data) => data.skills.length > 0 && data.experience.length > 0,
  },
  {
    icon: Target,
    title: 'Replace traits with evidence',
    description: 'Words such as "hardworking" or "team player" are weak without proof. Replace them with a short example of ownership, service, accuracy, collaboration or delivery under real conditions.',
    condition: (data) => GENERIC_CLAIMS_PATTERN.test(data.personalInfo.summary || ''),
  },
  {
    icon: Contact,
    title: 'Use contact details you monitor daily',
    description: 'Use a professional email address and a reachable phone number with voicemail or WhatsApp checked regularly. Government departments and companies may move quickly when arranging assessments or interviews.',
    condition: (data) => !(data.personalInfo.email || '').trim() || !(data.personalInfo.phone || '').trim(),
  },
  {
    icon: Award,
    title: 'Early career: Build evidence beyond job titles',
    description: 'Use relevant projects, practical coursework, volunteering, internships or community responsibilities. Describe the task, tools, people served and result instead of presenting them as filler.',
    condition: (data) => data.experience.length === 0 || data.experience.every((experience) => words(experience.description) < 15),
  },
  {
    icon: Target,
    title: 'Make the summary specific to the role',
    description: 'Name your occupation or target field, relevant experience level, strongest evidence and the value you can bring. Avoid an objective that only says you are looking for an opportunity to grow.',
    condition: (data) => !data.personalInfo.summary || words(data.personalInfo.summary) < 25,
  },
  {
    icon: FileCheck2,
    title: 'Check the downloaded PDF before submitting',
    description: 'Open the final file on a phone and a computer. Confirm that names, dates, bullets, contact links and page breaks are readable, and use a clear filename that identifies you and the role or reference.',
    condition: () => true,
  },
  {
    icon: ShieldCheck,
    title: 'Keep every application record consistent',
    description: 'Your CV, application form, profile and qualification records should agree on job titles and dates. Honest corrections are fine; unexplained differences can delay screening or verification.',
    condition: () => true,
  },
];

export function SmartTips({ data, jobDescription = '' }: SmartTipsProps) {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [relevantTips, setRelevantTips] = useState<typeof tipsDatabase>([]);

  useEffect(() => {
    const context = getTipContext(jobDescription);
    const applicable = tipsDatabase.filter((tip) => tip.condition(data, context));
    setRelevantTips(applicable.slice(0, 8));
    setCurrentTipIndex(0);
    setIsDismissed(false);
  }, [data, jobDescription]);

  useEffect(() => {
    if (relevantTips.length === 0) return;

    const interval = setInterval(() => {
      setCurrentTipIndex((prev) => (prev + 1) % relevantTips.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [relevantTips]);

  if (isDismissed || relevantTips.length === 0) {
    return null;
  }

  const currentTip = relevantTips[currentTipIndex];
  const TipIcon = currentTip.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentTipIndex}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="bg-amber-500 p-2 rounded-lg flex-shrink-0">
                <TipIcon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-medium text-amber-900 text-sm">{currentTip.title}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsDismissed(true)}
                    className="h-6 w-6 p-0 hover:bg-amber-100 flex-shrink-0"
                  >
                    <X className="h-4 w-4 text-amber-700" />
                  </Button>
                </div>
                <p className="text-sm text-amber-800">{currentTip.description}</p>
              </div>
            </div>

            {/* Progress dots */}
            {relevantTips.length > 1 && (
              <div className="flex items-center justify-center gap-1 mt-3">
                {relevantTips.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentTipIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentTipIndex
                        ? 'w-6 bg-amber-600'
                        : 'w-1.5 bg-amber-300 hover:bg-amber-400'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
