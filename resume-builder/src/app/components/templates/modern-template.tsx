import type { ResumeData } from '../types/resume';
import { Mail, Phone, MapPin, Linkedin, Globe, CarFront } from 'lucide-react';

interface ModernTemplateProps {
  data: ResumeData;
  colorTheme?: string;
}

export function ModernTemplate({ data, colorTheme = 'blue' }: ModernTemplateProps) {
  const getThemeColors = () => {
    const themes: Record<string, { border: string; text: string; bg: string; badge: string }> = {
      blue: { border: 'border-blue-600', text: 'text-blue-600', bg: 'bg-blue-100', badge: 'bg-blue-100 text-blue-800' },
      purple: { border: 'border-purple-600', text: 'text-purple-600', bg: 'bg-purple-100', badge: 'bg-purple-100 text-purple-800' },
      emerald: { border: 'border-emerald-600', text: 'text-emerald-600', bg: 'bg-emerald-100', badge: 'bg-emerald-100 text-emerald-800' },
      rose: { border: 'border-rose-600', text: 'text-rose-600', bg: 'bg-rose-100', badge: 'bg-rose-100 text-rose-800' },
      amber: { border: 'border-amber-600', text: 'text-amber-600', bg: 'bg-amber-100', badge: 'bg-amber-100 text-amber-800' },
      slate: { border: 'border-slate-600', text: 'text-slate-600', bg: 'bg-slate-100', badge: 'bg-slate-100 text-slate-800' },
      cyan: { border: 'border-cyan-600', text: 'text-cyan-600', bg: 'bg-cyan-100', badge: 'bg-cyan-100 text-cyan-800' },
      indigo: { border: 'border-indigo-600', text: 'text-indigo-600', bg: 'bg-indigo-100', badge: 'bg-indigo-100 text-indigo-800' },
    };
    return themes[colorTheme] || themes.blue;
  };

  const colors = getThemeColors();

  return (
    <div className="bg-white p-12 shadow-lg rounded-lg min-h-[1056px] w-[816px]">
      {/* Header */}
      <div className={`border-b-4 ${colors.border} pb-6`}>
        <h1 className="text-4xl mb-2">{data.personalInfo.fullName || 'Your Name'}</h1>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {data.personalInfo.email && (
            <div className="flex items-center gap-1">
              <Mail className="h-4 w-4" />
              {data.personalInfo.email}
            </div>
          )}
          {data.personalInfo.phone && (
            <div className="flex items-center gap-1">
              <Phone className="h-4 w-4" />
              {data.personalInfo.phone}
            </div>
          )}
          {data.personalInfo.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {data.personalInfo.location}
            </div>
          )}
          {data.personalInfo.linkedin && (
            <div className="flex items-center gap-1">
              <Linkedin className="h-4 w-4" />
              {data.personalInfo.linkedin}
            </div>
          )}
          {data.personalInfo.website && (
            <div className="flex items-center gap-1">
              <Globe className="h-4 w-4" />
              {data.personalInfo.website}
            </div>
          )}
          {data.personalInfo.driversLicense && (
            <div className="flex items-center gap-1">
              <CarFront className="h-4 w-4" />
              {data.personalInfo.driversLicense}
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {data.personalInfo.summary && (
        <div className="mt-6">
          <h2 className={`text-xl ${colors.text} mb-3`}>PROFESSIONAL SUMMARY</h2>
          <p className="text-gray-700 leading-relaxed">{data.personalInfo.summary}</p>
        </div>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mt-6">
          <h2 className={`text-xl ${colors.text} mb-3`}>WORK EXPERIENCE</h2>
          {data.experience.map((exp) => (
            <div key={exp.id} className="mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg">{exp.position}</h3>
                  <p className="text-gray-600">{exp.company}</p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p>{exp.location}</p>
                  <p>
                    {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                  </p>
                </div>
              </div>
              <div className="mt-2 text-gray-700 whitespace-pre-line">{exp.description}</div>
            </div>
          ))}
        </div>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <div className="mt-6">
          <h2 className={`text-xl ${colors.text} mb-3`}>EDUCATION</h2>
          {data.education.map((edu) => (
            <div key={edu.id} className="mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg">{edu.degree}</h3>
                  <p className="text-gray-600">{edu.institution}</p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p>{edu.location}</p>
                  <p>{edu.graduationDate}</p>
                  {edu.gpa && <p>GPA: {edu.gpa}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <div className="mt-6">
          <h2 className={`text-xl ${colors.text} mb-3`}>SKILLS</h2>
          <div className="flex flex-wrap gap-2">
            {data.skills.map((skill, index) => (
              <span
                key={index}
                className={`${colors.badge} px-3 py-1 rounded-full text-sm`}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      {data.projects && data.projects.length > 0 && (
        <div className="mt-6">
          <h2 className={`text-xl ${colors.text} mb-3`}>PROJECTS</h2>
          {data.projects.map((proj) => (
            <div key={proj.id} className="mb-4">
              <h3 className="text-lg">{proj.name}</h3>
              {proj.link && (
                <p className={`text-sm ${colors.text}`}>{proj.link}</p>
              )}
              <p className="text-gray-700 mt-1">{proj.description}</p>
              {proj.technologies.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Technologies:</span> {proj.technologies.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
