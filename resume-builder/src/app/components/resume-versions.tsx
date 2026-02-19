import { useState } from 'react';
import { Plus, Copy, Trash2, FileText, Clock, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
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

interface ResumeVersion {
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
}

export function ResumeVersions({ currentData, onLoadVersion }: ResumeVersionsProps) {
  const [versions, setVersions] = useState<ResumeVersion[]>([
    {
      id: '1',
      name: 'Software Engineer - Tech Corp',
      data: currentData,
      createdAt: new Date('2026-02-15'),
      updatedAt: new Date('2026-02-17'),
      isFavorite: true,
    },
    {
      id: '2',
      name: 'Full Stack Developer - Startup',
      data: currentData,
      createdAt: new Date('2026-02-10'),
      updatedAt: new Date('2026-02-16'),
      isFavorite: false,
    },
  ]);
  const [newVersionName, setNewVersionName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const saveNewVersion = () => {
    if (!newVersionName.trim()) return;

    const newVersion: ResumeVersion = {
      id: Date.now().toString(),
      name: newVersionName,
      data: { ...currentData },
      createdAt: new Date(),
      updatedAt: new Date(),
      isFavorite: false,
    };

    setVersions([newVersion, ...versions]);
    setNewVersionName('');
    setIsDialogOpen(false);
  };

  const deleteVersion = (id: string) => {
    setVersions(versions.filter((v) => v.id !== id));
  };

  const toggleFavorite = (id: string) => {
    setVersions(
      versions.map((v) => (v.id === id ? { ...v, isFavorite: !v.isFavorite } : v))
    );
  };

  const duplicateVersion = (version: ResumeVersion) => {
    const duplicated: ResumeVersion = {
      ...version,
      id: Date.now().toString(),
      name: `${version.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setVersions([duplicated, ...versions]);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <CardTitle>Resume Versions</CardTitle>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
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
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveNewVersion} className="bg-blue-600 hover:bg-blue-700">
                  Save Version
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {versions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No saved versions yet</p>
              <p className="text-xs mt-1">Save different versions for various job applications</p>
            </div>
          ) : (
            versions.map((version, index) => (
              <motion.div
                key={version.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-100">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFavorite(version.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              version.isFavorite
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-400'
                            }`}
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onLoadVersion(version.data)}
                          className="h-8 px-3"
                        >
                          Load
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => duplicateVersion(version)}
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteVersion(version.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        {versions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-gray-500 text-center">
              Manage multiple resume versions for different job applications
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}