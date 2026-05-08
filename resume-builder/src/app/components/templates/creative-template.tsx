import type { ResumeData } from '../types/resume';
import { Mail, Phone, MapPin, Linkedin, Globe, CarFront } from 'lucide-react';

interface CreativeTemplateProps {
  data: ResumeData;
}

export function CreativeTemplate({ data }: CreativeTemplateProps) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-12 shadow-lg rounded-lg min-h-[1056px] w-[816px]">
      {/* Header with colored accent */}
      <div className="relative">
        <div className="absolute -left-12 -top-12 w-40 h-40 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full opacity-20"></div>
        <div className="relative z-10">
          <h1 className="text-5xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            {data.personalInfo.fullName || 'Your Name'}
          </h1>
          <div className="flex flex-wrap gap-3 text-sm text-gray-700">
            {data.personalInfo.email && (
              <div className="flex items-center gap-1 bg-white/60 px-3 py-1 rounded-full">
                <Mail className="h-4 w-4 text-purple-600" />
                {data.personalInfo.email}
              </div>
            )}
            {data.personalInfo.phone && (
              <div className="flex items-center gap-1 bg-white/60 px-3 py-1 rounded-full">
                <Phone className="h-4 w-4 text-purple-600" />
                {data.personalInfo.phone}
              </div>
            )}
            {data.personalInfo.location && (
              <div className="flex items-center gap-1 bg-white/60 px-3 py-1 rounded-full">
                <MapPin className="h-4 w-4 text-purple-600" />
                {data.personalInfo.location}
              </div>
            )}
            {data.personalInfo.linkedin && (
              <div className="flex items-center gap-1 bg-white/60 px-3 py-1 rounded-full">
                <Linkedin className="h-4 w-4 text-purple-600" />
                {data.personalInfo.linkedin}
              </div>
            )}
            {data.personalInfo.website && (
              <div className="flex items-center gap-1 bg-white/60 px-3 py-1 rounded-full">
                <Globe className="h-4 w-4 text-purple-600" />
                {data.personalInfo.website}
              </div>
            )}
            {data.personalInfo.driversLicense && (
              <div className="flex items-center gap-1 bg-white/60 px-3 py-1 rounded-full">
                <CarFront className="h-4 w-4 text-purple-600" />
                {data.personalInfo.driversLicense}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      {data.personalInfo.summary && (
        <div className="mt-8 bg-white/60 p-6 rounded-2xl backdrop-blur-sm">
          <h2 className="text-xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-3">
            About Me
          </h2>
          <p className="text-gray-700 leading-relaxed">{data.personalInfo.summary}</p>
        </div>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            Experience
          </h2>
          {data.experience.map((exp, index) => (
            <div key={exp.id} className="mb-6 bg-white/60 p-6 rounded-2xl backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-xl flex items-center justify-center text-white flex-shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg text-gray-800">{exp.position}</h3>
                      <p className="text-purple-600">{exp.company}</p>
                    </div>
                    <div className="text-right text-sm text-gray-600">
                      <p>{exp.location}</p>
                      <p>
                        {exp.startDate} - {exp.current ? 'Present' : exp.endDate}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 text-gray-700 whitespace-pre-line">{exp.description}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Two Column Layout for Education and Skills */}
      <div className="grid grid-cols-2 gap-6 mt-8">
        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
              Education
            </h2>
            {data.education.map((edu) => (
              <div key={edu.id} className="mb-4 bg-white/60 p-4 rounded-xl backdrop-blur-sm">
                <h3 className="text-base text-gray-800">{edu.degree}</h3>
                <p className="text-purple-600 text-sm">{edu.institution}</p>
                <p className="text-gray-600 text-sm">{edu.graduationDate}</p>
                {edu.gpa && <p className="text-gray-600 text-sm">GPA: {edu.gpa}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <h2 className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
              Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {data.skills.map((skill, index) => (
                <span
                  key={index}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Projects */}
      {data.projects && data.projects.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            Projects
          </h2>
          {data.projects.map((proj) => (
            <div key={proj.id} className="mb-4 bg-white/60 p-6 rounded-xl backdrop-blur-sm">
              <h3 className="text-lg text-gray-800">{proj.name}</h3>
              {proj.link && (
                <p className="text-sm text-purple-600">{proj.link}</p>
              )}
              <p className="text-gray-700 mt-2">{proj.description}</p>
              {proj.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {proj.technologies.map((tech, index) => (
                    <span key={index} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
