import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { ScrollArea } from './components/ui/scroll-area';
import { Badge } from './components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';

import { ResumeBuilder } from './components/resume-builder';
import { AITailor } from './components/ai-tailor';
import { ATSScore } from './components/ats-score';
import { ResumeVersions } from './components/resume-versions';
import { ThemeCustomizer } from './components/theme-customizer';
import { SmartTips } from './components/smart-tips';
import { ImportData } from './components/import-data';

import { ModernTemplate } from './components/templates/modern-template';
import { ProfessionalTemplate } from './components/templates/professional-template';
import { CreativeTemplate } from './components/templates/creative-template';
import { MinimalistTemplate } from './components/templates/minimalist-template';

import { ATSProTemplate } from './components/templates/ats-pro-template';
import { ExecutiveTemplate } from './components/templates/executive-template';
import { TechStackTemplate } from './components/templates/tech-stack-template';

import type { ResumeData, TemplateType } from './types/resume';
import { motion } from 'motion/react';
import { southAfricanSampleData } from './utils/sample-data';

import { getFirebaseAuth } from './utils/firebaseClient';

const initialData: ResumeData = southAfricanSampleData;

type PremiumTemplateId = 'ats-pro' | 'executive' | 'tech-stack';
type AnyTemplateId = TemplateType | PremiumTemplateId;

type PlanId = 'starter' | 'job_seeker' | 'career_pro';

type BillingStatus = {
  plan: 'free' | 'starter' | 'job_seeker' | 'career_pro';
  subscriptionStatus: 'active' | 'past_due' | 'cancelled' | 'inactive' | string;
  used: number;
  limit: number | null;
  freeResumeUsed: boolean;
  freeCoverUsed: boolean;
  pendingPlan?: string | null;
  pendingPaystackReference?: string | null;
};

const TEMPLATE_CANVAS_WIDTH = 816;

function isFirebaseConfigured() {
  const required = [
    import.meta.env.VITE_FIREBASE_API_KEY,
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    import.meta.env.VITE_FIREBASE_PROJECT_ID,
    import.meta.env.VITE_FIREBASE_APP_ID,
  ];
  return required.every((v) => typeof v === 'string' && v.trim().length > 0);
}

export default function App() {
  const [resumeData, setResumeData] = useState<ResumeData>(initialData);
  const [selectedTemplate, setSelectedTemplate] = useState<AnyTemplateId>('modern');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [activeTab, setActiveTab] = useState('build');
  const [previewScale, setPreviewScale] = useState(0.75);
  const [fitScale, setFitScale] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingError, setBillingError] = useState<string>('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const hasAIPlan = useMemo(() => {
    return billing?.plan !== 'free' && billing?.subscriptionStatus === 'active';
  }, [billing]);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);

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
      const width = el.clientWidth || 0;
      const paddingAllowance = isMobile ? 18 : 24;
      const usable = Math.max(0, width - paddingAllowance);
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

  const loadBillingStatus = useCallback(async () => {
    setIsLoadingBilling(true);
    setBillingError('');

    try {
      if (!isFirebaseConfigured()) {
        setBilling({
          plan: 'free',
          subscriptionStatus: 'inactive',
          used: 0,
          limit: 0,
          freeResumeUsed: false,
          freeCoverUsed: false,
          pendingPlan: null,
          pendingPaystackReference: null,
        });
        return;
      }

      const auth = getFirebaseAuth();
      if (!auth.currentUser) {
        setBilling({
          plan: 'free',
          subscriptionStatus: 'inactive',
          used: 0,
          limit: 0,
          freeResumeUsed: false,
          freeCoverUsed: false,
          pendingPlan: null,
          pendingPaystackReference: null,
        });
        return;
      }

      const token = await auth.currentUser.getIdToken();
      const res = await fetch('/.netlify/functions/get-billing-status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setBillingError(payload?.error || 'Could not verify billing status.');
        return;
      }

      setBilling(payload as BillingStatus);
    } catch (e: any) {
      setBillingError(e?.message || 'Could not verify billing status.');
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname || '';
    if (path.includes('/billing/success')) {
      loadBillingStatus();
    }
  }, [loadBillingStatus]);

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
  ];

  const renderTemplate = () => {
    const props = { data: resumeData, colorTheme: selectedColor };
    switch (selectedTemplate) {
      case 'modern': return <ModernTemplate {...props} />;
      case 'professional': return <ProfessionalTemplate data={resumeData} />;
      case 'creative': return <CreativeTemplate data={resumeData} />;
      case 'minimalist': return <MinimalistTemplate data={resumeData} />;
      case 'ats-pro': return <ATSProTemplate data={resumeData} colorTheme={selectedColor} />;
      case 'executive': return <ExecutiveTemplate data={resumeData} colorTheme={selectedColor} />;
      case 'tech-stack': return <TechStackTemplate data={resumeData} colorTheme={selectedColor} />;
      default: return <ModernTemplate {...props} />;
    }
  };

  const renderTemplateThumbnail = (id: AnyTemplateId) => {
    const isPremium = id === 'ats-pro' || id === 'executive' || id === 'tech-stack';

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
        default: return <ModernTemplate {...props} />;
      }
    })();

    return (
      <div className="h-full w-full overflow-hidden bg-white">
        <div className="origin-top-left pointer-events-none select-none" style={{ transform: 'scale(0.18)' }}>
          {thumb}
        </div>
      </div>
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

  const handleExport = useCallback(() => {
    const el = previewRef.current;
    if (!el) {
      alert('Preview not ready yet. Please try again.');
      return;
    }

    setIsPrinting(true);

    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules).map((rule) => rule.cssText).join('\n');
        } catch {
          return sheet.href ? `@import url("${sheet.href}");` : '';
        }
      })
      .join('\n');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
      setIsPrinting(false);
      return;
    }

    printWindow.document.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${fileSafeName}</title>
  <style>
    ${styles}
    @page { size: A4; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { margin: 0; padding: 0; background: white; }
    body > div { box-shadow: none !important; border-radius: 0 !important; }
  </style>
</head>
<body>
  ${el.outerHTML}
  <script>
    window.onload = function () {
      setTimeout(function () {
        window.print();
        window.close();
      }, 400);
    };
  </script>
</body>
</html>
    `);

    printWindow.document.close();
    setIsPrinting(false);
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
        const paystackMsg =
          payload?.paystack_message ||
          payload?.details?.message ||
          payload?.details?.data?.message;

        const details =
          paystackMsg ||
          payload?.error ||
          payload?.details ||
          'Could not start checkout. Please try again.';

        setBillingError(typeof details === 'string' ? details : JSON.stringify(details));
        setIsRedirecting(false);
        return;
      }

      const url = payload?.authorization_url as string | undefined;
      if (!url) {
        setBillingError('Checkout link missing from server response.');
        setIsRedirecting(false);
        return;
      }

      window.location.assign(url);
    } catch (e: any) {
      setBillingError(e?.message || 'Checkout error. Please try again.');
      setIsRedirecting(false);
    }
  };

  const finalScale = isMobile ? fitScale * previewScale : previewScale;
  const ZOOM_MIN = isMobile ? 0.7 : 0.5;
  const ZOOM_MAX = isMobile ? 1.6 : 1.0;
  const ZOOM_STEP = 0.1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-sky-50/50 to-slate-50">
      {/* NAVIGATION (matched to varsity page structure/classes) */}
      <nav className="main-nav">
        {/* DESKTOP VIEW */}
        <a href="/index.html" className="logo desktop-nav">
          Career Unified
        </a>

        <div className="nav-links desktop-nav">
          <a href="/jobs.html">Jobs</a>
          <a href="/bursaries.html">Bursaries</a>
          <a href="/varsity.html">Varsity</a>
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
          {/* Clickable Logo */}
          <a href="/index.html" className="mobile-logo">
            Career Unified
          </a>

          <div className="mobile-nav-right">
            {/* Account Icon - Direct Link */}
            <a href="/account-page.html" className="icon-btn" aria-label="My Account">
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </a>

            {/* Menu Icon */}
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
      <div
        className="mobile-menu"
        id="mobileMenu"
        style={{ display: mobileMenuOpen ? 'block' : 'none' }}
      >
        <a href="/jobs.html">Jobs</a>
        <a href="/bursaries.html">Bursaries</a>
        <a href="/varsity.html">Varsity</a>
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Panel */}
          <div className="lg:col-span-5">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
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
                  <div className="pr-4 space-y-6">
                    <div>
                      <h2 className="text-2xl mb-2">Premium Templates</h2>
                      <p className="text-sm text-gray-600 mb-6">
                        Choose from professionally designed templates optimized for ATS systems
                      </p>
                      <div className="text-xs text-slate-600">
                        {isLoadingBilling ? (
                          'Checking your plan…'
                        ) : hasAIPlan ? (
                          'AI Plan active — premium templates unlocked ✅'
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
                              <CardContent className="p-6">
                                <div className="aspect-[8.5/11] bg-white rounded-lg mb-4 shadow-inner overflow-hidden border">
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
                    <AITailor data={resumeData} onApplySuggestions={setResumeData} />
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
                    <ResumeVersions currentData={resumeData} onLoadVersion={setResumeData} />
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel - Preview */}
          <div className="lg:col-span-7">
            <div className="lg:sticky lg:top-24">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                  <h2 className="text-xl">Live Preview</h2>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
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

              <Card className="shadow-2xl overflow-hidden border-2 border-blue-100">
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-260px)] lg:h-[calc(100vh-220px)]">
                    <div
                      ref={previewWrapRef}
                      className="flex justify-center p-3 sm:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-gray-100"
                    >
                      <div
                        style={{
                          width: TEMPLATE_CANVAS_WIDTH * finalScale,
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock AI Templates</DialogTitle>
            <DialogDescription>
              These templates are available with the AI plan. Upgrade to unlock AI templates and AI Tailor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm text-slate-700">
            <ul className="list-disc pl-5 space-y-1">
              <li>Access premium AI-optimized resume templates</li>
              <li>AI Tailor suggestions matched to job descriptions</li>
              <li>Faster editing with smarter formatting</li>
            </ul>

            {billingError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-xs">
                {billingError}
              </div>
            ) : null}

            <div className="grid md:grid-cols-3 gap-3">
              <Button className="w-full" disabled={isRedirecting} onClick={() => startSubscription('starter')}>
                Starter
              </Button>
              <Button className="w-full" disabled={isRedirecting} onClick={() => startSubscription('job_seeker')}>
                Job Seeker
              </Button>
              <Button className="w-full" disabled={isRedirecting} onClick={() => startSubscription('career_pro')}>
                Career Pro
              </Button>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setShowUpgradeModal(false)}>
              Not now
            </Button>

            {import.meta.env.DEV ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setBilling({
                    plan: 'starter',
                    subscriptionStatus: 'active',
                    used: 0,
                    limit: 5,
                    freeResumeUsed: false,
                    freeCoverUsed: false,
                    pendingPlan: null,
                    pendingPaystackReference: null,
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
    </div>
  );
}
