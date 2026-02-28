import type { ResumeData } from '../../types/resume';

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

export function CommerceAnalystTemplate({ data, colorTheme }: Props) {
  const t = theme(colorTheme);
  const p = data.personalInfo || ({} as any);

  const experience = data.experience || [];
  const education = data.education || [];
  const skills = data.skills || [];
  const projects = data.projects || [];
  const certifications = data.certifications || [];

  const topMetrics = [
    { label: 'Reporting', value: 'Monthly / Quarterly' },
    { label: 'Tools', value: 'Excel • Sheets • PowerPoint' },
    { label: 'Focus', value: 'Finance • Audit • Analysis' },
  ];

  return (
    <div className="w-[816px] min-h-[1056px] bg-white text-slate-900">
      <div className="px-10 pt-10 pb-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{p.fullName || 'Your Name'}</h1>
            <div className="mt-1 text-sm text-slate-700">
              <span className={`font-semibold ${t.accentText}`}>Commerce / Finance</span>
              {p.location ? <span className="text-slate-600"> • {p.location}</span> : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
              {p.email ? <span>{p.email}</span> : <span>email@example.com</span>}
              {p.phone ? <span>{p.phone}</span> : <span>+27 00 000 0000</span>}
              {p.linkedin ? <span>{p.linkedin}</span> : null}
              {p.website ? <span>{p.website}</span> : null}
            </div>

            {p.summary ? (
              <p className="mt-4 text-sm text-slate-800 leading-relaxed">{p.summary}</p>
            ) : (
              <p className="mt-4 text-sm text-slate-700 leading-relaxed">
                Results-driven commerce professional with a strong foundation in reporting, reconciliations,
                and stakeholder-ready insights. Built for ATS and designed to highlight measurable impact.
              </p>
            )}
          </div>

          <div className="w-[250px] shrink-0">
            <div className={`border ${t.accentBorder} rounded-xl overflow-hidden`}>
              <div className={`${t.accentBg} px-4 py-3`}>
                <div className="text-[11px] font-bold tracking-wider text-slate-700">INSIGHT SNAPSHOT</div>
              </div>
              <div className="p-4 space-y-3">
                {topMetrics.map((m) => (
                  <div key={m.label} className="flex items-start justify-between gap-3">
                    <div className="text-xs text-slate-600">{m.label}</div>
                    <div className="text-xs font-semibold text-slate-900 text-right">{m.value}</div>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-700">ATS KEYWORDS</div>
                  <div className="mt-1 text-xs text-slate-700 leading-relaxed">
                    Budgeting • Variance • Reconciliation • Audit • Controls • Forecasting
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200" />
      </div>

      <div className="px-10 pb-10">
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-7">
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

            <div className="mt-7">
              <SectionTitle title="KEY ACHIEVEMENTS" accentText={t.accentText} />
              <div className={`border ${t.accentBorder} rounded-xl p-4 ${t.accentBg}`}>
                <ul className="text-xs text-slate-800 space-y-1.5">
                  <li>• Improved reporting turnaround by streamlining templates and checks</li>
                  <li>• Reduced reconciliation errors by implementing structured review steps</li>
                  <li>• Supported audit readiness with clean documentation and control evidence</li>
                  <li>• Delivered stakeholder summaries with clear, decision-ready insights</li>
                </ul>
              </div>
            </div>

            {projects?.length ? (
              <div className="mt-7">
                <SectionTitle title="PROJECTS" accentText={t.accentText} />
                <div className="space-y-3">
                  {projects.slice(0, 3).map((prj) => (
                    <div key={prj.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="text-sm font-semibold">{prj.name || 'Project Title'}</div>
                      <div className="mt-1 text-xs text-slate-700 leading-relaxed">
                        {prj.description || 'Describe the analysis performed and the business impact.'}
                      </div>
                      {prj.technologies?.length ? (
                        <div className="mt-2 text-[11px] text-slate-700">
                          Tools/Keywords: <span className="text-slate-900">{prj.technologies.join(', ')}</span>
                        </div>
                      ) : null}
                      {prj.link ? <div className="mt-1 text-[11px] text-slate-600">Link: {prj.link}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="col-span-5">
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
              <SectionTitle title="SKILLS (ANALYST)" accentText={t.accentText} />
              <div className="border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] font-semibold text-slate-700">Technical</div>
                <ul className="mt-2 text-xs text-slate-800 space-y-1">
                  {(skills.length ? skills : ['Excel', 'Financial Modeling', 'Reconciliations', 'Variance Analysis', 'Reporting', 'Stakeholder Communication'])
                    .slice(0, 10)
                    .map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                </ul>

                <div className="mt-4 text-[11px] font-semibold text-slate-700">Business</div>
                <ul className="mt-2 text-xs text-slate-800 space-y-1">
                  <li>• Budgeting & Forecasting</li>
                  <li>• Controls & Audit Support</li>
                  <li>• Risk-aware decision making</li>
                </ul>
              </div>
            </div>

            <div className="mt-7">
              <SectionTitle title="CERTIFICATIONS" accentText={t.accentText} />
              <div className={`${t.accentBg} border ${t.accentBorder} rounded-xl p-3`}>
                <ul className="text-xs text-slate-800 space-y-1">
                  {(certifications.length ? certifications : ['ACCA / SAICA (if applicable)', 'Advanced Excel', 'Financial Reporting'])
                    .slice(0, 8)
                    .map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                </ul>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-200 pt-4 text-[11px] text-slate-600 leading-relaxed">
              Tip: Add numbers wherever possible (%, R, time saved, volume processed).
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
