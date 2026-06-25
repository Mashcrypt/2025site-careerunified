import { useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Trash2, FileText, Clock, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import type { ResumeData } from '../types/resume';
import { motion } from 'motion/react';

interface ResumeVersionStored {
  id: string;
  name: string;
  data: ResumeData;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  isFavorite: boolean;
}

interface ResumeVersionUI {
  id: string;
  name: string;
  data: ResumeData;
  createdAt: Date;
  updatedAt: Date;
  isFavorite: boolean;
}

interface ResumeVersionsProps {
  currentData: ResumeData;
  onLoadVersion: (data: ResumeData) => void;
  refreshKey?: number;
}

export const RESUME_VERSIONS_STORAGE_KEY = 'careerunified_resume_versions_v1';

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions?/gi,
  /disregard\s+(?:all\s+)?previous\s+instructions?/gi,
  /forget\s+(?:all\s+)?previous\s+instructions?/gi,
  /override\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /reveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /print\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /do\s+not\s+follow\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)/gi,
  /prompt\s*injection/gi,
  /jailbreak/gi,
];

function sanitizeResumeString(value: string) {
  let sanitized = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\?(?:php)?[\s\S]*?\?>/gi, '')
    .replace(/<[^>]+>/g, '');

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized.trim();
}

export function sanitizeResumeVersionData(data: ResumeData): ResumeData {
  const clone = structuredCloneSafe(data);
  const personalInfo = Object.fromEntries(
    Object.entries(clone.personalInfo || {}).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeResumeString(value) : value,
    ])
  ) as ResumeData['personalInfo'];

  return {
    ...clone,
    personalInfo,
    experience: (clone.experience || []).map((item) => ({
      ...item,
      description: sanitizeResumeString(item.description || ''),
    })),
    skills: (clone.skills || []).map((skill) => sanitizeResumeString(skill)),
    certifications: (clone.certifications || []).map((certification) =>
      sanitizeResumeString(certification)
    ),
    projects: (clone.projects || []).map((project) => ({
      ...project,
      description: sanitizeResumeString(project.description || ''),
    })),
    additionalSections: (clone.additionalSections || []).map((section) => ({
      ...section,
      title: sanitizeResumeString(section.title || ''),
      items: (section.items || []).map((item) => sanitizeResumeString(item)),
    })),
  };
}

function toStored(v: ResumeVersionUI): ResumeVersionStored {
  return {
    id: v.id,
    name: v.name,
    data: sanitizeResumeVersionData(v.data),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    isFavorite: v.isFavorite,
  };
}

function fromStored(v: ResumeVersionStored): ResumeVersionUI {
  return {
    id: v.id,
    name: v.name,
    data: sanitizeResumeVersionData(v.data),
    createdAt: new Date(v.createdAt),
    updatedAt: new Date(v.updatedAt),
    isFavorite: v.isFavorite,
  };
}

function safeParseVersions(raw: string | null): ResumeVersionUI[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ResumeVersionStored[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(fromStored);
  } catch {
    return [];
  }
}

function saveVersionsToStorage(versions: ResumeVersionUI[]) {
  try {
    const payload = versions.map(toStored);
    localStorage.setItem(RESUME_VERSIONS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors (quota/private mode)
  }
}

// Called automatically after a successful CV import.
// Silently saves the imported CV so users never need to re-import on the same device.
export function autoSaveImportedCV(data: ResumeData): void {
  try {
    const raw = localStorage.getItem(RESUME_VERSIONS_STORAGE_KEY);
    const existing: ResumeVersionStored[] = raw ? JSON.parse(raw) : [];
    const validExisting = Array.isArray(existing) ? existing : [];

    const personName = data.personalInfo?.fullName?.trim() || '';
    const name = personName
      ? `${personName} — Imported ${new Date().toLocaleDateString('en-ZA')}`
      : `Imported CV — ${new Date().toLocaleDateString('en-ZA')}`;

    const now = new Date().toISOString();
    const newVersion: ResumeVersionStored = {
      id: `import-${Date.now()}`,
      name,
      data: sanitizeResumeVersionData(data),
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
    };

    // Remove previous auto-imports for the same person to avoid duplicates
    const filtered = validExisting.filter(
      (v) => !(v.id?.startsWith('import-') && v.name?.startsWith(personName || 'Imported CV'))
    );

    localStorage.setItem(RESUME_VERSIONS_STORAGE_KEY, JSON.stringify([newVersion, ...filtered]));
  } catch {
    // ignore storage errors
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function ResumeVersions({ currentData, onLoadVersion, refreshKey = 0 }: ResumeVersionsProps) {
  const [versions, setVersions] = useState<ResumeVersionUI[]>([]);
  const [newVersionName, setNewVersionName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Load from localStorage once
  useEffect(() => {
    const loaded = safeParseVersions(localStorage.getItem(RESUME_VERSIONS_STORAGE_KEY));

    // Seed only if nothing saved yet (first run)
    if (loaded.length === 0) {
      const seeded: ResumeVersionUI[] = [
        {
          id: 'seed-1',
          name: 'Software Engineer - Tech Corp',
          data: sanitizeResumeVersionData(currentData),
          createdAt: new Date(),
          updatedAt: new Date(),
          isFavorite: true,
        },
        {
          id: 'seed-2',
          name: 'Full Stack Developer - Startup',
          data: sanitizeResumeVersionData(currentData),
          createdAt: new Date(),
          updatedAt: new Date(),
          isFavorite: false,
        },
      ];
      setVersions(seeded);
      saveVersionsToStorage(seeded);
      return;
    }

    setVersions(loaded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Persist whenever versions change
  useEffect(() => {
    if (versions.length >= 0) saveVersionsToStorage(versions);
  }, [versions]);

  const sortedVersions = useMemo(() => {
    // Favorites first, then most recently updated
    return [...versions].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }, [versions]);

  const saveNewVersion = () => {
    const name = newVersionName.trim();
    if (!name) return;

    const now = new Date();
    const newVersion: ResumeVersionUI = {
      id: `${Date.now()}`,
      name,
      data: sanitizeResumeVersionData(currentData),
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
    };

    setVersions((prev) => [newVersion, ...prev]);
    setNewVersionName('');
    setIsDialogOpen(false);
  };

  const deleteVersion = (id: string) => {
    setVersions((prev) => prev.filter((v) => v.id !== id));
  };

  const toggleFavorite = (id: string) => {
    setVersions((prev) =>
      prev.map((v) => (v.id === id ? { ...v, isFavorite: !v.isFavorite } : v))
    );
  };

  const duplicateVersion = (version: ResumeVersionUI) => {
    const now = new Date();
    const duplicated: ResumeVersionUI = {
      ...version,
      id: `${Date.now()}`,
      name: `${version.name} (Copy)`,
      data: sanitizeResumeVersionData(version.data),
      createdAt: now,
      updatedAt: now,
      isFavorite: false,
    };
    setVersions((prev) => [duplicated, ...prev]);
  };

  const loadVersion = (version: ResumeVersionUI) => {
    // Mark "updatedAt" on load (so it floats up)
    setVersions((prev) =>
      prev.map((v) => (v.id === version.id ? { ...v, updatedAt: new Date() } : v))
    );
    onLoadVersion(sanitizeResumeVersionData(version.data));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <CardTitle>Resume Versions</CardTitle>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                type="button"
              >
                <Plus className="h-4 w-4 mr-2" />
                Save Version
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Current Resume</DialogTitle>
                <DialogDescription>
                  Create a new version of your resume. Perfect for tailoring to different job applications.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4">
                <Input
                  placeholder="e.g., Software Engineer - Google"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewVersion();
                  }}
                />
              </div>

              <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} type="button">
                  Cancel
                </Button>
                <Button onClick={saveNewVersion} className="bg-blue-600 hover:bg-blue-700" type="button">
                  Save Version
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          {sortedVersions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No saved versions yet</p>
              <p className="text-xs mt-1">Save different versions for various job applications</p>
            </div>
          ) : (
            sortedVersions.map((version, index) => (
              <motion.div
                key={version.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-md transition-shadow border-blue-100">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm truncate">{version.name}</h4>
                          {version.isFavorite && (
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(version.updatedAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFavorite(version.id)}
                          className="h-8 px-2"
                          title="Favorite"
                          type="button"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              version.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'
                            }`}
                          />
                          <span className="ml-2 sm:hidden">Favorite</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadVersion(version)}
                          className="h-8 px-3"
                          title="Load"
                          type="button"
                        >
                          Load
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateVersion(version)}
                          className="h-8 px-2"
                          title="Duplicate"
                          type="button"
                        >
                          <Copy className="h-4 w-4" />
                          <span className="ml-2 sm:hidden">Copy</span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteVersion(version.id)}
                          className="h-8 px-2 text-red-600 hover:text-red-700"
                          title="Delete"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="ml-2 sm:hidden">Delete</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        {sortedVersions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-gray-500 text-center">
              Versions are saved on this device (browser storage).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Use structuredClone when available; fallback to JSON clone.
 * (ResumeData should be plain objects/arrays/strings.)
 */
function structuredCloneSafe<T>(obj: T): T {
  // @ts-expect-error - structuredClone may not be typed depending on TS target
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj)) as T;
}
