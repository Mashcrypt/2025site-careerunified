import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc as firestoreDoc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getBlob, ref as storageObjectRef } from 'firebase/storage';
import {
  FileText,
  Wand2,
  Eye,
  Download,
  Palette,
  BarChart3,
  FolderOpen,
  Upload,
  Lock,
  CreditCard,
  CheckCircle2,
  Crown,
  Gift,
  Layers,
  Layout,
  Signature,
  Sparkles,
  X,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { ScrollArea } from './components/ui/scroll-area';
import { Badge } from './components/ui/badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';

import { ResumeBuilder } from './components/resume-builder';
import { AITailor } from './components/ai-tailor';
import { ATSScore } from './components/ats-score';
import {
  RESUME_VERSIONS_STORAGE_KEY,
  ResumeVersions,
  sanitizeResumeVersionData,
} from './components/resume-versions';
import { ThemeCustomizer } from './components/theme-customizer';
import { SmartTips } from './components/smart-tips';
import { ImportData, parseResumeText } from './components/import-data';

import { ModernTemplate } from './components/templates/modern-template';
import { ProfessionalTemplate } from './components/templates/professional-template';
import { CreativeTemplate } from './components/templates/creative-template';
import { MinimalistTemplate } from './components/templates/minimalist-template';

import { ATSProTemplate } from './components/templates/ats-pro-template';
import { ExecutiveTemplate } from './components/templates/executive-template';
import { TechStackTemplate } from './components/templates/tech-stack-template';

// NEW AI templates
import { LawBriefTemplate } from './components/templates/law-brief-template';
import { CommerceAnalystTemplate } from './components/templates/commerce-analyst-template';
import { EngineeringBlueprintTemplate } from './components/templates/engineering-blueprint-template';

import type { ResumeData, TemplateType } from './types/resume';
import { motion } from 'motion/react';
import { southAfricanSampleData } from './utils/sample-data';

import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from './utils/firebaseClient';

const initialData: ResumeData = southAfricanSampleData;
const Z83_PREFILL_STORAGE_KEY = 'careerUnifiedZ83PrefillV1';

type PremiumTemplateId =
  | 'ats-pro'
  | 'executive'
  | 'tech-stack'
  | 'law-brief'
  | 'commerce-analyst'
  | 'engineering-blueprint';

type AnyTemplateId = TemplateType | PremiumTemplateId;

type PlanId = 'starter' | 'job_seeker' | 'career_pro';
type AppTab = 'build' | 'templates' | 'ai' | 'analytics' | 'import' | 'versions';

type BillingStatus = {
  plan: 'free' | 'starter' | 'job_seeker' | 'career_pro';
  subscriptionStatus: 'active' | 'past_due' | 'cancelled' | 'inactive' | string;
  used: number;
  limit: number | null;
  freeResumeUsed: boolean;
  freeCoverUsed: boolean;
  freeResumeTailorsUsed?: number;
  freeCoverLettersUsed?: number;
  freeResumeLimit?: number;
  freeCoverLetterLimit?: number;
  aiTailorCredits?: number;
  pendingPlan?: string | null;
  pendingPayfastPaymentId?: string | null;
  pendingCreditPack?: string | null;
  pendingCreditPayfastPaymentId?: string | null;
};

type BillingHistoryRecord = {
  id: string;
  date: string | null;
  plan: string;
  amount: string;
  status: string;
  paymentId: string;
  itemName: string;
  product: string;
};

type ProfileCvReference = {
  cvURL: string;
  cvFileName: string;
  cvFilePath?: string;
};

const FREE_TASTE_LIMIT = 3;

function billingPlanLimit(plan: string) {
  if (plan === 'starter') return 15;
  if (plan === 'job_seeker') return 40;
  if (plan === 'career_pro') return null;
  return 0;
}

function billingTimestampToDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function billingFreeUsageCount(user: Record<string, any>, countField: string, legacyField: string) {
  const count = Number(user[countField] || 0);
  if (Number.isFinite(count) && count > 0) return count;
  return Boolean(user[legacyField]) ? 1 : 0;
}

function billingStatusFromUserDoc(user: Record<string, any>): BillingStatus {
  const storedPlan = (user.plan as BillingStatus['plan']) || 'free';
  const storedStatus = (user.subscriptionStatus as string) || (storedPlan === 'free' ? 'inactive' : 'active');
  const periodEnd = billingTimestampToDate(user.subscriptionCurrentPeriodEnd);
  const isExpiredPaidPlan =
    storedPlan !== 'free' &&
    storedStatus === 'active' &&
    (!periodEnd || periodEnd.getTime() <= Date.now());
  const plan = isExpiredPaidPlan ? 'free' : storedPlan;
  const subscriptionStatus = isExpiredPaidPlan ? 'past_due' : storedStatus;
  const freeResumeTailorsUsed = billingFreeUsageCount(user, 'freeResumeTailorsUsed', 'freeResumeUsed');
  const freeCoverLettersUsed = billingFreeUsageCount(user, 'freeCoverLettersUsed', 'freeCoverUsed');

  return {
    plan,
    subscriptionStatus,
    used: Number(user.applicationsUsedThisMonth || 0),
    limit: billingPlanLimit(plan),
    freeResumeUsed: freeResumeTailorsUsed >= FREE_TASTE_LIMIT,
    freeCoverUsed: freeCoverLettersUsed >= FREE_TASTE_LIMIT,
    freeResumeTailorsUsed,
    freeCoverLettersUsed,
    freeResumeLimit: FREE_TASTE_LIMIT,
    freeCoverLetterLimit: FREE_TASTE_LIMIT,
    aiTailorCredits: Math.max(0, Number(user.aiTailorCredits || 0)),
    pendingPlan: (user.pendingPlan as string) || null,
    pendingPayfastPaymentId: (user.pendingPayfastPaymentId as string) || null,
    pendingCreditPack: (user.pendingCreditPack as string) || null,
    pendingCreditPayfastPaymentId: (user.pendingCreditPayfastPaymentId as string) || null,
  };
}

type ResumeVersionStored = {
  id: string;
  name: string;
  data: ResumeData;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
};

const PLAN_OPTIONS: Array<{
  id: PlanId;
  name: string;
  price: string;
  benefits: string[];
  badge?: string;
  featured?: boolean;
}> = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'R28,99/month',
    benefits: ['15 AI tailors/month', 'Cover letters', 'Premium templates'],
  },
  {
    id: 'job_seeker',
    name: 'Job Hunter',
    price: 'R49/month',
    benefits: ['40 AI tailors/month', 'Cover letters', 'Saved CV versions', 'Enough for a full month of job hunting'],
    badge: 'Most popular',
    featured: true,
  },
  {
    id: 'career_pro',
    name: 'Career Pro',
    price: 'R99/month',
    benefits: ['Unlimited AI tailors', 'All templates', 'Multiple CV versions', 'Priority new features'],
  },
];

const TEMPLATE_CANVAS_WIDTH = 816;
const PROFILE_CV_VERSION_ID = 'profile-cv-import';

const MONTH_LOOKUP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

function cleanTextValue(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function splitCvFullName(fullName: string) {
  const parts = cleanTextValue(fullName).split(/\s+/).filter(Boolean);
  const initials = parts
    .map((part) => part.replace(/[^a-z0-9]/gi, '').charAt(0))
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 8);

  if (parts.length <= 1) {
    return { initials, surname: '', fullNames: parts[0] || '' };
  }

  const surname = parts[parts.length - 1];
  return {
    initials,
    surname,
    fullNames: parts.slice(0, -1).join(' '),
  };
}

function extractYear(value: unknown) {
  return cleanTextValue(value).match(/\b(19|20)\d{2}\b/)?.[0] || '';
}

function toZ83MonthYear(value: unknown) {
  const text = cleanTextValue(value);
  if (!text || /present|current/i.test(text)) return '';

  const numeric = text.match(/\b(0?[1-9]|1[0-2])[\s/.-]+((?:19|20)\d{2})\b/);
  if (numeric) return `${numeric[1].padStart(2, '0')}/${numeric[2]}`;

  const monthName = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  )?.[1]?.toLowerCase();
  const year = extractYear(text);

  if (monthName && year) return `${MONTH_LOOKUP[monthName.slice(0, 3)] || MONTH_LOOKUP[monthName]}/${year}`;
  return '';
}

function hasRealCvDetails(data: ResumeData) {
  const personal = data.personalInfo || {};
  const sample = southAfricanSampleData.personalInfo;
  const fullName = cleanTextValue(personal.fullName);
  const email = cleanTextValue(personal.email);
  const phone = cleanTextValue(personal.phone);

  const stillLooksLikeSample =
    fullName === sample.fullName &&
    email === sample.email &&
    phone === sample.phone;

  if (stillLooksLikeSample) return false;

  return Boolean(
    fullName ||
      email ||
      phone ||
      cleanTextValue(personal.location) ||
      data.education?.length ||
      data.experience?.length
  );
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractFileNameFromCvUrl(cvURL: string) {
  try {
    const url = new URL(cvURL);
    const storageObject = url.pathname.split('/o/')[1];
    const decodedPath = decodeURIComponent((storageObject || url.pathname.split('/').pop() || '').split('?')[0]);
    return decodedPath.split('/').pop() || '';
  } catch {
    return '';
  }
}

function buildProfileCvReference(data: Record<string, any> | undefined): ProfileCvReference | null {
  const cvURL = cleanTextValue(data?.cvURL || data?.cvUrl);
  if (!cvURL) return null;

  const cvFileName =
    cleanTextValue(data?.cvFileName) ||
    extractFileNameFromCvUrl(cvURL) ||
    'Profile CV';

  return {
    cvURL,
    cvFileName,
    cvFilePath: cleanTextValue(data?.cvFilePath) || undefined,
  };
}

async function getLatestProfileCvReference(user: User): Promise<ProfileCvReference | null> {
  const db = getFirebaseDb();

  try {
    const orderedSnapshot = await getDocs(
      query(collection(db, 'cvs'), where('userId', '==', user.uid), orderBy('uploadedAt', 'desc'), limit(1))
    );
    const latest = orderedSnapshot.docs[0]?.data();
    const fromCvs = buildProfileCvReference(latest);
    if (fromCvs) return fromCvs;
  } catch {
    try {
      const unorderedSnapshot = await getDocs(query(collection(db, 'cvs'), where('userId', '==', user.uid), limit(10)));
      const candidates = unorderedSnapshot.docs
        .map((docSnap) => buildProfileCvReference(docSnap.data()))
        .filter(Boolean) as ProfileCvReference[];
      if (candidates[0]) return candidates[0];
    } catch {
      // Older accounts may only have users/{uid}.cvUrl, so continue to that fallback.
    }
  }

  const userSnapshot = await getDoc(firestoreDoc(db, 'users', user.uid));
  if (!userSnapshot.exists()) return null;

  return buildProfileCvReference(userSnapshot.data());
}

function inferResumeMimeType(fileName: string, fallback = '') {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  if (/\.pdf$/i.test(fileName)) return 'application/pdf';
  if (/\.docx$/i.test(fileName)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return fallback;
}

function isSupportedResumeImportFile(fileName: string, mimeType: string) {
  return (
    mimeType === 'application/pdf' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.pdf$|\.docx$/i.test(fileName)
  );
}

async function downloadProfileCvBlob(profileCv: ProfileCvReference) {
  let lastError: unknown = null;

  try {
    const response = await fetch(profileCv.cvURL);
    if (response.ok) return response.blob();
    lastError = new Error(`Profile CV download failed (${response.status}).`);
  } catch (error) {
    lastError = error;
  }

  if (profileCv.cvFilePath) {
    return getBlob(storageObjectRef(getFirebaseStorage(), profileCv.cvFilePath));
  }

  throw lastError instanceof Error ? lastError : new Error('Could not download the profile CV.');
}

async function extractProfileCvText(profileCv: ProfileCvReference, token?: string) {
  const blob = await downloadProfileCvBlob(profileCv);
  const mimeType = inferResumeMimeType(profileCv.cvFileName, blob.type);

  if (!isSupportedResumeImportFile(profileCv.cvFileName, mimeType)) {
    const error = new Error('Profile CV import supports PDF or DOCX files. Upload a PDF or DOCX CV to your profile to auto-fill the builder.');
    (error as Error & { code?: string }).code = 'unsupported_file';
    throw error;
  }

  const formData = new FormData();
  formData.append('file', new File([blob], profileCv.cvFileName, { type: mimeType }));

  const response = await fetch('/.netlify/functions/extract-resume-text', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Could not read the saved profile CV.');
  }

  if (!payload?.text || typeof payload.text !== 'string') {
    throw new Error('Could not extract readable text from the saved profile CV.');
  }

  return payload.text;
}

function getProfileCvVersionName(fileName: string) {
  const cleaned = cleanTextValue(fileName)
    .replace(/\.(pdf|docx?)$/i, '')
    .replace(/[_-]+/g, ' ')
    .slice(0, 64);

  return cleaned ? `Profile CV: ${cleaned}` : 'Profile CV import';
}

function saveProfileCvImportVersion(data: ResumeData, fileName: string) {
  if (typeof window === 'undefined') return false;

  try {
    const now = new Date().toISOString();
    const raw = window.localStorage.getItem(RESUME_VERSIONS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ResumeVersionStored[]) : [];
    const versions = Array.isArray(parsed)
      ? parsed.map((version) => ({
          ...version,
          data: sanitizeResumeVersionData(version.data),
        }))
      : [];
    const existing = versions.find((version) => version?.id === PROFILE_CV_VERSION_ID);
    const withoutProfileImport = versions.filter((version) => version?.id !== PROFILE_CV_VERSION_ID);

    const profileVersion: ResumeVersionStored = {
      id: PROFILE_CV_VERSION_ID,
      name: getProfileCvVersionName(fileName),
      data: sanitizeResumeVersionData(data),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      isFavorite: existing?.isFavorite ?? true,
    };

    window.localStorage.setItem(
      RESUME_VERSIONS_STORAGE_KEY,
      JSON.stringify([profileVersion, ...withoutProfileImport])
    );

    return true;
  } catch {
    return false;
  }
}

function AdditionalSectionsPreview({
  data,
  includeCertifications,
}: {
  data: ResumeData;
  includeCertifications: boolean;
}) {
  const importedSections = (data.additionalSections || []).filter(
    (section) => section.title.trim() && section.items.some((item) => item.trim())
  );
  const sections = [
    ...(includeCertifications && data.certifications?.length
      ? [{ id: 'certifications', title: 'Certifications and Licences', items: data.certifications }]
      : []),
    ...importedSections,
  ];
  if (!sections.length) return null;

  return (
    <div className="bg-white px-12 pb-12 pt-2 text-gray-900">
      {sections.map((section) => (
        <section key={section.id} className="mb-6 break-inside-avoid last:mb-0">
          <h2 className="mb-2 border-b border-gray-300 pb-1 text-base font-semibold uppercase">
            {section.title}
          </h2>
          <ul className="space-y-1 text-sm leading-relaxed">
            {section.items.filter(Boolean).map((item, index) => (
              <li key={`${section.id}-${index}`} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function buildZ83PrefillFromResume(data: ResumeData) {
  const personal = data.personalInfo || {};
  const name = splitCvFullName(personal.fullName);
  const email = cleanTextValue(personal.email);
  const phone = cleanTextValue(personal.phone);

  return {
    initials: name.initials,
    surname: name.surname,
    fullNames: name.fullNames,
    email,
    phone,
    address: cleanTextValue(personal.location),
    contactMethod: email ? 'Email' : phone ? 'Telephone' : '',
    education: (data.education || [])
      .slice(0, 4)
      .map((item) => ({
        institution: cleanTextValue(item.institution),
        qualification: cleanTextValue(item.degree),
        year: extractYear(item.graduationDate),
      }))
      .filter((item) => item.institution || item.qualification || item.year),
    work: (data.experience || [])
      .slice(0, 3)
      .map((item) => ({
        employer: cleanTextValue(item.company),
        post: cleanTextValue(item.position),
        from: toZ83MonthYear(item.startDate),
        to: item.current ? '' : toZ83MonthYear(item.endDate),
        reason: '',
      }))
      .filter((item) => item.employer || item.post || item.from || item.to),
  };
}

function TemplatePreviewFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateScale = () => {
      const width = frame.getBoundingClientRect().width || 0;
      if (width > 0) setScale(width / TEMPLATE_CANVAS_WIDTH);
    };

    updateScale();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateScale);
      observer.observe(frame);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return (
    <div ref={frameRef} className="h-full w-full overflow-hidden bg-white">
      <div
        className="origin-top-left pointer-events-none select-none"
        style={{
          width: TEMPLATE_CANVAS_WIDTH,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function formatPlanName(plan?: string | null) {
  if (plan === 'starter') return 'Starter';
  if (plan === 'job_seeker') return 'Job Seeker';
  if (plan === 'career_pro') return 'Career Pro';
  return 'Free';
}

function formatLimit(limit?: number | null) {
  if (limit === null) return 'Unlimited';
  if (typeof limit === 'number') return String(limit);
  return '0';
}

function isFirebaseConfigured() {
  const required = [
    import.meta.env.VITE_FIREBASE_API_KEY,
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    import.meta.env.VITE_FIREBASE_APP_ID,
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  ];
  return required.every((v) => typeof v === 'string' && v.trim().length > 0);
}

function getInitialTabFromUrl(): AppTab {
  if (typeof window === 'undefined') return 'build';

  const tab = new URLSearchParams(window.location.search).get('tab');
  if (
    tab === 'build' ||
    tab === 'templates' ||
    tab === 'ai' ||
    tab === 'analytics' ||
    tab === 'import' ||
    tab === 'versions'
  ) {
    return tab;
  }

  return 'build';
}

export default function App() {

    const [resumeData, setResumeData] = useState<ResumeData>(() => {
     try {
    const raw = localStorage.getItem(RESUME_VERSIONS_STORAGE_KEY)
    if (!raw) return initialData

    const versions = JSON.parse(raw) as Array<{
      id: string
      name: string
      data: ResumeData
      updatedAt: string
      isFavorite: boolean
    }>

    if (!Array.isArray(versions) || versions.length === 0) return initialData

    // Restore most recent auto-import if it exists
    const autoImported = versions
      .filter((v) => v.id?.startsWith('import-'))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]

    if (autoImported?.data?.personalInfo) return autoImported.data

    return initialData
     } catch {
      return initialData
       }
       });
  
  const resumeDataRef = useRef<ResumeData>(initialData);
  const [selectedTemplate, setSelectedTemplate] = useState<AnyTemplateId>('modern');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [activeTab, setActiveTab] = useState<AppTab>(() => getInitialTabFromUrl());
  const [resumeVersionsRefreshKey, setResumeVersionsRefreshKey] = useState(0);
  const [initialAIJobDescription] = useState(() => {
    if (typeof window === 'undefined') return '';

    try {
      const raw = window.sessionStorage.getItem('careerUnifiedAITailorJob');
      if (!raw) return '';

      const payload = JSON.parse(raw) as { fullText?: unknown };
      return typeof payload.fullText === 'string' ? payload.fullText : '';
    } catch {
      return '';
    }
  });

  // ✅ EDIT #1: On mobile, start at 100% immediately (prevents ugly uncentered first render flash)
  const [previewScale, setPreviewScale] = useState(() => {
    if (typeof window === 'undefined') return 0.75;
    return window.matchMedia('(max-width: 1024px)').matches ? 1 : 0.75;
  });

  const [fitScale, setFitScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingError, setBillingError] = useState<string>('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryRecord[]>([]);
  const [isLoadingBillingHistory, setIsLoadingBillingHistory] = useState(false);
  const [billingHistoryError, setBillingHistoryError] = useState('');
  const [showAllBillingHistory, setShowAllBillingHistory] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const hasAIPlan = useMemo(() => {
    return billing?.plan !== 'free' && billing?.subscriptionStatus === 'active';
  }, [billing]);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showManageSubscriptionModal, setShowManageSubscriptionModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const profileCvImportAttemptedRef = useRef(false);

  useEffect(() => {
    resumeDataRef.current = resumeData;
  }, [resumeData]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.mobile-nav') && !target.closest('.mobile-menu')) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1024px)');
    const apply = () => setIsMobile(mql.matches);
    apply();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    } else {
      // @ts-expect-error old safari
      mql.addListener(apply);
      // @ts-expect-error old safari
      return () => mql.removeListener(apply);
    }
  }, []);

  useEffect(() => {
    if (isMobile) setPreviewScale(1);
  }, [isMobile]);

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;

    const compute = () => {
      const rectWidth = el.getBoundingClientRect().width || 0;
      const styles = window.getComputedStyle(el);
      const paddingX = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const usable = Math.max(0, rectWidth - paddingX - 2);
      const nextFit = Math.min(1, usable / TEMPLATE_CANVAS_WIDTH);
      setFitScale(Number.isFinite(nextFit) && nextFit > 0 ? nextFit : 1);
    };

    compute();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => compute());
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [isMobile]);

  const loadProfileCvForUser = useCallback(async (user: User) => {
    if (profileCvImportAttemptedRef.current) return;
    if (hasRealCvDetails(resumeDataRef.current)) return;

    profileCvImportAttemptedRef.current = true;

    try {
      const profileCv = await getLatestProfileCvReference(user);
      if (!profileCv) return;

      const token = await user.getIdToken();
      const text = await extractProfileCvText(profileCv, token);
      const parsed = parseResumeText(text);

      if (!hasRealCvDetails(parsed)) {
        throw new Error('We found your profile CV, but could not extract enough usable details from it.');
      }

      setResumeData(parsed);

      const savedVersion = saveProfileCvImportVersion(parsed, profileCv.cvFileName);
      if (savedVersion) setResumeVersionsRefreshKey((value) => value + 1);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    try {
      const auth = getFirebaseAuth();
      if (auth.currentUser) void loadProfileCvForUser(auth.currentUser);

      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) void loadProfileCvForUser(user);
      });

      return () => unsubscribe();
    } catch {
      return;
    }
  }, [loadProfileCvForUser]);

  const loadBillingStatus = useCallback(async () => {
    setIsLoadingBilling(true);
    setBillingError('');

    try {
      if (!isFirebaseConfigured()) {
        const fallback: BillingStatus = {
          plan: 'free',
          subscriptionStatus: 'inactive',
          used: 0,
          limit: 0,
          freeResumeUsed: false,
          freeCoverUsed: false,
          freeResumeTailorsUsed: 0,
          freeCoverLettersUsed: 0,
          freeResumeLimit: 3,
          freeCoverLetterLimit: 3,
          pendingPlan: null,
          pendingPayfastPaymentId: null,
          pendingCreditPack: null,
          pendingCreditPayfastPaymentId: null,
        };
        setBilling(fallback);
        return fallback;
      }

      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        const fallback: BillingStatus = {
          plan: 'free',
          subscriptionStatus: 'inactive',
          used: 0,
          limit: 0,
          freeResumeUsed: false,
          freeCoverUsed: false,
          freeResumeTailorsUsed: 0,
          freeCoverLettersUsed: 0,
          freeResumeLimit: 3,
          freeCoverLetterLimit: 3,
          pendingPlan: null,
          pendingPayfastPaymentId: null,
          pendingCreditPack: null,
          pendingCreditPayfastPaymentId: null,
        };
        setBilling(fallback);
        return fallback;
      }

      const loadFirestoreFallback = async () => {
        const db = getFirebaseDb();
        const userSnap = await getDoc(firestoreDoc(db, 'users', auth.currentUser!.uid));
        if (!userSnap.exists()) return null;
        const fallback = billingStatusFromUserDoc(userSnap.data() || {});
        setBilling(fallback);
        return fallback;
      };

      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/.netlify/functions/get-billing-status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const fallback = await loadFirestoreFallback().catch(() => null);
        if (fallback) return fallback;
        setBillingError('Could not verify billing status. Please refresh or login again.');
        return null;
      }

      const nextBilling = payload as BillingStatus;
      setBilling(nextBilling);
      return nextBilling;
    } catch (e: any) {
      try {
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
          const db = getFirebaseDb();
          const userSnap = await getDoc(firestoreDoc(db, 'users', auth.currentUser.uid));
          if (userSnap.exists()) {
            const fallback = billingStatusFromUserDoc(userSnap.data() || {});
            setBilling(fallback);
            return fallback;
          }
        }
      } catch {
        // Keep the generic billing error below if both server and Firestore fallback fail.
      }
      setBillingError('Could not verify billing status. Please refresh or login again.');
      return null;
    } finally {
      setIsLoadingBilling(false);
    }
  }, []);

  const loadBillingHistory = useCallback(async () => {
    setIsLoadingBillingHistory(true);
    setBillingHistoryError('');

    try {
      if (!isFirebaseConfigured()) {
        setBillingHistory([]);
        return;
      }

      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        setBillingHistory([]);
        return;
      }

      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/.netlify/functions/get-billing-history', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setBillingHistoryError('Billing history could not be loaded.');
        setBillingHistory([]);
        return;
      }

      setBillingHistory(Array.isArray(payload?.records) ? payload.records : []);
    } catch {
      setBillingHistoryError('Billing history could not be loaded.');
      setBillingHistory([]);
    } finally {
      setIsLoadingBillingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadBillingStatus();

    if (!isFirebaseConfigured()) return;

    try {
      const auth = getFirebaseAuth();
      const unsub = auth.onAuthStateChanged(() => {
        loadBillingStatus();
      });
      return () => unsub();
    } catch {
      return;
    }
  }, [loadBillingStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname || '';
    if (!path.includes('/billing/success')) return;

    const params = new URLSearchParams(window.location.search);
    const isCreditReturn = params.get('product') === 'credits';
    let cancelled = false;
    let timeoutId: number | undefined;
    let attempts = 0;

    const refreshUntilSettled = async () => {
      attempts += 1;
      const nextBilling = await loadBillingStatus();
      if (cancelled || !isCreditReturn) return;

      const stillPending = Boolean(nextBilling?.pendingCreditPayfastPaymentId || nextBilling?.pendingCreditPack);
      if (stillPending && attempts < 16) {
        timeoutId = window.setTimeout(refreshUntilSettled, 3000);
      }
    };

    void refreshUntilSettled();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [loadBillingStatus]);

  useEffect(() => {
    if (!showManageSubscriptionModal) return;
    setShowAllBillingHistory(false);
    void loadBillingHistory();
  }, [loadBillingHistory, showManageSubscriptionModal]);

  const fileSafeName = useMemo(() => {
    const raw = (resumeData?.personalInfo?.fullName || 'CareerUnified-Resume').trim();
    return raw.replace(/[^a-z0-9\-\s_]/gi, '').replace(/\s+/g, '_').slice(0, 60);
  }, [resumeData?.personalInfo?.fullName]);

  const templates: {
    id: AnyTemplateId;
    name: string;
    description: string;
    category: string;
    premium?: boolean;
  }[] = [
    { id: 'modern', name: 'Modern', description: 'Clean and contemporary with bold accents', category: 'Popular' },
    { id: 'professional', name: 'Professional', description: 'Classic two-column layout for corporate roles', category: 'Corporate' },
    { id: 'creative', name: 'Creative', description: 'Bold gradient design for creative industries', category: 'Creative' },
    { id: 'minimalist', name: 'Minimalist', description: 'Simple and elegant typography-focused', category: 'Clean' },

    { id: 'ats-pro', name: 'ATS Pro+ (AI)', description: 'AI-optimized, ATS-safe layout with strong hierarchy', category: 'AI Premium', premium: true },
    { id: 'executive', name: 'Executive (AI)', description: 'Leadership-focused layout for managers and seniors', category: 'AI Premium', premium: true },
    { id: 'tech-stack', name: 'Tech Stack (AI)', description: 'Project + skills layout optimized for tech roles', category: 'AI Premium', premium: true },

    { id: 'law-brief', name: 'Law Brief (AI)', description: 'Court-ready clarity: matters, achievements, admissions', category: 'AI Premium', premium: true },
    { id: 'commerce-analyst', name: 'Commerce Analyst (AI)', description: 'Metrics-first layout for finance, accounting, consulting', category: 'AI Premium', premium: true },
    { id: 'engineering-blueprint', name: 'Engineering Blueprint (AI)', description: 'Projects + tools + impact, built for engineering roles', category: 'AI Premium', premium: true },
  ];

  const renderTemplate = () => {
    const props = { data: resumeData, colorTheme: selectedColor };
    const template = (() => {
      switch (selectedTemplate) {
      case 'modern': return <ModernTemplate {...props} />;
      case 'professional': return <ProfessionalTemplate data={resumeData} />;
      case 'creative': return <CreativeTemplate data={resumeData} />;
      case 'minimalist': return <MinimalistTemplate data={resumeData} />;

      case 'ats-pro': return <ATSProTemplate data={resumeData} colorTheme={selectedColor} />;
      case 'executive': return <ExecutiveTemplate data={resumeData} colorTheme={selectedColor} />;
      case 'tech-stack': return <TechStackTemplate data={resumeData} colorTheme={selectedColor} />;

      case 'law-brief': return <LawBriefTemplate data={resumeData} colorTheme={selectedColor} />;
      case 'commerce-analyst': return <CommerceAnalystTemplate data={resumeData} colorTheme={selectedColor} />;
      case 'engineering-blueprint': return <EngineeringBlueprintTemplate data={resumeData} colorTheme={selectedColor} />;

      default: return <ModernTemplate {...props} />;
      }
    })();

    return (
      <>
        {template}
        <AdditionalSectionsPreview
          data={resumeData}
          includeCertifications={
            selectedTemplate !== 'law-brief' &&
            selectedTemplate !== 'commerce-analyst' &&
            selectedTemplate !== 'engineering-blueprint'
          }
        />
      </>
    );
  };

  const renderTemplateThumbnail = (id: AnyTemplateId) => {
    const isPremium =
      id === 'ats-pro' ||
      id === 'executive' ||
      id === 'tech-stack' ||
      id === 'law-brief' ||
      id === 'commerce-analyst' ||
      id === 'engineering-blueprint';

    if (isPremium && !hasAIPlan) {
      return (
        <div className="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
          <div className="text-center px-4">
            <div className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full bg-white/80 border px-3 py-1 text-xs font-semibold text-slate-700">
              <Lock className="h-3.5 w-3.5" />
              AI Template
            </div>
            <p className="text-xs text-slate-600">Preview available after upgrade</p>
          </div>
        </div>
      );
    }

    const thumb = (() => {
      const props = { data: resumeData, colorTheme: selectedColor };
      switch (id) {
        case 'modern': return <ModernTemplate {...props} />;
        case 'professional': return <ProfessionalTemplate data={resumeData} />;
        case 'creative': return <CreativeTemplate data={resumeData} />;
        case 'minimalist': return <MinimalistTemplate data={resumeData} />;

        case 'ats-pro': return <ATSProTemplate data={resumeData} colorTheme={selectedColor} />;
        case 'executive': return <ExecutiveTemplate data={resumeData} colorTheme={selectedColor} />;
        case 'tech-stack': return <TechStackTemplate data={resumeData} colorTheme={selectedColor} />;

        case 'law-brief': return <LawBriefTemplate data={resumeData} colorTheme={selectedColor} />;
        case 'commerce-analyst': return <CommerceAnalystTemplate data={resumeData} colorTheme={selectedColor} />;
        case 'engineering-blueprint': return <EngineeringBlueprintTemplate data={resumeData} colorTheme={selectedColor} />;

        default: return <ModernTemplate {...props} />;
      }
    })();

    return (
      <TemplatePreviewFrame>{thumb}</TemplatePreviewFrame>
    );
  };

  const handleTemplateClick = (id: AnyTemplateId) => {
    const tpl = templates.find((t) => t.id === id);
    const isLocked = !!tpl?.premium && !hasAIPlan;
    if (isLocked) {
      setShowUpgradeModal(true);
      return;
    }
    setSelectedTemplate(id);
  };

  const handleTabChange = useCallback((value: string) => {
    const nextTab: AppTab = (
      value === 'build' ||
      value === 'templates' ||
      value === 'ai' ||
      value === 'analytics' ||
      value === 'import' ||
      value === 'versions'
    ) ? (value as AppTab) : 'build';

    setActiveTab(nextTab);

    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', nextTab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const handleUseCvForZ83 = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (!hasRealCvDetails(resumeData)) {
      alert('Import your CV or replace the sample details first, then use those details for your Z83.');
      handleTabChange('import');
      return;
    }

    try {
      const payload = {
        source: 'cv-generator',
        version: 1,
        createdAt: new Date().toISOString(),
        data: buildZ83PrefillFromResume(resumeData),
      };

      window.sessionStorage.setItem(Z83_PREFILL_STORAGE_KEY, JSON.stringify(payload));
      window.location.href = '/z83-filler?prefill=cv';
    } catch {
      alert('Your browser could not prepare the Z83 prefill. Please try again after refreshing the page.');
    }
  }, [handleTabChange, resumeData]);

  // Instant PDF download via Netlify Function (no print dialog)
  // Requires Netlify function at: /.netlify/functions/export-pdf
  const handleExport = useCallback(async () => {
    const el = previewRef.current;
    if (!el) {
      alert('Preview not ready yet. Please try again.');
      return;
    }

    setIsPrinting(true);

    try {
      const styles = Array.from(document.styleSheets)
        .map((sheet) => {
          try {
            return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
          } catch {
            return sheet.href ? `@import url("${sheet.href}");` : '';
          }
        })
        .join('\n');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${fileSafeName}</title>
  <style>
    ${styles}

    @page { size: A4; margin: 0; }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: white;
    }

    body > div {
      box-shadow: none !important;
      border-radius: 0 !important;
    }
  </style>
</head>
<body>
  ${el.outerHTML}
</body>
</html>`;

      const res = await fetch('/.netlify/functions/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, fileName: fileSafeName }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error || 'Could not export PDF.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileSafeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'PDF export failed.');
    } finally {
      setIsPrinting(false);
    }
  }, [fileSafeName]);

  const startSubscription = async (plan: PlanId) => {
    setIsRedirecting(true);
    setBillingError('');

    try {
      if (!isFirebaseConfigured()) {
        setBillingError('Firebase is not configured on this deployment.');
        setIsRedirecting(false);
        return;
      }

      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        setBillingError('Please login to upgrade.');
        setIsRedirecting(false);
        return;
      }

      const token = await user.getIdToken();

      const res = await fetch('/.netlify/functions/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const error = payload?.error || 'Could not start PayFast checkout. Please try again.';
        const details = payload?.details || (Array.isArray(payload?.missing) ? payload.missing.join(', ') : '');
        setBillingError(details ? `${error} ${details}` : error);
        setIsRedirecting(false);
        return;
      }

      const paymentUrl = payload?.payment_url as string | undefined;
      const fields = payload?.fields as Record<string, string> | undefined;
      if (!paymentUrl || !fields) {
        setBillingError('Could not start PayFast checkout. Please try again.');
        setIsRedirecting(false);
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = paymentUrl;
      form.style.display = 'none';

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (e: any) {
      setBillingError('Could not start PayFast checkout. Please try again.');
      setIsRedirecting(false);
    }
  };

  const startAiCreditPayment = async () => {
    setIsRedirecting(true);
    setBillingError('');

    try {
      if (!isFirebaseConfigured()) {
        setBillingError('Firebase is not configured on this deployment.');
        setIsRedirecting(false);
        return;
      }

      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        setBillingError('Please login to buy AI Tailor credits.');
        setIsRedirecting(false);
        return;
      }

      const token = await user.getIdToken();

      const res = await fetch('/.netlify/functions/create-ai-credit-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pack: 'ai_tailor_10' }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const error = payload?.error || 'Could not start PayFast checkout. Please try again.';
        const details = payload?.details || (Array.isArray(payload?.missing) ? payload.missing.join(', ') : '');
        setBillingError(details ? `${error} ${details}` : error);
        setIsRedirecting(false);
        return;
      }

      const paymentUrl = payload?.payment_url as string | undefined;
      const fields = payload?.fields as Record<string, string> | undefined;
      if (!paymentUrl || !fields) {
        setBillingError('Could not start PayFast checkout. Please try again.');
        setIsRedirecting(false);
        return;
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = paymentUrl;
      form.style.display = 'none';

      Object.entries(fields).forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (e: any) {
      setBillingError('Could not start PayFast checkout. Please try again.');
      setIsRedirecting(false);
    }
  };

  const downloadBillingReceipt = async (record: BillingHistoryRecord) => {
    const { jsPDF } = await import('jspdf');
    const receipt = new jsPDF({ unit: 'mm', format: 'a4' });
    const paymentDate = record.date
      ? new Date(record.date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Not available';

    receipt.setFont('helvetica', 'bold');
    receipt.setFontSize(20);
    receipt.text('Career Unified', 20, 24);
    receipt.setFontSize(15);
    receipt.text('Payment receipt', 20, 36);

    receipt.setDrawColor(220, 225, 232);
    receipt.line(20, 43, 190, 43);

    receipt.setFont('helvetica', 'normal');
    receipt.setFontSize(11);
    receipt.text(`Payment date: ${paymentDate}`, 20, 56);
    receipt.text(`Product: ${record.plan}`, 20, 66);
    receipt.text(`Amount paid: R${record.amount}`, 20, 76);
    receipt.text(`Status: Paid`, 20, 86);
    receipt.text(`Payment reference: ${record.paymentId}`, 20, 96);
    receipt.text('Payment processed securely via PayFast.', 20, 112);

    receipt.setFontSize(9);
    receipt.setTextColor(100, 110, 125);
    receipt.text('Keep this receipt for your records.', 20, 126);

    const safeReference = record.paymentId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 50) || record.id;
    receipt.save(`Career-Unified-receipt-${safeReference}.pdf`);
  };

  const finalScale = Math.min(1, fitScale * previewScale);

  //  EDIT #2: Mobile max zoom = 100% (same as desktop)
  const ZOOM_MIN = isMobile ? 0.7 : 0.5;
  const ZOOM_MAX = 1.0;

  //  EDIT #3: Zoom step = 5%
  const ZOOM_STEP = 0.05;

  const planName = formatPlanName(billing?.plan);
  const subscriptionStatus = billing?.subscriptionStatus || 'inactive';
  const isActiveSubscription = subscriptionStatus === 'active';
  const applicationsUsed = billing?.used ?? 0;
  const limitLabel = formatLimit(billing?.limit);
  const usageLabel = `${applicationsUsed} / ${limitLabel}`;
  const managePlanName = billing?.plan === 'job_seeker' ? 'Job Hunter' : planName;
  const managePlan = PLAN_OPTIONS.find((plan) => plan.id === billing?.plan);
  const managePlanPrice = managePlan?.price ?? 'R0/month';
  const [managePlanAmount] = managePlanPrice.split('/');
  const managePlanBillingAmount = managePlanAmount.replace(/[^\d,]/g, '').replace(',', '.') || '0';
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
  const nextBillingLabel = nextBillingDate.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const remainingApplications =
    typeof billing?.limit === 'number' ? Math.max(0, billing.limit - applicationsUsed) : null;
  const usageProgress =
    typeof billing?.limit === 'number' && billing.limit > 0
      ? Math.min(100, Math.max(0, (applicationsUsed / billing.limit) * 100))
      : 100;
  const managePlanFeatures = [
    {
      label: 'AI tailoring',
      value: billing?.limit === null ? 'Unlimited' : `${limitLabel}/month`,
      icon: Sparkles,
    },
    {
      label: 'Cover letters',
      value: 'Included',
      icon: FileText,
    },
    {
      label: 'Saved versions',
      value: billing?.plan === 'starter' ? 'Basic' : 'Included',
      icon: Layers,
    },
    {
      label: 'Premium templates',
      value: billing?.plan === 'free' ? 'Upgrade' : 'Included',
      icon: Layout,
    },
  ];
  const visibleBillingHistory = showAllBillingHistory ? billingHistory : billingHistory.slice(0, 3);
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-sky-50/50 to-slate-50">
      {/* NAVIGATION (matched to varsity page structure/classes) */}
      <nav className="main-nav">
        {/* DESKTOP VIEW */}
        <a href="/" className="logo desktop-nav">
          Career Unified
        </a>

        <div className="nav-links desktop-nav">
          <a href="/jobs">Jobs</a>
          <a href="/bursaries">Bursaries</a>
          <a href="/varsity">Varsity</a>
          <a href="/cv-generator/">Generate CV</a>
          <a href="/recruiter-dashboard.html">Recruiter Dashboard</a>
          <a href="/recruiter-apply.html">Apply as Recruiter</a>
          <a href="/saved-items.html">Saved Items</a>
          <a href="/signup.html">Sign Up</a>
          <a href="/login.html">Login</a>

          {/* My Account Icon (Desktop) */}
          <a
            href="/account-page.html"
            className="icon-btn desktop-account-btn"
            aria-label="My Account"
            title="My Account"
          >
            <svg viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </a>
        </div>

        {/* MOBILE VIEW */}
        <div className="mobile-nav">
          <a href="/" className="mobile-logo">
            Career Unified
          </a>

          <div className="mobile-nav-right">
            <a href="/account-page.html" className="icon-btn" aria-label="My Account">
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </a>

            <button
              className="icon-btn"
              id="menuBtn"
              aria-label="Main Menu"
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE SLIDE MENU */}
      <div className="mobile-menu" id="mobileMenu" style={{ display: mobileMenuOpen ? 'block' : 'none' }}>
        <a href="/jobs">Jobs</a>
        <a href="/bursaries">Bursaries</a>
        <a href="/varsity">Varsity</a>
        <a href="/cv-generator/">Generate CV</a>
        <a href="/recruiter-dashboard.html">Recruiter Dashboard</a>
        <a href="/recruiter-apply.html">Apply as Recruiter</a>
        <a href="/saved-items.html">Saved Items</a>
        <a href="/signup.html">Sign Up</a>
        <a href="/login.html">Login</a>
      </div>

      <div className="container mx-auto px-4 lg:px-6 py-6 lg:py-8">
        <div className="mb-6">
          <SmartTips data={resumeData} />
        </div>

        <section className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 shadow-sm">
                <Signature className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Applying for a government post?</h3>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Send your CV names, contact details, education, and work history into the Z83 filler, then review the official form before signing.
                </p>
              </div>
            </div>
            <Button type="button" onClick={handleUseCvForZ83} className="shrink-0 bg-emerald-700 hover:bg-emerald-800">
              <Signature className="mr-2 h-4 w-4" />
              Use my CV details to prefill Z83
            </Button>
          </div>
        </section>

        <Card className="mb-6 border-blue-100 bg-white/95 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  {isActiveSubscription ? <CheckCircle2 className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">Plan Status</h2>
                    <Badge variant={isActiveSubscription ? 'default' : 'secondary'} className="capitalize">
                      {subscriptionStatus}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-3">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-slate-500">Current plan</span>
                      <div className="font-medium text-slate-900">{isLoadingBilling ? 'Checking...' : planName}</div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-slate-500">Applications used</span>
                      <div className="font-medium text-slate-900">{isLoadingBilling ? '...' : usageLabel}</div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide text-slate-500">Limit</span>
                      <div className="font-medium text-slate-900">{isLoadingBilling ? '...' : limitLabel}</div>
                    </div>
                  </div>
                  {billingError ? (
                    <p className="mt-3 text-sm text-red-600">{billingError}</p>
                  ) : !isActiveSubscription ? (
                    <p className="mt-3 text-sm text-slate-600">
                      Upgrade to unlock AI templates and AI Tailor
                    </p>
                  ) : (
                    <p className="mt-3 text-sm font-medium text-emerald-700">Subscription active</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setShowUpgradeModal(true)} className="bg-blue-600 hover:bg-blue-700">
                  <Crown className="mr-2 h-4 w-4" />
                  {isActiveSubscription ? 'Change plan' : 'Upgrade'}
                </Button>
                {isActiveSubscription ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowManageSubscriptionModal(true)}
                    className="border-blue-200"
                  >
                    Manage subscription
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Panel */}
          <div className="min-w-0 lg:col-span-5">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-2 h-auto p-2 bg-white shadow-sm">
                <TabsTrigger
                  value="build"
                  className="flex flex-col lg:flex-row items-center gap-1.5 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-600 data-[state=active]:text-white"
                >
                  <FileText className="h-4 w-4" />
                  <span className="text-xs lg:text-sm">Build</span>
                </TabsTrigger>

                <TabsTrigger
                  value="templates"
                  className="flex flex-col lg:flex-row items-center gap-1.5 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-600 data-[state=active]:text-white"
                >
                  <Palette className="h-4 w-4" />
                  <span className="text-xs lg:text-sm">Templates</span>
                </TabsTrigger>

                <TabsTrigger
                  value="ai"
                  className="flex flex-col lg:flex-row items-center gap-1.5 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-600 data-[state=active]:text-white"
                >
                  <Wand2 className="h-4 w-4" />
                  <span className="text-xs lg:text-sm">AI Tailor</span>
                </TabsTrigger>

                <TabsTrigger
                  value="analytics"
                  className="flex flex-col lg:flex-row items-center gap-1.5 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-600 data-[state=active]:text-white"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-xs lg:text-sm">Analytics</span>
                </TabsTrigger>

                <TabsTrigger
                  value="import"
                  className="flex flex-col lg:flex-row items-center gap-1.5 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-600 data-[state=active]:text-white"
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-xs lg:text-sm">Import</span>
                </TabsTrigger>

                <TabsTrigger
                  value="versions"
                  className="flex flex-col lg:flex-row items-center gap-1.5 py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-600 data-[state=active]:text-white"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span className="text-xs lg:text-sm">Versions</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="build" className="mt-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="pr-4">
                    <ResumeBuilder data={resumeData} onChange={setResumeData} />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="templates" className="mt-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="space-y-6 lg:pr-4">
                    <div>
                      <h2 className="text-2xl mb-2">Premium Templates</h2>
                      <p className="text-sm text-gray-600 mb-6">
                        Choose from professionally designed templates optimized for ATS systems
                      </p>
                      <div className="text-xs text-slate-600">
                        {isLoadingBilling ? (
                          'Checking your plan…'
                        ) : hasAIPlan ? (
                          'AI Plan active — premium templates unlocked '
                        ) : (
                          'Premium templates require an AI plan.'
                        )}
                        {billingError ? <span className="text-red-600"> ({billingError})</span> : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {templates.map((template, index) => {
                        const isSelected = selectedTemplate === template.id;
                        const isLocked = !!template.premium && !hasAIPlan;

                        return (
                          <motion.div
                            key={template.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.06 }}
                          >
                            <Card
                              className={`cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 relative ${
                                isSelected ? 'ring-2 ring-blue-500 shadow-xl' : ''
                              } ${isLocked ? 'opacity-95' : ''}`}
                              onClick={() => handleTemplateClick(template.id)}
                            >
                              <CardContent className="p-3 sm:p-6">
                                <div className="aspect-[8.5/11] w-full bg-white rounded-lg mb-4 shadow-inner overflow-hidden border">
                                  {renderTemplateThumbnail(template.id)}
                                </div>

                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <h3 className="font-semibold mb-1">{template.name}</h3>
                                      {template.premium && (
                                        <Badge className="text-[10px] px-2 py-0.5" variant="secondary">
                                          AI
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                    <Badge variant="outline" className="text-xs">
                                      {template.category}
                                    </Badge>
                                  </div>

                                  {isLocked && (
                                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                                      <Lock className="h-4 w-4" />
                                    </div>
                                  )}
                                </div>
                              </CardContent>

                              {isLocked && (
                                <div className="absolute inset-0 rounded-xl bg-black/30 flex items-center justify-center">
                                  <div className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 flex items-center gap-2 shadow">
                                    <Lock className="h-4 w-4" />
                                    Requires AI Plan
                                  </div>
                                </div>
                              )}
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>

                    <div className="mt-8">
                      <ThemeCustomizer selectedColor={selectedColor} onColorChange={setSelectedColor} />
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="ai" className="mt-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="pr-4">
                    <AITailor
                      data={resumeData}
                      onApplySuggestions={setResumeData}
                      initialJobDescription={initialAIJobDescription}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="pr-4">
                    <ATSScore data={resumeData} />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="import" className="mt-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="pr-4">
                    <ImportData onImport={setResumeData} />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="versions" className="mt-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="pr-4">
                    <ResumeVersions
                      currentData={resumeData}
                      onLoadVersion={setResumeData}
                      refreshKey={resumeVersionsRefreshKey}
                    />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel - Preview */}
          <div className="min-w-0 lg:col-span-7">
            <div className="lg:sticky lg:top-24">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                  <h2 className="text-xl">Live Preview</h2>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    onClick={handleUseCvForZ83}
                    className="bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50"
                    variant="outline"
                  >
                    <Signature className="h-4 w-4 mr-2" />
                    Prefill Z83
                  </Button>

                  <Button
                    onClick={handleExport}
                    disabled={isPrinting}
                    className="bg-white text-[#1e3a8a] border border-blue-200 hover:bg-blue-50"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isPrinting ? 'Preparing…' : 'Download PDF'}
                  </Button>

                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-blue-100">
                    <button
                      type="button"
                      onClick={() => setPreviewScale((v) => Math.max(ZOOM_MIN, Number((v - ZOOM_STEP).toFixed(2))))}
                      className="text-gray-600 hover:text-blue-600 transition-colors"
                      aria-label="Zoom out"
                    >
                      <span className="text-lg">-</span>
                    </button>

                    <span className="text-sm font-medium min-w-[3.25rem] text-center">
                      {Math.round(finalScale * 100)}%
                    </span>

                    <button
                      type="button"
                      onClick={() => setPreviewScale((v) => Math.min(ZOOM_MAX, Number((v + ZOOM_STEP).toFixed(2))))}
                      className="text-gray-600 hover:text-blue-600 transition-colors"
                      aria-label="Zoom in"
                    >
                      <span className="text-lg">+</span>
                    </button>
                  </div>

                  <Badge variant="outline" className="bg-white shadow-sm border-blue-200">
                    {templates.find((t) => t.id === selectedTemplate)?.name || 'Template'}
                  </Badge>
                </div>
              </div>

              <Card className="w-full max-w-full overflow-hidden shadow-2xl border-2 border-blue-100">
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-260px)] w-full max-w-full lg:h-[calc(100vh-220px)]">
                    <div
                      ref={previewWrapRef}
                      className="box-border flex w-full min-w-0 max-w-full justify-center overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-6 lg:p-8"
                    >
                      <div
                        style={{
                          width: Math.floor(TEMPLATE_CANVAS_WIDTH * finalScale),
                          maxWidth: '100%',
                          overflow: 'hidden',
                        }}
                      >
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.25 }}
                          style={{
                            transform: `scale(${finalScale})`,
                            transformOrigin: 'top left',
                            width: TEMPLATE_CANVAS_WIDTH,
                          }}
                        >
                          <div ref={previewRef}>{renderTemplate()}</div>
                        </motion.div>
                      </div>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="z-[10000] max-h-[calc(100dvh-1rem)] !w-[min(94vw,1040px)] !max-w-[1040px] overflow-y-auto rounded-lg p-5 shadow-none sm:!max-w-[1040px] sm:p-7">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-[18px] font-medium leading-tight text-foreground">
              Unlock AI CV tailoring
            </DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Join 500+ SA job seekers already landing interviews
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            {billingError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">
                {billingError}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
              {PLAN_OPTIONS.map((plan) => {
                const [amount, period = 'month'] = plan.price.split('/');
                return (
                  <div
                    key={plan.id}
                    className={`relative flex min-h-[330px] flex-col rounded-lg bg-background p-5 max-[759px]:p-4 ${
                      plan.featured
                        ? 'order-none border-2 border-[#185FA5]'
                        : 'border border-border'
                    }`}
                  >
                    {plan.badge ? (
                      <Badge className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-md bg-[#185FA5] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#185FA5]">
                        {plan.badge}
                      </Badge>
                    ) : null}
                    <div className="flex flex-1 flex-col">
                      <h3 className="text-[15px] font-medium text-foreground">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-[28px] font-semibold tracking-normal text-foreground">{amount}</span>
                        <span className="text-[12px] font-medium text-muted-foreground">/{period}</span>
                      </div>
                      <ul className="mt-5 flex-1 space-y-3 text-[13px] text-foreground">
                      {plan.benefits.map((benefit) => (
                        <li key={benefit} className="flex gap-2 leading-5">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#185FA5]" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                      </ul>
                    </div>

                    <Button
                      variant={plan.featured ? 'default' : 'outline'}
                      className={`mt-6 min-h-[44px] w-full ${
                        plan.featured
                          ? 'bg-[#185FA5] text-white hover:bg-[#0C447C]'
                          : 'border-border bg-background text-foreground hover:bg-accent'
                      }`}
                      disabled={isRedirecting}
                      onClick={() => startSubscription(plan.id)}
                    >
                      {isRedirecting ? 'Starting checkout...' : 'Choose plan'}
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-5 rounded-lg border border-[#185FA5] bg-[#E6F1FB] p-5 max-[759px]:order-[-1] max-[759px]:flex-col max-[759px]:items-stretch">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium text-[#0C447C]">
                    Not ready to subscribe? Get 10 AI tailors for R19
                  </p>
                  <Badge className="rounded-md bg-[#185FA5] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#185FA5]">
                    Best value start
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-[#185FA5]">
                  No subscription · no expiry · use them whenever you need
                </p>
              </div>

              <Button
                type="button"
                className="min-h-[44px] shrink-0 bg-[#185FA5] px-6 text-white hover:bg-[#0C447C] max-[759px]:mt-1 max-[759px]:w-full"
                disabled={isRedirecting}
                onClick={startAiCreditPayment}
              >
                {isRedirecting ? 'Starting checkout...' : 'Grab this deal'}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <p className="text-center text-[11px] text-muted-foreground">
                secure billing via PayFast · cancel anytime
              </p>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              className="mx-auto block min-h-[44px] cursor-pointer text-center text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowUpgradeModal(false)}
            >
              Not now — I'll apply with my current CV
            </button>

            {import.meta.env.DEV ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setBilling({
                    plan: 'starter',
                    subscriptionStatus: 'active',
                    used: 0,
                    limit: 15,
                    freeResumeUsed: false,
                    freeCoverUsed: false,
                    freeResumeTailorsUsed: 0,
                    freeCoverLettersUsed: 0,
                    freeResumeLimit: 3,
                    freeCoverLetterLimit: 3,
                    pendingPlan: null,
                    pendingPayfastPaymentId: null,
                  });
                  setShowUpgradeModal(false);
                }}
              >
                (Dev) Unlock AI Plan
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showManageSubscriptionModal} onOpenChange={setShowManageSubscriptionModal}>
        <DialogContent className="z-[10000] !top-2 max-h-[calc(100dvh-1rem)] w-[92vw] max-w-[620px] !translate-y-0 gap-0 overflow-y-auto rounded-[var(--radius-lg)] border-[0.5px] border-[var(--border)] p-0 shadow-none sm:max-w-[620px] [&>button:last-child]:hidden">
          <DialogHeader className="flex-row items-start justify-between gap-4 border-b-[0.5px] border-[var(--border)] bg-background px-5 py-4 text-left max-[479px]:px-4">
            <div>
              <DialogTitle className="text-[17px] font-medium leading-tight text-foreground">
                Manage subscription
              </DialogTitle>
              <DialogDescription className="mt-1 text-[12px] text-muted-foreground">
                Review your plan, usage, and billing options
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Close manage subscription"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </DialogHeader>

          <div className="bg-[#185FA5] px-5 pb-5 pt-6 text-white max-[479px]:px-4 max-[479px]:pb-4 max-[479px]:pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-white/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#E6F1FB]">
                  <Crown className="h-3.5 w-3.5" />
                  {managePlanName} plan
                </div>
                <div className="mt-3 text-[24px] font-medium leading-tight text-white">
                  {managePlanAmount} <span className="text-[15px] font-normal text-[#E6F1FB]">/ month</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[12px] text-[#E6F1FB]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C0DD97]" />
                  Active · renews {nextBillingLabel}
                </div>
              </div>

            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-md)] bg-white/15 p-3.5 max-[479px]:p-3">
                <div className="text-[11px] text-[#E6F1FB] max-[479px]:text-[10px]">AI tailors used</div>
                <div className="mt-1 flex items-end gap-1 text-white">
                  <span className="text-[26px] font-medium leading-none max-[479px]:text-[25px]">
                    {applicationsUsed}
                  </span>
                  <span className="pb-0.5 text-[13px] font-normal text-[#E6F1FB] max-[479px]:text-[12px]">
                    of {limitLabel}
                  </span>
                </div>
                <div className="mt-3 h-[3px] rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white" style={{ width: `${usageProgress}%` }} />
                </div>
                <div className="mt-2 text-[11px] text-[#E6F1FB] max-[479px]:text-[10px]">
                  {remainingApplications === null ? 'Unlimited remaining' : `${remainingApplications} remaining`}
                </div>
              </div>

              <div className="rounded-[var(--radius-md)] bg-white/15 p-3.5 max-[479px]:p-3">
                <div className="text-[11px] text-[#E6F1FB] max-[479px]:text-[10px]">Next billing</div>
                <div className="mt-2 text-[18px] font-medium leading-tight text-white max-[479px]:text-[17px]">
                  {nextBillingLabel}
                </div>
                <div className="mt-2 text-[11px] text-[#E6F1FB] max-[479px]:text-[10px]">
                  R{managePlanBillingAmount} via PayFast
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#E6F1FB] max-[479px]:text-[10px]">
                  <Lock className="h-3.5 w-3.5" />
                  Secure billing
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 bg-background p-5 max-[479px]:p-4">
            <section className="space-y-2.5">
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Your plan includes
              </div>
              <div className="rounded-[var(--radius-lg)] border-[0.5px] border-[var(--border)]">
                {managePlanFeatures.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.label}
                      className={`flex items-center gap-3 px-3.5 py-3 text-[13px] ${
                        index === managePlanFeatures.length - 1 ? '' : 'border-b-[0.5px] border-[var(--border)]'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#185FA5]" />
                      <span className="min-w-0 flex-1 text-foreground">{feature.label}</span>
                      <span className="shrink-0 text-muted-foreground">{feature.value}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                  Billing history
                </div>
                {billingHistory.length > 3 ? (
                  <button
                    type="button"
                    className="text-[12px] font-medium text-[#185FA5]"
                    onClick={() => setShowAllBillingHistory((value) => !value)}
                  >
                    {showAllBillingHistory ? 'Show less' : 'View all'}
                  </button>
                ) : null}
              </div>
              <div className="rounded-[var(--radius-lg)] border-[0.5px] border-[var(--border)]">
                {isLoadingBillingHistory ? (
                  <div className="px-3.5 py-3 text-[12px] text-muted-foreground">Loading billing history...</div>
                ) : billingHistoryError ? (
                  <div className="px-3.5 py-3 text-[12px] text-red-600">{billingHistoryError}</div>
                ) : visibleBillingHistory.length > 0 ? (
                  visibleBillingHistory.map((row, index) => (
                    <div
                      key={row.id}
                      className={`grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2 px-3.5 py-3 ${
                        index === visibleBillingHistory.length - 1 ? '' : 'border-b-[0.5px] border-[var(--border)]'
                      }`}
                    >
                      <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                        {row.date
                          ? new Date(row.date).toLocaleDateString('en-ZA', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Date unavailable'}
                      </span>
                      <span className="min-w-0 truncate text-[12px] text-foreground">{row.plan}</span>
                      <span className="text-[12px] text-foreground">R{row.amount}</span>
                      <span className="rounded-[var(--radius-md)] bg-[#EAF3DE] px-2 py-1 text-[11px] font-medium text-[#3B6D11]">
                        Paid
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[#185FA5] hover:bg-[#E6F1FB]"
                        onClick={() => void downloadBillingReceipt(row)}
                        aria-label={`Download receipt for ${row.plan}`}
                        title="Download receipt"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-3.5 py-3 text-[12px] text-muted-foreground">
                    Billing history will appear after your first successful PayFast payment.
                  </div>
                )}
              </div>
            </section>

            <section className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border-[0.5px] border-[#378ADD] bg-[#E6F1FB] p-3.5 max-[479px]:flex-col max-[479px]:items-stretch">
              <div className="flex min-w-0 gap-3">
                <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[#0C447C]" />
                <div>
                  <div className="text-[12px] font-medium text-[#0C447C]">Need a boost? 10 AI tailors for R19</div>
                  <div className="mt-1 text-[11px] text-[#185FA5]">One-time · no subscription · no expiry</div>
                </div>
              </div>
              <Button
                type="button"
                className="min-h-[44px] shrink-0 bg-[#185FA5] px-4 text-[12px] font-medium text-[#E6F1FB] hover:bg-[#0C447C] max-[479px]:w-full"
                disabled={isRedirecting}
                onClick={startAiCreditPayment}
              >
                {isRedirecting ? 'Starting...' : 'Get deal'}
              </Button>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                className="min-h-[44px] bg-[#185FA5] text-[13px] font-medium text-white hover:bg-[#0C447C]"
                onClick={() => {
                  setShowManageSubscriptionModal(false);
                  setShowUpgradeModal(true);
                }}
              >
                Upgrade plan
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] border-[0.5px] border-[var(--border)] bg-transparent text-[13px] font-medium text-foreground hover:bg-accent"
                onClick={() => setShowManageSubscriptionModal(false)}
              >
                Close
              </Button>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              To cancel or pause your plan contact{' '}
              <a className="font-medium text-[#185FA5]" href="mailto:support@careerunified.com">
                support
              </a>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
