import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { ResumeData, TemplateType } from './types/resume';
import { motion } from 'motion/react';
import { southAfricanSampleData } from './utils/sample-data';

const initialData: ResumeData = southAfricanSampleData;

// ✅ Add new premium template ids without touching your shared TemplateType union.
// We'll keep selectedTemplate as TemplateType for the existing 4.
// Premium templates will show in the list but be locked (or can be wired later).
type PremiumTemplateId = 'ats-pro' | 'executive' | 'tech-stack';
type AnyTemplateId = TemplateType | PremiumTemplateId;

export default function App() {
  const [resumeData, setResumeData] = useState<ResumeData>(initialData);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('modern');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [activeTab, setActiveTab] = useState('build');

  // ✅ Default scale is lower on mobile so the resume fits the screen centered
  const [previewScale, setPreviewScale] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return 0.38;
    return 0.75;
  });

  // ✅ Monetization flag (wire this to your real billing/subscription later)
  const [hasAIPlan, setHasAIPlan] = useState(false);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ✅ Navbar mobile menu state (matches varsity.html behavior)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close menu when clicking outside (matches varsity.html script)
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

  // Export target (the resume preview)
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Safe filename for downloads
  const fileSafeName = useMemo(() => {
    const raw = (resumeData?.personalInfo?.fullName || 'CareerUnified-Resume').trim();
    return raw
      .replace(/[^a-z0-9\-\s_]/gi, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);
  }, [resumeData?.personalInfo?.fullName]);

  const templates: {
    id: AnyTemplateId;
    name: string;
    description: string;
    category: string;
    premium?: boolean;
  }[] = [
    // Free templates (existing)
    {
      id: 'modern',
      name: 'Modern',
      description: 'Clean and contemporary with bold accents',
      category: 'Popular',
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'Classic two-column layout for corporate roles',
      category: 'Corporate',
    },
    {
      id: 'creative',
      name: 'Creative',
      description: 'Bold gradient design for creative industries',
      category: 'Creative',
    },
    {
      id: 'minimalist',
      name: 'Minimalist',
      description: 'Simple and elegant typography-focused',
      category: 'Clean',
    },

    // Premium AI templates (locked unless hasAIPlan)
    {
      id: 'ats-pro',
      name: 'ATS Pro+ (AI)',
      description: 'AI-optimized, ATS-safe layout with strong hierarchy',
      category: 'AI Premium',
      premium: true,
    },
    {
      id: 'executive',
      name: 'Executive (AI)',
      description: 'Leadership-focused layout for managers and seniors',
      category: 'AI Premium',
      premium: true,
    },
    {
      id: 'tech-stack',
      name: 'Tech Stack (AI)',
      description: 'Project + skills layout optimized for tech roles',
      category: 'AI Premium',
      premium: true,
    },
  ];

  const renderTemplate = () => {
    const props = { data: resumeData, colorTheme: selectedColor };
    switch (selectedTemplate) {
      case 'modern':
        return <ModernTemplate {...props} />;
      case 'professional':
        return <ProfessionalTemplate data={resumeData} />;
      case 'creative':
        return <CreativeTemplate data={resumeData} />;
      case 'minimalist':
        return <MinimalistTemplate data={resumeData} />;
      default:
        return <ModernTemplate {...props} />;
    }
  };

  // ✅ Tiny thumbnail renderer (uses the same real templates)
  // IMPORTANT: This does NOT change your live preview. It only fills the card thumbnail area.
  const renderTemplateThumbnail = (id: AnyTemplateId) => {
    // Premium are locked right now (we display a nice placeholder thumbnail)
    if (id === 'ats-pro' || id === 'executive' || id === 'tech-stack') {
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

    // Free thumbnails: render the real template scaled down
    const thumb = (() => {
      const props = { data: resumeData, colorTheme: selectedColor };
      switch (id) {
        case 'modern':
          return <ModernTemplate {...props} />;
        case 'professional':
          return <ProfessionalTemplate data={resumeData} />;
        case 'creative':
          return <CreativeTemplate data={resumeData} />;
        case 'minimalist':
          return <MinimalistTemplate data={resumeData} />;
        default:
          return <ModernTemplate {...props} />;
      }
    })();

    return (
      <div className="h-full w-full overflow-hidden bg-white">
        {/* Scale down an A4 preview into the thumbnail box */}
        <div
          className="origin-top-left pointer-events-none select-none"
          style={{ transform: 'scale(0.18)' }}
        >
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

    // Only free templates can be selected right now because selectedTemplate is TemplateType.
    if (id === 'modern' || id === 'professional' || id === 'creative' || id === 'minimalist') {
      setSelectedTemplate(id);
    }
  };

  const handleExport = async () => {
    const el = previewRef.current;
    if (!el) {
      alert('Preview not ready yet. Please try again.');
      return;
    }

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${fileSafeName}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50/30 via-sky-50/50 to-slate-50">
      {/* ✅ NAVIGATION (matches varsity.html exactly) */}
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
          <a href="/saved-items.html"> Saved Items</a>
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
        <a href="/saved-items.html"> Saved Items</a>
        <a href="/signup.html">Sign Up</a>
        <a href="/login.html">Login</a>
      </div>

      <div className="container mx-auto px-4 lg:px-6 py-6 lg:py-8">
        {/* Smart Tips */}
        <div className="mb-6">
          <SmartTips data={resumeData} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Panel - Editor */}
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
                                {/* ✅ REAL THUMBNAIL PREVIEW (fixes blank cards) */}
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

                              {/* ✅ Locked overlay (only on premium + no plan) */}
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
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                  <h2 className="text-xl">Live Preview</h2>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={handleExport}
                    className="bg-white text-[#1e3a8a] border border-blue-200 hover:bg-blue-50"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>

                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-blue-100">
                    <button
                      onClick={() => setPreviewScale(Math.max(0.3, previewScale - 0.1))}
                      className="text-gray-600 hover:text-blue-600 transition-colors"
                      type="button"
                    >
                      <span className="text-lg">-</span>
                    </button>
                    <span className="text-sm font-medium min-w-[3rem] text-center">
                      {Math.round(previewScale * 100)}%
                    </span>
                    <button
                      onClick={() => setPreviewScale(Math.min(1, previewScale + 0.1))}
                      className="text-gray-600 hover:text-blue-600 transition-colors"
                      type="button"
                    >
                      <span className="text-lg">+</span>
                    </button>
                  </div>

                  <Badge variant="outline" className="bg-white shadow-sm border-blue-200">
                    {templates.find((t) => t.id === selectedTemplate)?.name}
                  </Badge>
                </div>
              </div>

              <Card className="shadow-2xl overflow-hidden border-2 border-blue-100">
                <CardContent className="p-0">
                  {/* ✅ MOBILE FIX: overflow-x-hidden prevents horizontal bleed */}
                  <ScrollArea className="h-[calc(100vh-220px)]">
                    <div className="flex justify-center items-start p-4 lg:p-8 bg-gradient-to-br from-gray-50 to-gray-100 overflow-x-hidden w-full min-h-full">
                      {/*
                        ✅ MOBILE FIX: Replaced motion.div animate scale with a plain div
                        using inline transform style. motion animate={{ scale }} does not
                        affect layout — the element still occupies full A4 width and gets
                        clipped/pushed off-screen on mobile. Using transformOrigin: 'top center'
                        with a regular style transform keeps the resume visually centered.
                      */}
                      <div
                        className="transition-transform duration-300 origin-top"
                        style={{
                          transform: `scale(${previewScale})`,
                          transformOrigin: 'top center',
                        }}
                      >
                        <div ref={previewRef}>{renderTemplate()}</div>
                      </div>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Modal (only for locked templates) */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock AI Templates</DialogTitle>
            <DialogDescription>
              These templates are available with the AI plan. Upgrade to unlock AI templates and AI Tailor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm text-slate-700">
            <ul className="list-disc pl-5 space-y-1">
              <li>Access premium AI-optimized resume templates</li>
              <li>AI Tailor suggestions matched to job descriptions</li>
              <li>Faster editing with smarter formatting</li>
            </ul>

            {/* Replace this button with your real billing route */}
            <Button
              className="w-full"
              onClick={() => {
                setShowUpgradeModal(false);
                alert('Hook this button to your billing page.');
              }}
            >
              Upgrade to AI Plan
            </Button>

            {/* Optional: dev unlock */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setHasAIPlan(true);
                setShowUpgradeModal(false);
              }}
            >
              (Dev) Unlock AI Plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
