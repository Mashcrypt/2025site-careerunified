import { useState, useEffect } from 'react';
import { Lightbulb, X, TrendingUp, Award, Target, Zap } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import type { ResumeData } from '../types/resume';
import { motion, AnimatePresence } from 'motion/react';

interface SmartTipsProps {
  data: ResumeData;
}

const tipsDatabase = [
  {
    icon: Award,
    title: 'Quantify Your Achievements',
    description: 'Use numbers and metrics to show impact. Example: "Increased sales by 30%" instead of "Improved sales"',
    condition: (data: ResumeData) => 
      data.experience.some(exp => !exp.description.match(/\d+%|\d+\+|[0-9]/)),
  },
  {
    icon: Target,
    title: 'Use Action Verbs',
    description: 'Start bullet points with strong action verbs like "Led", "Developed", "Managed", or "Achieved"',
    condition: (data: ResumeData) => 
      data.experience.length > 0,
  },
  {
    icon: Zap,
    title: 'Keep It Concise',
    description: 'Aim for 1-2 pages. Remove outdated experiences and focus on recent, relevant achievements',
    condition: (data: ResumeData) => 
      data.experience.length > 5,
  },
  {
    icon: TrendingUp,
    title: 'Add Technical Skills',
    description: 'List specific tools, languages, and technologies. ATS systems often scan for these keywords',
    condition: (data: ResumeData) => 
      data.skills.length < 6,
  },
  {
    icon: Award,
    title: 'Include Projects',
    description: 'Showcase side projects or portfolio work. This demonstrates initiative and practical skills',
    condition: (data: ResumeData) => 
      !data.projects || data.projects.length === 0,
  },
  {
    icon: Target,
    title: 'Tailor Your Summary',
    description: 'Your professional summary should be customized for each job application to highlight relevant experience',
    condition: (data: ResumeData) => 
      !data.personalInfo.summary || data.personalInfo.summary.length < 100,
  },
];

export function SmartTips({ data }: SmartTipsProps) {
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [relevantTips, setRelevantTips] = useState<typeof tipsDatabase>([]);

  useEffect(() => {
    // Filter tips based on current resume data
    const applicable = tipsDatabase.filter(tip => tip.condition(data));
    setRelevantTips(applicable);
    setCurrentTipIndex(0);
    setIsDismissed(false);
  }, [data]);

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
