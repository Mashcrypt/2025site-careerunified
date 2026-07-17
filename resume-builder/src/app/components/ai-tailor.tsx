import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Copy,
  Trash2,
  Lock,
  CreditCard,
  BadgePercent,
  Download,
} from 'lucide-react';

import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import type { ResumeData } from '../types/resume';
import { doc as firestoreDoc, getDoc } from 'firebase/firestore';

// ✅ Use your initialized Firebase client helper
import { getFirebaseAuth, getFirebaseDb } from '../utils/firebaseClient';
import { trackAnalyticsEvent } from '../utils/analytics';

interface AITailorProps {
  data: ResumeData;
  onApplySuggestions: (data: ResumeData) => void;
  jobDescription: string;
  onJobDescriptionChange: (value: string) => void;
  atsFeedback?: string;
  onClearAtsFeedback?: () => void;
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

type PlanId = 'starter' | 'job_seeker' | 'career_pro';

type BillingStatus = {
  plan: 'free' | 'starter' | 'job_seeker' | 'career_pro';
  subscriptionStatus: 'active' | 'past_due' | 'cancelled' | 'inactive' | string;
  used: number;
  limit: number | null; // null = unlimited
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

function isFirebaseConfigured() {
  // Vite exposes env vars at build time. If these are missing on Netlify,
  // Firebase auth will often throw invalid-api-key / config errors.
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

function buildContactLines(data: ResumeData) {
  const pi = data?.personalInfo;
  const fullName = (pi?.fullName || '').trim();

  const email = (pi?.email || '').trim();
  const phone = (pi?.phone || '').trim();
  const location = (pi?.location || '').trim();
  const linkedin = (pi?.linkedin || '').trim();
  const website = (pi?.website || '').trim();

  const line1Parts = [email, phone].filter(Boolean);
  const line2Parts = [location].filter(Boolean);

  // Prefer website over linkedin if both exist? include both if present but keep neat
  const linkParts = [linkedin, website].filter(Boolean);

  return {
    fullName,
    contactLine1: line1Parts.join(' • '),
    contactLine2: line2Parts.join(' • '),
    contactLine3: linkParts.join(' • '),
  };
}

function safeFilePart(name: string) {
  return (name || 'Candidate')
    .trim()
    .replace(/[^a-z0-9\-\s_]/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60);
}

function hasClosingAlready(text: string) {
  const tail = (text || '').slice(-500);
  return /(sincerely|kind regards|regards|yours faithfully|yours sincerely|best regards)/i.test(tail);
}

export function AITailor({
  data,
  onApplySuggestions,
  jobDescription,
  onJobDescriptionChange,
  atsFeedback,
  onClearAtsFeedback,
}: AITailorProps) {
  const [mode, setMode] = useState<TailorMode>('tailor');

  const [hasImportedJobDescription, setHasImportedJobDescription] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Tailor results
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tailoredData, setTailoredData] = useState<ResumeData | null>(null);

  // Cover letter results
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [talkingPoints, setTalkingPoints] = useState<string[]>([]);

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // ✅ Cover letter PDF download state
  const [isDownloadingCover, setIsDownloadingCover] = useState(false);

  // Billing / upgrade UI
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Billing status
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);

  const headerText = useMemo(() => {
    return mode === 'cover_letter' ? 'AI Cover Letter Generator' : 'AI Resume Tailor';
  }, [mode]);

  const descriptionText = useMemo(() => {
    if (mode === 'cover_letter') {
      return 'Paste the job description and generate a professional cover letter aligned to your resume.';
    }
    return 'Paste the job description below and let AI optimize your resume to match the requirements.';
  }, [mode]);

  const resetResults = useCallback(() => {
    setSuggestions([]);
    setTailoredData(null);
    setCoverLetter('');
    setTalkingPoints([]);
    setErrorMsg('');
    setCopied(false);
    setNeedsUpgrade(false);
  }, []);

  const clearImportedJob = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('careerUnifiedAITailorJob');
    }

    onJobDescriptionChange('');
    setHasImportedJobDescription(false);
    resetResults();
  }, [onJobDescriptionChange, resetResults]);

  const getIdTokenOrThrow = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      throw new Error(
        'Firebase is not configured on this deployment. Add VITE_FIREBASE_* env vars in Netlify, then redeploy.'
      );
    }

    // This call also ensures initializeApp() ran inside firebaseClient
    const auth = getFirebaseAuth();
    const user = auth.currentUser;
    if (!user) throw new Error('You must be logged in to use AI features.');

    const token = await user.getIdToken();
    if (!token) throw new Error('You must be logged in to use AI features.');
    return token;
  }, []);

  const loadBillingStatus = useCallback(async () => {
    setIsLoadingBilling(true);
    setErrorMsg('');

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

      const token = await auth.currentUser.getIdToken();

      const loadFirestoreFallback = async () => {
        const db = getFirebaseDb();
        const userSnap = await getDoc(firestoreDoc(db, 'users', auth.currentUser!.uid));
        if (!userSnap.exists()) return null;
        const fallback = billingStatusFromUserDoc(userSnap.data() || {});
        setBilling(fallback);
        return fallback;
      };

      const res = await fetch('/.netlify/functions/get-billing-status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const fallback = await loadFirestoreFallback().catch(() => null);
        if (fallback) return fallback;
        setErrorMsg('Could not verify billing status. Please refresh or login again.');
        return null;
      }

      const nextBilling = payload as BillingStatus;
      setBilling(nextBilling);
      return nextBilling;
    } catch {
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
      setErrorMsg('Could not verify billing status. Please refresh or login again.');
      return null;
    } finally {
      setIsLoadingBilling(false);
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

  // Refresh billing if user landed on /billing/success after PayFast checkout.
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

  const planLabel = useMemo(() => {
    if (!billing) return '—';
    if (billing.plan === 'career_pro') return 'Career Pro';
    if (billing.plan === 'job_seeker') return 'Job Seeker';
    if (billing.plan === 'starter') return 'Starter';
    return 'Free';
  }, [billing]);

  const usageText = useMemo(() => {
    if (!billing) return '';

    const isPaid = billing.plan !== 'free' && billing.subscriptionStatus === 'active';

    if (!isPaid) {
      if ((billing.aiTailorCredits || 0) > 0) {
        return `${billing.aiTailorCredits} once-off AI tailors available`;
      }

      if (billing.pendingCreditPayfastPaymentId || billing.pendingCreditPack) {
        return 'AI Tailor credits are being verified by PayFast';
      }

      const resumeLimit = billing.freeResumeLimit ?? 3;
      const coverLimit = billing.freeCoverLetterLimit ?? 3;
      const resumeUsed = billing.freeResumeTailorsUsed ?? (billing.freeResumeUsed ? 1 : 0);
      const coverUsed = billing.freeCoverLettersUsed ?? (billing.freeCoverUsed ? 1 : 0);
      const resumeLeft = Math.max(0, resumeLimit - resumeUsed);
      const coverLeft = Math.max(0, coverLimit - coverUsed);
      return `Free taste remaining: ${resumeLeft} tailor + ${coverLeft} cover letter`;
    }

    if (billing.limit === null) return `Unlimited applications • Used ${billing.used}`;
    const left = Math.max(0, (billing.limit ?? 0) - billing.used);
    return `${left} of ${billing.limit} applications left this month`;
  }, [billing]);

  const analyze = async () => {
    if (!jobDescription.trim()) return;

    const contentType = mode === 'cover_letter' ? 'cover_letter' : 'resume';
    const eventPrefix = mode === 'cover_letter' ? 'cover_letter_generate' : 'ai_tailor_generate';
    const analytics = {
      content_type: contentType,
      job_description_words: jobDescription.trim().split(/\s+/).length,
      has_ats_feedback: Boolean(atsFeedback?.trim()),
      job_source: hasImportedJobDescription ? 'career_unified_job' : 'manual',
      current_plan: billing?.plan || 'free',
      subscription_status: billing?.subscriptionStatus || 'inactive',
    };

    setIsAnalyzing(true);
    resetResults();
    trackAnalyticsEvent(`${eventPrefix}_start`, analytics);

    try {
      const token = await getIdTokenOrThrow();

      const res = await fetch('/.netlify/functions/ai-tailor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          resumeData: data,
          jobDescription,
          atsFeedback,
        }),
      });

      const payload = await res.json().catch(() => null);

      if (res.status === 402) {
        trackAnalyticsEvent('premium_feature_blocked', {
          placement: 'ai_tailor',
          feature: contentType,
          current_plan: analytics.current_plan,
          subscription_status: analytics.subscription_status,
        });
        trackAnalyticsEvent(`${eventPrefix}_error`, {
          ...analytics,
          error_code: 'upgrade_required',
          response_status: res.status,
        });
        trackAnalyticsEvent('pricing_view', {
          placement: 'ai_tailor_limit',
          feature: contentType,
          current_plan: analytics.current_plan,
          subscription_status: analytics.subscription_status,
        });
        setNeedsUpgrade(true);
        const details =
          payload?.error ||
          'You’ve used your free taste or reached your monthly limit. Please upgrade to continue.';
        setErrorMsg(String(details));
        return;
      }

      if (!res.ok) {
        trackAnalyticsEvent(`${eventPrefix}_error`, {
          ...analytics,
          error_code: 'request_failed',
          response_status: res.status,
        });
        const details = payload?.error || payload?.details || 'AI request failed. Please try again.';
        setErrorMsg(typeof details === 'string' ? details : JSON.stringify(details));
        return;
      }

      if (mode === 'cover_letter') {
        const typed = payload as CoverLetterResponse;

        if (!typed?.coverLetter || !Array.isArray(typed?.talkingPoints)) {
          trackAnalyticsEvent(`${eventPrefix}_error`, {
            ...analytics,
            error_code: 'invalid_response',
          });
          setErrorMsg('AI returned an unexpected response format (cover letter).');
          return;
        }

        setCoverLetter(typed.coverLetter);
        setTalkingPoints(typed.talkingPoints);
      } else {
        const typed = payload as TailorResponse;

        if (!typed?.tailoredData || !Array.isArray(typed?.suggestions)) {
          trackAnalyticsEvent(`${eventPrefix}_error`, {
            ...analytics,
            error_code: 'invalid_response',
          });
          setErrorMsg('AI returned an unexpected response format (tailor).');
          return;
        }

        setSuggestions(typed.suggestions);
        setTailoredData({
          ...typed.tailoredData,
          additionalSections: typed.tailoredData.additionalSections?.length
            ? typed.tailoredData.additionalSections
            : data.additionalSections,
        });
      }

      trackAnalyticsEvent(`${eventPrefix}_success`, analytics);

      await loadBillingStatus();
    } catch (err: any) {
      trackAnalyticsEvent(`${eventPrefix}_error`, {
        ...analytics,
        error_code: 'request_exception',
      });
      setErrorMsg(err?.message || 'Network error. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyCoverLetter = async () => {
    try {
      await navigator.clipboard.writeText(coverLetter || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  // ✅ Download edited cover letter as a clean A4 PDF + header/date + signature (if needed)
  const downloadCoverLetterPDF = useCallback(async () => {
    const raw = (coverLetter || '').trim();
    if (!raw) return;

    const downloadAnalytics = {
      content_source: 'ai_generated',
      current_plan: billing?.plan || 'free',
      subscription_status: billing?.subscriptionStatus || 'inactive',
    };
    trackAnalyticsEvent('cover_letter_pdf_download_click', downloadAnalytics);

    setIsDownloadingCover(true);
    setErrorMsg('');

    try {
      // Lazy-load to keep bundle light
      const mod = await import('jspdf');
      const jsPDF = mod.jsPDF;

      const { fullName, contactLine1, contactLine2, contactLine3 } = buildContactLines(data);

      const safeName = safeFilePart(fullName);
      const fileName = `Cover Letter - ${safeName || 'Candidate'}`;

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const pageWidth = 210;
      const pageHeight = 297;

      const marginX = 20;
      const marginY = 20;

      // Typography
      const bodyFontSize = 11;
      const lineHeight = 6;

      doc.setFont('times', 'normal');

      // Date (top-right)
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      // Header (top-left)
      let cursorY = marginY;

      // Date first line on the right
      doc.setFontSize(11);
      doc.text(dateStr, pageWidth - marginX, cursorY, { align: 'right' });

      // Name + contacts on left
      if (fullName) {
        doc.setFont('times', 'bold');
        doc.setFontSize(14);
        doc.text(fullName, marginX, cursorY + 7);
        doc.setFont('times', 'normal');
        doc.setFontSize(10);

        let infoY = cursorY + 12;

        if (contactLine1) {
          doc.text(contactLine1, marginX, infoY);
          infoY += 5;
        }
        if (contactLine2) {
          doc.text(contactLine2, marginX, infoY);
          infoY += 5;
        }
        if (contactLine3) {
          doc.text(contactLine3, marginX, infoY);
          infoY += 5;
        }

        // Start body after header block
        cursorY = Math.max(cursorY + 22, infoY + 4);
      } else {
        // No name? still leave space after date line
        cursorY = cursorY + 14;
      }

      // Body
      doc.setFont('times', 'normal');
      doc.setFontSize(bodyFontSize);

      const maxTextWidth = pageWidth - marginX * 2;

      // Add signature only if missing a closing
      let textToPrint = raw.replace(/\r\n/g, '\n');

      if (fullName && !hasClosingAlready(textToPrint)) {
        textToPrint = `${textToPrint}\n\nSincerely,\n${fullName}`;
      }

      const lines = textToPrint.split('\n');

      for (const rawLine of lines) {
        // Preserve blank lines as paragraph spacing
        if (!rawLine.trim()) {
          cursorY += lineHeight;
          continue;
        }

        const wrapped = doc.splitTextToSize(rawLine, maxTextWidth);

        for (const w of wrapped) {
          if (cursorY + lineHeight > pageHeight - marginY) {
            doc.addPage();
            doc.setFont('times', 'normal');
            doc.setFontSize(bodyFontSize);
            cursorY = marginY;
          }
          doc.text(String(w), marginX, cursorY);
          cursorY += lineHeight;
        }

        // slight paragraph spacing after a non-empty line-group
        cursorY += lineHeight * 0.35;
      }

      doc.save(`${fileName}.pdf`);
      trackAnalyticsEvent('cover_letter_pdf_download', downloadAnalytics);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not generate PDF. Please try again.');
    } finally {
      setIsDownloadingCover(false);
    }
  }, [billing?.plan, billing?.subscriptionStatus, coverLetter, data]);

  const startSubscription = async (plan: PlanId) => {
    setIsRedirecting(true);
    setErrorMsg('');

    const checkoutAnalytics = {
      product: 'subscription',
      plan,
      placement: 'ai_tailor_limit',
      current_plan: billing?.plan || 'free',
      subscription_status: billing?.subscriptionStatus || 'inactive',
    };
    const trackCheckoutError = (errorCode: string, responseStatus?: number) => {
      trackAnalyticsEvent('checkout_error', {
        ...checkoutAnalytics,
        error_code: errorCode,
        response_status: responseStatus,
      });
    };

    trackAnalyticsEvent('plan_select', checkoutAnalytics);

    try {
      const token = await getIdTokenOrThrow();
      trackAnalyticsEvent('checkout_start', checkoutAnalytics);

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
        trackCheckoutError('checkout_response_error', res.status);
        const error = payload?.error || 'Could not start PayFast checkout. Please try again.';
        const details = payload?.details || (Array.isArray(payload?.missing) ? payload.missing.join(', ') : '');
        setErrorMsg(details ? `${error} ${details}` : error);
        setIsRedirecting(false);
        return;
      }

      const paymentUrl = payload?.payment_url as string | undefined;
      const fields = payload?.fields as Record<string, string> | undefined;
      if (!paymentUrl || !fields) {
        trackCheckoutError('invalid_checkout_payload');
        setErrorMsg('Could not start PayFast checkout. Please try again.');
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
      trackAnalyticsEvent('payfast_form_submit', checkoutAnalytics);
      form.submit();
    } catch (err: any) {
      trackCheckoutError('checkout_exception');
      setErrorMsg('Could not start PayFast checkout. Please try again.');
      setIsRedirecting(false);
    }
  };

  const applyTailoredVersion = () => {
    if (!tailoredData) return;

    trackAnalyticsEvent('ai_tailored_resume_apply', {
      has_ats_feedback: Boolean(atsFeedback?.trim()),
      suggestion_count: suggestions.length,
      current_plan: billing?.plan || 'free',
      subscription_status: billing?.subscriptionStatus || 'inactive',
    });
    onApplySuggestions(tailoredData);
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

          {/* ✅ Mode Toggle */}
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

          {/* Plan badge + usage */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
              {isLoadingBilling ? 'Checking plan…' : `Plan: ${planLabel}`}
            </span>
            {!!usageText && (
              <span className="inline-flex items-center rounded-full border border-blue-200 bg-white px-3 py-1 text-xs text-gray-700">
                {usageText}
              </span>
            )}
          </div>
        </div>

        <CardDescription>{descriptionText}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isFirebaseConfigured() && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-900">Firebase not configured</p>
                <p className="text-sm text-amber-800 mt-1">
                  Add these Netlify env vars for the <b>resume-builder</b> app and redeploy:
                  <br />
                  <span className="font-mono text-xs">
                    VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
                    VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
                    VITE_FIREBASE_APP_ID, VITE_FIREBASE_MEASUREMENT_ID
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="jobDescription">Job Description</Label>
            {hasImportedJobDescription && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearImportedJob}
                className="w-full sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                Clear imported job
              </Button>
            )}
          </div>
          {hasImportedJobDescription && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Job description imported from Career Unified jobs.
            </div>
          )}
          {atsFeedback?.trim() && mode === 'tailor' && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>ATS feedback loaded. The next AI tailor run will target the missing keywords and weak score areas.</span>
                {onClearAtsFeedback && (
                  <Button type="button" variant="outline" size="sm" onClick={onClearAtsFeedback} className="bg-white">
                    Clear ATS feedback
                  </Button>
                )}
              </div>
            </div>
          )}
          <Textarea
            id="jobDescription"
            value={jobDescription}
            onChange={(e) => {
              onJobDescriptionChange(e.target.value);
              onClearAtsFeedback?.();
              setHasImportedJobDescription(false);
              resetResults();
            }}
            placeholder="Paste the job description here. Include required skills, qualifications, and responsibilities..."
            rows={8}
            className="bg-white"
          />
        </div>

        <Button
          onClick={analyze}
          disabled={!jobDescription.trim() || isAnalyzing || isRedirecting}
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
                  {needsUpgrade
                    ? 'Upgrade Required'
                    : mode === 'cover_letter'
                    ? 'Cover Letter Error'
                    : 'AI Tailor Error'}
                </p>
                <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade UI */}
        {needsUpgrade && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-blue-700" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">Upgrade to continue</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Free taste includes <b>3 Resume Tailors</b> + <b>3 Cover Letters</b>. Upgrade for monthly access.
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3 mt-4">
                <div className="border border-blue-200 rounded-lg p-4 bg-gradient-to-b from-white to-blue-50/30">
                  <p className="text-sm font-medium text-gray-900">Starter</p>
                  <p className="text-xs text-gray-600 mt-1">Student friendly</p>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-gray-900">
                      R29 <span className="text-sm font-medium text-gray-600">/ month</span>
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      <b>15</b> applications / month
                    </p>
                  </div>
                  <Button
                    onClick={() => startSubscription('starter')}
                    disabled={isRedirecting}
                    className="mt-4 h-auto min-h-10 w-full whitespace-normal bg-gradient-to-r from-blue-600 to-sky-600 px-3 py-2 text-center leading-snug hover:from-blue-700 hover:to-sky-700"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Choose Starter
                  </Button>
                </div>

                <div className="border border-blue-300 rounded-lg p-4 bg-gradient-to-b from-white to-sky-50 relative">
                  <p className="text-sm font-medium text-gray-900">Job Seeker</p>
                  <div className="flex items-center gap-2 mt-2">
                    <BadgePercent className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs text-emerald-700 font-medium">Active job search</p>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-gray-900">
                      R69 <span className="text-sm font-medium text-gray-600">/ month</span>
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      <b>40</b> applications / month
                    </p>
                  </div>
                  <Button
                    onClick={() => startSubscription('job_seeker')}
                    disabled={isRedirecting}
                    className="mt-4 h-auto min-h-10 w-full whitespace-normal bg-gradient-to-r from-blue-600 to-sky-600 px-3 py-2 text-center leading-snug hover:from-blue-700 hover:to-sky-700"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Choose Job Seeker
                  </Button>
                </div>

                <div className="border border-blue-300 rounded-lg p-4 bg-gradient-to-b from-white to-blue-50/30 relative">
                  <div className="absolute -top-2 right-3 bg-gradient-to-r from-blue-600 to-sky-600 text-white text-xs px-2 py-1 rounded-full">
                    Best Value
                  </div>
                  <p className="text-sm font-medium text-gray-900">Career Pro</p>
                  <div className="flex items-center gap-2 mt-2">
                    <BadgePercent className="h-4 w-4 text-emerald-600" />
                    <p className="text-xs text-emerald-700 font-medium">Unlimited access</p>
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-gray-900">
                      R149 <span className="text-sm font-medium text-gray-600">/ month</span>
                    </p>
                    <p className="text-sm text-gray-700 mt-2">
                      <b>Unlimited</b> applications
                    </p>
                  </div>
                  <Button
                    onClick={() => startSubscription('career_pro')}
                    disabled={isRedirecting}
                    className="mt-4 h-auto min-h-10 w-full whitespace-normal bg-gradient-to-r from-blue-600 to-sky-600 px-3 py-2 text-center leading-snug hover:from-blue-700 hover:to-sky-700"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Choose Career Pro
                  </Button>
                </div>
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

              <Textarea
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.target.value)}
                rows={12}
                className="bg-white"
              />

              <div className="flex gap-2 mt-3 flex-wrap">
                <Button
                  onClick={copyCoverLetter}
                  className="flex-1 min-w-[180px] bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copied ? 'Copied!' : 'Copy Cover Letter'}
                </Button>

                <Button
                  variant="outline"
                  onClick={downloadCoverLetterPDF}
                  disabled={isDownloadingCover || !coverLetter.trim()}
                  className="min-w-[170px] bg-white text-[#1e3a8a] border border-blue-200 hover:bg-blue-50"
                >
                  {isDownloadingCover ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </>
                  )}
                </Button>

                <Button variant="outline" onClick={resetResults} className="min-w-[140px]">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}

        {!suggestions.length && !coverLetter && !isAnalyzing && !errorMsg && !needsUpgrade && (
          <div className="bg-white rounded-lg p-6 border border-dashed border-blue-200 text-center">
            <Sparkles className="h-12 w-12 text-blue-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600">
              Choose <b>Tailor Resume</b> or <b>Cover Letter</b>, paste a job description, then run AI.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
