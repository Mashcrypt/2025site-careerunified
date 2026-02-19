import { useState, useEffect } from 'react';
import { Target, CheckCircle2, AlertTriangle, XCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import type { ResumeData } from '../types/resume';
import { motion } from 'motion/react';

interface ATSScoreProps {
  data: ResumeData;
}

export function ATSScore({ data }: ATSScoreProps) {
  const [score, setScore] = useState(0);
  const [targetScore, setTargetScore] = useState(0);

  useEffect(() => {
    // Calculate ATS score based on resume completeness
    let calculatedScore = 0;

    // Personal info (20 points)
    if (data.personalInfo.fullName) calculatedScore += 5;
    if (data.personalInfo.email) calculatedScore += 5;
    if (data.personalInfo.phone) calculatedScore += 5;
    if (data.personalInfo.summary) calculatedScore += 5;

    // Experience (30 points)
    if (data.experience.length > 0) calculatedScore += 10;
    if (data.experience.length >= 2) calculatedScore += 10;
    if (data.experience.some((exp) => exp.description.length > 100)) calculatedScore += 10;

    // Education (20 points)
    if (data.education.length > 0) calculatedScore += 20;

    // Skills (20 points)
    if (data.skills.length > 3) calculatedScore += 10;
    if (data.skills.length >= 8) calculatedScore += 10;

    // Projects (10 points)
    if (data.projects && data.projects.length > 0) calculatedScore += 10;

    setTargetScore(calculatedScore);
  }, [data]);

  useEffect(() => {
    // Animate score change
    const timer = setInterval(() => {
      setScore((prev) => {
        if (prev < targetScore) {
          return Math.min(prev + 2, targetScore);
        }
        return prev;
      });
    }, 20);

    return () => clearInterval(timer);
  }, [targetScore]);

  const getScoreColor = () => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreLabel = () => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Work';
  };

  const getScoreBadgeColor = () => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getRecommendations = () => {
    const recommendations = [];
    
    if (!data.personalInfo.summary) {
      recommendations.push({ icon: XCircle, text: 'Add a professional summary', type: 'critical' });
    }
    if (data.experience.length === 0) {
      recommendations.push({ icon: XCircle, text: 'Add work experience', type: 'critical' });
    }
    if (data.skills.length < 8) {
      recommendations.push({ icon: AlertTriangle, text: 'Add more skills (target: 8-12)', type: 'warning' });
    }
    if (!data.projects || data.projects.length === 0) {
      recommendations.push({ icon: AlertTriangle, text: 'Add projects to stand out', type: 'warning' });
    }
    if (data.education.length === 0) {
      recommendations.push({ icon: XCircle, text: 'Add education details', type: 'critical' });
    }
    if (score >= 80) {
      recommendations.push({ icon: CheckCircle2, text: 'Resume is ATS-optimized!', type: 'success' });
    }

    return recommendations;
  };

  return (
    <Card className="border-2 border-blue-100 bg-gradient-to-br from-white to-blue-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            <CardTitle>ATS Score</CardTitle>
          </div>
          <Badge className={getScoreBadgeColor()}>
            {getScoreLabel()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score Display */}
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
            className="relative inline-block"
          >
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200"
              />
              <motion.circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                className={getScoreColor()}
                initial={{ strokeDasharray: '0 352' }}
                animate={{ strokeDasharray: `${(score / 100) * 352} 352` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-3xl ${getScoreColor()}`}>{score}</div>
                <div className="text-xs text-gray-600">/ 100</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Overall Completeness</span>
            <span className="font-medium">{score}%</span>
          </div>
          <Progress value={score} className="h-2" />
        </div>

        {/* Recommendations */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <h4 className="font-medium text-sm">Recommendations</h4>
          </div>
          <div className="space-y-2">
            {getRecommendations().map((rec, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-2 text-sm"
              >
                <rec.icon
                  className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                    rec.type === 'critical'
                      ? 'text-red-600'
                      : rec.type === 'warning'
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}
                />
                <span className="text-gray-700">{rec.text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-blue-100 rounded-lg p-4 text-sm">
          <p className="text-blue-900">
            <strong>Pro Tip:</strong> ATS systems scan for keywords, proper formatting, and complete information. Aim for a score above 80 for best results.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}