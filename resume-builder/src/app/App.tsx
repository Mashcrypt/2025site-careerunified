import { useMemo, useRef, useState } from 'react';
import {
  FileText,
  Wand2,
  Eye,
  Download,
  Palette,
  BarChart3,
  FolderOpen,
  Upload,
  Menu,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { ScrollArea } from './components/ui/scroll-area';
import { Badge } from './components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from './components/ui/sheet';
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

export default function App() {
  const [resumeData, setResumeData] = useState<ResumeData>(initialData);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('modern');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [activeTab, setActiveTab] = useState('build');
  const [previewScale, setPreviewScale] = useState(0.75);

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
    id: TemplateType;
    name: string;
    description: string;
    category: string;
  }[] = [
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

  const handleExport = async () => {
    const el = previewRef.current;
    if (!el) {
      alert('Preview not ready yet. Please try again.');
      return;
    }

    // Lazy-load libraries so the app stays fast
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,

      // ✅ Fix: html2canvas doesn't support oklch() / some gradients (Tailwind v4)
      // We clone the DOM and strip gradient + OKLCH backgrounds before capture.
      onclone: (clonedDoc) => {
        try {
          clonedDoc.documentElement.style.background = '#ffffff';
          clonedDoc.body.style.background = '#ffffff';

          const win = clonedDoc.defaultView;
          if (!win) return;

          clonedDoc.querySelectorAll('*').forEach((node) => {
            const element = node as HTMLElement;
            const style = win.getComputedStyle(element);

            const bgImg = style.backgroundImage || '';
            const bg = style.background || '';
            const color = style.color || '';
            const borderColor = style.borderColor || '';

            // If any computed styles include oklch(), remove risky backgrounds.
            const hasOklch =
              bg.includes('oklch(') ||
              bgImg.includes('oklch(') ||
              color.includes('oklch(') ||
              borderColor.includes('oklch(');

            const hasGradient = bgImg.includes('gradient');

            if (hasGradient || hasOklch) {
              element.style.backgroundImage = 'none';
              // Keep it readable: default to white background if it had gradients
              element.style.backgroundColor = '#ffffff';
            }
          });
        } catch {
          // If anything goes wrong in clone, do nothing.
          // Better to attempt export than block the user.
        }
      },
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
      {/* Career Unified Header */}
      <header className="sticky top-0 z-50 bg-[#1e3a8a] text-white shadow">
        <div className="mx-auto max-w-[1400px] px-5 py-4 flex items-center justify-between">
          <a href="/index.html" className="text-2xl font-bold tracking-tight">
            Career Unified
          </a>

          <nav className="hidden lg:flex items-center gap-8 text-[15px] font-semibold">
            <a className="hover:opacity-90" href="/jobs.html">
              Jobs
            </a>
            <a className="hover:opacity-90" href="/bursaries.html">
              Bursaries
            </a>
            <a className="hover:opacity-90" href="/varsity.html">
              Varsity
            </a>
            <a className="hover:opacity-90" href="/cv-generator/">
              Generate CV
            </a>
            <a className="hover:opacity-90" href="/recruiter-dashboard.html">
              Recruiter Dashboard
            </a>
            <a className="hover:opacity-90" href="/recruiter-apply.html">
              Apply as Recruiter
            </a>
            <a className="hover:opacity-90" href="/saved-items.html">
              Saved Items
            </a>
            <a className="hover:opacity-90" href="/signup.html">
              Sign Up
            </a>
            <a className="hover:opacity-90" href="/login.html">
              Login
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {/* Desktop download */}
            <button
              onClick={handleExport}
              className="hidden lg:inline-flex bg-white text-[#1e3a8a] font-semibold px-4 py-2 rounded-lg hover:opacity-90"
            >
              Download PDF
            </button>

            {/* Mobile menu with export */}
            <Sheet>
              <SheetTrigger asChild className="lg:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent text-white border-white/40 hover:bg-white/10"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <div className="flex flex-col gap-4 mt-8">
                  <Button variant="outline" onClick={() => setActiveTab('versions')}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Versions
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('analytics')}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Button>
                  <Button onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

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
                      {templates.map((template, index) => (
                        <motion.div
                          key={template.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <Card
                            className={`cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 ${
                              selectedTemplate === template.id ? 'ring-2 ring-blue-500 shadow-xl' : ''
                            }`}
                            onClick={() => setSelectedTemplate(template.id)}
                          >
                            <CardContent className="p-6">
                              <div className="aspect-[8.5/11] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg mb-4 flex items-center justify-center shadow-inner overflow-hidden">
                                {template.id === 'modern' && (
                                  <div className="w-full h-full p-4">
                                    <div className="border-b-2 border-blue-500 pb-2 mb-2">
                                      <div className="h-3 bg-gray-800 w-3/4 rounded mb-1"></div>
                                      <div className="h-2 bg-gray-600 w-1/2 rounded"></div>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="h-2 bg-gray-400 w-full rounded"></div>
                                      <div className="h-2 bg-gray-400 w-5/6 rounded"></div>
                                    </div>
                                  </div>
                                )}

                                {template.id === 'professional' && (
                                  <div className="w-full h-full flex">
                                    <div className="w-1/3 bg-gray-800 p-2">
                                      <div className="h-2 bg-white w-full rounded mb-1"></div>
                                      <div className="h-1 bg-gray-400 w-3/4 rounded"></div>
                                    </div>
                                    <div className="flex-1 p-2">
                                      <div className="h-2 bg-gray-800 w-3/4 rounded mb-2"></div>
                                      <div className="space-y-1">
                                        <div className="h-1 bg-gray-400 w-full rounded"></div>
                                        <div className="h-1 bg-gray-400 w-5/6 rounded"></div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {template.id === 'creative' && (
                                  <div className="w-full h-full bg-gradient-to-br from-purple-200 via-pink-200 to-orange-200 p-4">
                                    <div className="h-3 bg-gradient-to-r from-purple-600 to-pink-600 w-3/4 rounded mb-2"></div>
                                    <div className="space-y-1">
                                      <div className="h-2 bg-purple-400 w-full rounded"></div>
                                      <div className="h-2 bg-pink-400 w-5/6 rounded"></div>
                                    </div>
                                  </div>
                                )}

                                {template.id === 'minimalist' && (
                                  <div className="w-full h-full p-4 bg-white">
                                    <div className="border-b border-gray-800 pb-2 mb-2 text-center">
                                      <div className="h-2 bg-gray-800 w-1/2 mx-auto rounded"></div>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="h-1 bg-gray-400 w-full rounded"></div>
                                      <div className="h-1 bg-gray-400 w-5/6 rounded"></div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <h3 className="font-semibold mb-1">{template.name}</h3>
                                  <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {template.category}
                                  </Badge>
                                </div>
                                {selectedTemplate === template.id && (
                                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                                    <Badge className="bg-blue-600">Selected</Badge>
                                  </motion.div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    {/* Color Theme Section */}
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
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                  <h2 className="text-xl">Live Preview</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-blue-100">
                    <button
                      onClick={() => setPreviewScale(Math.max(0.5, previewScale - 0.1))}
                      className="text-gray-600 hover:text-blue-600 transition-colors"
                    >
                      <span className="text-lg">-</span>
                    </button>
                    <span className="text-sm font-medium min-w-[3rem] text-center">
                      {Math.round(previewScale * 100)}%
                    </span>
                    <button
                      onClick={() => setPreviewScale(Math.min(1, previewScale + 0.1))}
                      className="text-gray-600 hover:text-blue-600 transition-colors"
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
                  <ScrollArea className="h-[calc(100vh-220px)]">
                    <div className="flex justify-center p-8 bg-gradient-to-br from-gray-50 to-gray-100">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: previewScale }}
                        transition={{ duration: 0.3 }}
                        className="origin-top"
                      >
                        {/* Export ref goes on wrapper so we export the resume HTML */}
                        <div ref={previewRef}>{renderTemplate()}</div>
                      </motion.div>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
