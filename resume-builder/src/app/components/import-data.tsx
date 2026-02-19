import { useState } from 'react';
import { Upload, Linkedin, FileJson, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import type { ResumeData } from '../types/resume';
import { motion } from 'motion/react';

interface ImportDataProps {
  onImport: (data: ResumeData) => void;
}

export function ImportData({ onImport }: ImportDataProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  const handleLinkedInImport = async () => {
    setIsImporting(true);
    setImportSuccess(false);

    // Simulate LinkedIn import - In production, you'd use LinkedIn API
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockLinkedInData: ResumeData = {
      personalInfo: {
        fullName: 'Sarah Johnson',
        email: 'sarah.johnson@email.com',
        phone: '+1 (555) 123-4567',
        location: 'San Francisco, CA',
        linkedin: 'linkedin.com/in/sarahjohnson',
        website: 'sarahjohnson.dev',
        summary:
          'Experienced software engineer with 5+ years of expertise in full-stack development. Passionate about building scalable applications and mentoring junior developers.',
      },
      experience: [
        {
          id: '1',
          position: 'Senior Software Engineer',
          company: 'Tech Innovations Inc',
          location: 'San Francisco, CA',
          startDate: 'Jan 2021',
          endDate: 'Present',
          current: true,
          description:
            '• Led development of microservices architecture serving 2M+ users\n• Improved application performance by 45% through optimization\n• Mentored team of 4 junior developers',
        },
        {
          id: '2',
          position: 'Software Engineer',
          company: 'StartupXYZ',
          location: 'San Francisco, CA',
          startDate: 'Jun 2019',
          endDate: 'Dec 2020',
          current: false,
          description:
            '• Developed RESTful APIs using Node.js and Express\n• Collaborated with design team to implement responsive UI\n• Reduced API response time by 30%',
        },
      ],
      education: [
        {
          id: '1',
          degree: 'Bachelor of Science in Computer Science',
          institution: 'Stanford University',
          location: 'Stanford, CA',
          graduationDate: 'May 2019',
          gpa: '3.8/4.0',
        },
      ],
      skills: [
        'JavaScript',
        'TypeScript',
        'React',
        'Node.js',
        'Python',
        'AWS',
        'Docker',
        'PostgreSQL',
        'MongoDB',
        'Git',
      ],
      projects: [
        {
          id: '1',
          name: 'E-commerce Platform',
          description:
            'Built a full-stack e-commerce platform with payment integration, inventory management, and admin dashboard',
          technologies: ['React', 'Node.js', 'PostgreSQL', 'Stripe'],
          link: 'github.com/sarah/ecommerce',
        },
      ],
    };

    onImport(mockLinkedInData);
    setIsImporting(false);
    setImportSuccess(true);

    setTimeout(() => setImportSuccess(false), 3000);
  };

  const handleJSONImport = () => {
    try {
      const parsedData = JSON.parse(jsonInput);
      onImport(parsedData);
      setImportSuccess(true);
      setJsonInput('');
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (error) {
      alert('Invalid JSON format. Please check your input.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-purple-600" />
          <CardTitle>Import Data</CardTitle>
        </div>
        <CardDescription>
          Quickly populate your resume from existing sources
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="linkedin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <TabsContent value="linkedin" className="space-y-4">
            <div className="text-center py-6">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Linkedin className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="font-medium mb-2">Import from LinkedIn</h3>
              <p className="text-sm text-gray-600 mb-4">
                Automatically populate your resume with your LinkedIn profile data
              </p>
              <Button
                onClick={handleLinkedInImport}
                disabled={isImporting || importSuccess}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : importSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Imported Successfully!
                  </>
                ) : (
                  <>
                    <Linkedin className="h-4 w-4 mr-2" />
                    Import from LinkedIn
                  </>
                )}
              </Button>

              {importSuccess && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg"
                >
                  <p className="text-sm text-green-800">
                    LinkedIn data imported successfully! Review and customize your resume.
                  </p>
                </motion.div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="text-blue-900">
                <strong>Note:</strong> This is a demo import. In production, connect your LinkedIn
                API credentials to enable real profile imports.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="json" className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Paste your resume data in JSON format below
              </p>
              <Textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"personalInfo": {"fullName": "John Doe", ...}, ...}'
                rows={8}
                className="font-mono text-sm"
              />
            </div>
            <Button
              onClick={handleJSONImport}
              disabled={!jsonInput.trim() || importSuccess}
              className="w-full"
            >
              {importSuccess ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Imported Successfully!
                </>
              ) : (
                <>
                  <FileJson className="h-4 w-4 mr-2" />
                  Import JSON Data
                </>
              )}
            </Button>

            {importSuccess && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-green-50 border border-green-200 rounded-lg"
              >
                <p className="text-sm text-green-800">
                  JSON data imported successfully!
                </p>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
