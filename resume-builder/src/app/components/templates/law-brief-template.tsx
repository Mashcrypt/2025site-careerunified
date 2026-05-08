import type { ResumeData } from '../../types/resume';
import { CarFront } from 'lucide-react';

type Props = {
  data: ResumeData;
  colorTheme?: string;
};

function theme(colorTheme?: string) {
  const key = (colorTheme || 'blue').toLowerCase();
  const map: Record<string, { accentText: string; accentBorder: string; accentBg: string }> = {
    blue: { accentText: 'text-blue-700', accentBorder: 'border-blue-200', accentBg: 'bg-blue-50' },
    navy: { accentText: 'text-slate-800', accentBorder: 'border-slate-300', accentBg: 'bg-slate-50' },
    green: { accentText: 'text-emerald-700', accentBorder: 'border-emerald-200', accentBg: 'bg-emerald-50' },
    purple: { accentText: 'text-violet-700', accentBorder: 'border-violet-200', accentBg: 'bg-violet-50' },
    red: { accentText: 'text-red-700', accentBorder: 'border-red-200', accentBg: 'bg-red-50' },
    teal: { accentText: 'text-teal-700', accentBorder: 'border-teal-200', accentBg: 'bg-teal-50' },
    black: { accentText: 'text-slate-900', accentBorder: 'border-slate-300', accentBg: 'bg-slate-50' },
    gray: { accentText: 'text-slate-700', accentBorder: 'border-slate-300', accentBg: 'bg-slate-50' },
  };
  return map[key] || map.blue;
}

function lines(text?: string) {
  return (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function LawBriefTemplate({ data, colorTheme }: Props) {
  const t = theme(colorTheme);
  const p = data.personalInfo || ({} as any);

  const experience = data.experience || [];
  const education = data.education || [];
  const skills = data.skills || [];
  const projects = data.projects || [];
  const certifications = data.certifications || [];

  return (
    <div className="w-[816px] min-h-[1056px] bg-white text-slate-900">
      <div className="px-10 pt-10 pb-6">
        <div className={`border ${t.accentBorder} rounded-xl p-5`}>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight leading-tight">
                {p.fullName || 'Your Name'}
              </h1>
              <div className={`mt-1 text-sm font-semibold ${t.accentText}`}>
                {p.location || 'City, Country'}
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
            </div>

            <div className="w-[220px] shrink-0">
              <div className={`${t.accentBg} border ${t.accentBorder} rounded-lg p-3`}>
                <div className="text-[11px] font-semibold text-slate-700">PRACTICE FOCUS</div>
                <div className="mt-2 text-xs text-slate-800 leading-relaxed">
                  Contracts • Compliance • Litigation Support • Research • Client Advisory
                </div>
                <div className="mt-3 border-t border-slate-200 pt-2">
                  <div className="text-[11px] font-semibold text-slate-700">HIGHLIGHTS</div>
                  <ul className="mt-1 text-xs text-slate-800 space-y-1">
                    <li>• Case-ready structure</li>
                    <li>• Clear matters & outcomes</li>
                    <li>• ATS-safe formatting</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {p.summary ? (
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-slate-700 tracking-wider">PROFESSIONAL SUMMARY</div>
              <p className="mt-1 text-sm text-slate-800 leading-relaxed">{p.summary}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-10 pb-10">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-8">
            <SectionTitle title="EXPERIENCE" accentText={t.accentText} />
            <div className="space-y-4">
              {experience.length ? (
                experience.map((exp) => (
                  <div key={exp.id} className="pb-3 border-b border-slate-200 last:border-b-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{exp.position || 'Role Title'}</div>
                        <div className="text-xs text-slate-700">
                          {exp.company || 'Organization'}{exp.location ? ` • ${exp.location}` : ''}
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

            <div className="mt-7">
              <SectionTitle title="MATTERS & ACHIEVEMENTS" accentText={t.accentText} />
              <div className={`${t.accentBg} border ${t.accentBorder} rounded-xl p-4`}>
                <ul className="text-xs text-slate-800 space-y-1.5">
                  <li>• Drafted and reviewed contracts with risk-focused clause checks</li>
                  <li>• Conducted legal research and summarized findings for stakeholders</li>
                  <li>• Prepared case notes, bundles, and timelines for hearings</li>
                  <li>• Supported compliance tracking and policy updates</li>
                </ul>
              </div>
            </div>

            {projects?.length ? (
              <div className="mt-7">
                <SectionTitle title="RESEARCH / PROJECTS" accentText={t.accentText} />
                <div className="space-y-3">
                  {projects.slice(0, 3).map((prj) => (
                    <div key={prj.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{prj.name || 'Project Title'}</div>
                          <div className="mt-1 text-xs text-slate-700 leading-relaxed">
                            {prj.description || 'Short description of the work and outcome.'}
                          </div>
                        </div>
                        {prj.link ? (
                          <div className="text-[11px] text-slate-600 whitespace-nowrap">Link: {prj.link}</div>
                        ) : null}
                      </div>
                      {prj.technologies?.length ? (
                        <div className="mt-2 text-[11px] text-slate-700">
                          Keywords: <span className="text-slate-900">{prj.technologies.join(', ')}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
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
              <SectionTitle title="CORE SKILLS" accentText={t.accentText} />
              <div className="border border-slate-200 rounded-xl p-3">
                <ul className="text-xs text-slate-800 space-y-1">
                  {(skills.length ? skills : ['Legal Research', 'Contract Drafting', 'Compliance', 'Client Support', 'Case Preparation'])
                    .slice(0, 12)
                    .map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="mt-7">
              <SectionTitle title="ADMISSIONS & CERTIFICATIONS" accentText={t.accentText} />
              <div className={`${t.accentBg} border ${t.accentBorder} rounded-xl p-3`}>
                <ul className="text-xs text-slate-800 space-y-1">
                  {(certifications.length ? certifications : ['Admission (if applicable)', 'Compliance Training', 'Legal Writing'])
                    .slice(0, 8)
                    .map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-200 pt-4 text-[11px] text-slate-600 leading-relaxed">
              Tip: Keep bullets outcome-based (e.g., “reduced risk”, “improved turnaround time”, “supported X cases”).
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
