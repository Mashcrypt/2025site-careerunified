import type { ResumeData } from '../types/resume';

interface MinimalistTemplateProps {
  data: ResumeData;
}

export function MinimalistTemplate({ data }: MinimalistTemplateProps) {
  return (
    <div className="bg-white p-12 shadow-lg rounded-lg min-h-[1056px] w-[816px]">
      {/* Header */}
      <div className="text-center border-b border-gray-900 pb-6 mb-8">
        <h1 className="text-5xl tracking-tight mb-4">{data.personalInfo.fullName || 'YOUR NAME'}</h1>
        <div className="flex justify-center gap-6 text-sm text-gray-600">
          {data.personalInfo.email && <span>{data.personalInfo.email}</span>}
          {data.personalInfo.phone && <span>{data.personalInfo.phone}</span>}
          {data.personalInfo.location && <span>{data.personalInfo.location}</span>}
        </div>
        {(data.personalInfo.linkedin || data.personalInfo.website) && (
          <div className="flex justify-center gap-6 text-sm text-gray-600 mt-2">
            {data.personalInfo.linkedin && <span>{data.personalInfo.linkedin}</span>}
            {data.personalInfo.website && <span>{data.personalInfo.website}</span>}
          </div>
        )}
      </div>

      {/* Summary */}
      {data.personalInfo.summary && (
        <div className="mb-8">
          <p className="text-gray-700 leading-relaxed text-center italic">
            {data.personalInfo.summary}
          </p>
        </div>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
            Experience
          </h2>
          {data.experience.map((exp) => (
            <div key={exp.id} className="mb-6">
              <div className="flex justify-between items-baseline mb-1">
                <h3 className="text-base">{exp.position}</h3>
                <span className="text-sm text-gray-500">
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                {exp.company}, {exp.location}
              </p>
              <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {exp.description}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
            Education
          </h2>
          {data.education.map((edu) => (
            <div key={edu.id} className="mb-4">
              <div className="flex justify-between items-baseline">
                <div>
                  <h3 className="text-base">{edu.degree}</h3>
                  <p className="text-sm text-gray-600">
                    {edu.institution}, {edu.location}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-500">
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
        <div className="mb-8">
          <h2 className="text-sm uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
            Skills
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed">{data.skills.join(' • ')}</p>
        </div>
      )}

      {/* Projects */}
      {data.projects && data.projects.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm uppercase tracking-widest text-gray-900 border-b border-gray-300 pb-2 mb-4">
            Projects
          </h2>
          {data.projects.map((proj) => (
            <div key={proj.id} className="mb-4">
              <h3 className="text-base">{proj.name}</h3>
              {proj.link && (
                <p className="text-sm text-gray-600">{proj.link}</p>
              )}
              <p className="text-sm text-gray-700 mt-1 leading-relaxed">{proj.description}</p>
              {proj.technologies.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  {proj.technologies.join(' • ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
