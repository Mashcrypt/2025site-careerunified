import type { ResumeData } from '../../types/resume';
import { CarFront } from 'lucide-react';

type Props = {
  data: ResumeData;
  colorTheme?: string;
};

function theme(colorTheme?: string) {
  const key = (colorTheme || 'blue').toLowerCase();
  const map: Record<string, { accentText: string; accentBorder: string; accentBg: string; accentLine: string }> = {
    blue: { accentText: 'text-blue-700', accentBorder: 'border-blue-200', accentBg: 'bg-blue-50', accentLine: 'bg-blue-200' },
    navy: { accentText: 'text-slate-800', accentBorder: 'border-slate-300', accentBg: 'bg-slate-50', accentLine: 'bg-slate-300' },
    green: { accentText: 'text-emerald-700', accentBorder: 'border-emerald-200', accentBg: 'bg-emerald-50', accentLine: 'bg-emerald-200' },
    purple: { accentText: 'text-violet-700', accentBorder: 'border-violet-200', accentBg: 'bg-violet-50', accentLine: 'bg-violet-200' },
    red: { accentText: 'text-red-700', accentBorder: 'border-red-200', accentBg: 'bg-red-50', accentLine: 'bg-red-200' },
    teal: { accentText: 'text-teal-700', accentBorder: 'border-teal-200', accentBg: 'bg-teal-50', accentLine: 'bg-teal-200' },
    black: { accentText: 'text-slate-900', accentBorder: 'border-slate-300', accentBg: 'bg-slate-50', accentLine: 'bg-slate-300' },
    gray: { accentText: 'text-slate-700', accentBorder: 'border-slate-300', accentBg: 'bg-slate-50', accentLine: 'bg-slate-300' },
  };
  return map[key] || map.blue;
}

function lines(text?: string) {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function EngineeringBlueprintTemplate({ data, colorTheme }: Props) {
  const t = theme(colorTheme);
  const p = data.personalInfo || ({} as any);

  const experience = data.experience || [];
  const education = data.education || [];
  const skills = data.skills || [];
  const projects = data.projects || [];
  const certifications = data.certifications || [];

  return (
    <div className="w-[816px] min-h-[1056px] bg-white text-slate-900">
      <div className="px-10 pt-10">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg ${t.accentBg} border ${t.accentBorder} flex items-center justify-center`}>
                <div className={`h-4 w-4 ${t.accentLine}`} />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight leading-tight">{p.fullName || 'Your Name'}</h1>
                <div className="text-sm text-slate-700">
                  <span className={`font-semibold ${t.accentText}`}>Engineering</span>
                  {p.location ? <span className="text-slate-600"> • {p.location}</span> : null}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
              {p.email ? <span>{p.email}</span> : <span>email@example.com</span>}
              {p.phone ? <span>{p.phone}</span> : <span>+27 00 000 0000</span>}
              {p.linkedin ? <span>{p.linkedin}</span> : null}
              {p.website ? <span>{p.website}</span> : null}
              {p.driversLicense ? (
                <span className="inline-flex items-center gap-1">
                  <CarFront className="h-3.5 w-3.5" />
                  {p.driversLicense}
                </span>
              ) : null}
            </div>

            {p.summary ? (
              <p className="mt-4 text-sm text-slate-800 leading-relaxed">{p.summary}</p>
            ) : (
              <p className="mt-4 text-sm text-slate-700 leading-relaxed">
                Engineering-focused blueprint layout that emphasizes projects, tools, and measurable outcomes — ATS-safe and recruiter friendly.
              </p>
            )}
          </div>

          <div className="w-[260px] shrink-0">
            <div className={`border ${t.accentBorder} rounded-xl overflow-hidden`}>
              <div className={`${t.accentBg} px-4 py-3`}>
                <div className="text-[11px] font-bold tracking-wider text-slate-700">TECHNICAL PROFILE</div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold text-slate-700">Tools / Stack</div>
                <div className="mt-2 text-xs text-slate-800 leading-relaxed">
                  {(skills.length ? skills : ['CAD', 'MATLAB', 'Python', 'Excel', 'SolidWorks', 'AutoCAD'])
                    .slice(0, 10)
                    .join(' • ')}
                </div>

                <div className="mt-4 border-t border-slate-200 pt-3">
                  <div className="text-[11px] font-semibold text-slate-700">Strengths</div>
                  <ul className="mt-2 text-xs text-slate-800 space-y-1">
                    <li>• Design & prototyping</li>
                    <li>• Systems thinking</li>
                    <li>• Documentation & standards</li>
                    <li>• Safety & quality mindset</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 border-t border-slate-200" />
      </div>

      <div className="px-10 pb-10 pt-8">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-8">
            <SectionTitle title="PROJECTS (IMPACT FIRST)" accentText={t.accentText} />
            {projects.length ? (
              <div className="space-y-3">
                {projects.slice(0, 4).map((prj) => (
                  <div key={prj.id} className={`border ${t.accentBorder} rounded-xl p-4`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{prj.name || 'Project Title'}</div>
                        <div className="mt-1 text-xs text-slate-700 leading-relaxed">
                          {prj.description || 'Describe the engineering problem, your approach, and the outcome.'}
                        </div>
                      </div>
                      {prj.link ? (
                        <div className="text-[11px] text-slate-600 whitespace-nowrap">Link: {prj.link}</div>
                      ) : null}
                    </div>
                    {prj.technologies?.length ? (
                      <div className="mt-2 text-[11px] text-slate-700">
                        Tools/Keywords: <span className="text-slate-900">{prj.technologies.join(', ')}</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${t.accentBg} border ${t.accentBorder} rounded-xl p-4`}>
                <div className="text-xs text-slate-800 font-semibold">Suggested project bullets (add yours):</div>
                <ul className="mt-2 text-xs text-slate-800 space-y-1.5">
                  <li>• Designed a component/system meeting constraints (cost, strength, safety)</li>
                  <li>• Built prototypes and validated performance with tests/simulations</li>
                  <li>• Documented standards, drawings, and handover materials</li>
                  <li>• Improved reliability/efficiency by optimizing a process or design</li>
                </ul>
              </div>
            )}

            <div className="mt-7">
              <SectionTitle title="EXPERIENCE" accentText={t.accentText} />
              <div className="space-y-4">
                {experience.length ? (
                  experience.map((exp) => (
                    <div key={exp.id} className="pb-3 border-b border-slate-200 last:border-b-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{exp.position || 'Role Title'}</div>
                          <div className="text-xs text-slate-700">
                            {exp.company || 'Company'}{exp.location ? ` • ${exp.location}` : ''}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600 whitespace-nowrap">
                          {(exp.startDate || 'Start')} — {exp.current ? 'Present' : (exp.endDate || 'End')}
                        </div>
                      </div>

                      <ul className="mt-2 text-xs text-slate-800 space-y-1">
                        {lines(exp.description).slice(0, 6).map((l, i) => (
                          <li key={i}>• {l}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <EmptyHint text="Add your experience to populate this section." />
                )}
              </div>
            </div>
          </div>

          <div className="col-span-4">
            <SectionTitle title="EDUCATION" accentText={t.accentText} />
            <div className="space-y-3">
              {education.length ? (
                education.map((ed) => (
                  <div key={ed.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="text-sm font-semibold">{ed.degree || 'Degree / Qualification'}</div>
                    <div className="text-xs text-slate-700">{ed.institution || 'Institution'}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      {ed.location ? `${ed.location} • ` : ''}{ed.graduationDate || 'Graduation'}
                    </div>
                    {ed.gpa ? <div className="text-xs text-slate-700 mt-1">GPA: {ed.gpa}</div> : null}
                  </div>
                ))
              ) : (
                <EmptyHint text="Add your education to populate this section." />
              )}
            </div>

            <div className="mt-7">
              <SectionTitle title="SKILLS" accentText={t.accentText} />
              <div className="border border-slate-200 rounded-xl p-3">
                <ul className="text-xs text-slate-800 space-y-1">
                  {(skills.length ? skills : ['CAD', 'Simulation', 'Testing', 'Documentation', 'Problem Solving', 'Team Collaboration'])
                    .slice(0, 14)
                    .map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="mt-7">
              <SectionTitle title="CERTIFICATIONS" accentText={t.accentText} />
              <div className={`${t.accentBg} border ${t.accentBorder} rounded-xl p-3`}>
                <ul className="text-xs text-slate-800 space-y-1">
                  {(certifications.length ? certifications : ['Safety / Quality Training', 'Project Management Basics', 'Engineering Certification (if applicable)'])
                    .slice(0, 8)
                    .map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-200 pt-4 text-[11px] text-slate-600 leading-relaxed">
              Tip: For each project/role include: constraint → action → result (time saved, cost reduced, performance improved).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, accentText }: { title: string; accentText: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-2">
        <div className={`text-[11px] font-bold tracking-wider ${accentText}`}>{title}</div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-3 text-xs text-slate-600">
      {text}
    </div>
  );
}
