import type { ResumeData } from '../types/resume';
import { Mail, Phone, MapPin, Linkedin, Globe } from 'lucide-react';

interface ProfessionalTemplateProps {
  data: ResumeData;
}

export function ProfessionalTemplate({ data }: ProfessionalTemplateProps) {
  return (
    <div className="bg-white p-12 shadow-lg rounded-lg min-h-[1056px] w-[816px]">
      <div className="grid grid-cols-3 gap-8">
        {/* Left Column - Sidebar */}
        <div className="col-span-1 bg-gray-800 text-white p-6 -m-12 mr-0 rounded-l-lg">
          <div className="space-y-6">
            {/* Contact */}
            <div>
              <h3 className="text-sm uppercase tracking-wider mb-3 border-b border-gray-600 pb-2">
                Contact
              </h3>
              <div className="space-y-2 text-sm">
                {data.personalInfo.email && (
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="break-all">{data.personalInfo.email}</span>
                  </div>
                )}
                {data.personalInfo.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{data.personalInfo.phone}</span>
                  </div>
                )}
                {data.personalInfo.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{data.personalInfo.location}</span>
                  </div>
                )}
                {data.personalInfo.linkedin && (
                  <div className="flex items-start gap-2">
                    <Linkedin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="break-all">{data.personalInfo.linkedin}</span>
                  </div>
                )}
                {data.personalInfo.website && (
                  <div className="flex items-start gap-2">
                    <Globe className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span className="break-all">{data.personalInfo.website}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            {data.skills.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-wider mb-3 border-b border-gray-600 pb-2">
                  Skills
                </h3>
                <div className="space-y-1 text-sm">
                  {data.skills.map((skill, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                      <span>{skill}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {data.education.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-wider mb-3 border-b border-gray-600 pb-2">
                  Education
                </h3>
                {data.education.map((edu) => (
                  <div key={edu.id} className="mb-4 text-sm">
                    <p className="font-medium">{edu.degree}</p>
                    <p className="text-gray-300 text-xs mt-1">{edu.institution}</p>
                    <p className="text-gray-400 text-xs">{edu.graduationDate}</p>
                    {edu.gpa && <p className="text-gray-300 text-xs">GPA: {edu.gpa}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Main Content */}
        <div className="col-span-2">
          {/* Name */}
          <div className="mb-8">
            <h1 className="text-4xl text-gray-800 mb-2">
              {data.personalInfo.fullName || 'Your Name'}
            </h1>
            {data.personalInfo.summary && (
              <p className="text-gray-600 text-sm leading-relaxed mt-4">
                {data.personalInfo.summary}
              </p>
            )}
          </div>

          {/* Experience */}
          {data.experience.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg uppercase tracking-wider text-gray-800 border-b-2 border-gray-300 pb-2 mb-4">
                Experience
              </h2>
              {data.experience.map((exp) => (
                <div key={exp.id} className="mb-6">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-base text-gray-800">{exp.position}</h3>
                    <span className="text-sm text-gray-500">
                      {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {exp.company} • {exp.location}
                  </p>
                  <div className="text-sm text-gray-700 whitespace-pre-line">
                    {exp.description}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {data.projects && data.projects.length > 0 && (
            <div>
              <h2 className="text-lg uppercase tracking-wider text-gray-800 border-b-2 border-gray-300 pb-2 mb-4">
                Projects
              </h2>
              {data.projects.map((proj) => (
                <div key={proj.id} className="mb-4">
                  <h3 className="text-base text-gray-800">{proj.name}</h3>
                  {proj.link && (
                    <p className="text-sm text-blue-600">{proj.link}</p>
                  )}
                  <p className="text-sm text-gray-700 mt-1">{proj.description}</p>
                  {proj.technologies.length > 0 && (
                    <p className="text-xs text-gray-600 mt-1">
                      {proj.technologies.join(' • ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
