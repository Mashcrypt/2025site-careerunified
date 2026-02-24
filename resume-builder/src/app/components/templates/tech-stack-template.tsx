import type { ResumeData } from '../../types/resume';

type Props = {
  data: ResumeData;
  colorTheme?: string;
};

export function TechStackTemplate({ data }: Props) {
  const p = data.personalInfo;

  return (
    <div
      style={{
        width: 816,
        background: '#fff',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        lineHeight: 1.35,
        padding: 38,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3 }}>{p.fullName}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
            {p.location} · {p.phone} · {p.email}
            {p.linkedin ? ` · ${p.linkedin}` : ''}
            {p.website ? ` · ${p.website}` : ''}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, borderTop: '2px solid #e2e8f0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 22, marginTop: 18 }}>
        {/* Main */}
        <main>
          {p.summary ? (
            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>PROFILE</div>
              <div style={{ marginTop: 8, fontSize: 13 }}>{p.summary}</div>
            </section>
          ) : null}

          {data.projects?.length ? (
            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>PROJECTS</div>

              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.projects.map((proj) => (
                  <div key={proj.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{proj.name}</div>
                      {proj.link ? (
                        <div style={{ fontSize: 12, color: '#2563eb', whiteSpace: 'nowrap' }}>{proj.link}</div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: '#0f172a' }}>{proj.description}</div>
                    {proj.technologies?.length ? (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#334155' }}>
                        <span style={{ fontWeight: 800 }}>Tech:</span> {proj.technologies.join(' · ')}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Experience */}
          <section>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>EXPERIENCE</div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.experience?.map((exp) => (
                <div key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      {exp.position} <span style={{ fontWeight: 700, color: '#334155' }}>· {exp.company}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                      {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                    </div>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: '#475569' }}>{exp.location}</div>
                  {exp.description ? <div style={{ marginTop: 7, fontSize: 13 }}>{exp.description}</div> : null}
                </div>
              ))}
            </div>
          </section>
        </main>

        {/* Right column */}
        <aside>
          {data.skills?.length ? (
            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>TECH STACK</div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.skills.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 12,
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {data.education?.length ? (
            <section>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>EDUCATION</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.education.map((edu) => (
                  <div key={edu.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{edu.degree}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
                      {edu.institution} · {edu.location}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>{edu.graduationDate}</div>
                    {edu.gpa ? <div style={{ marginTop: 6, fontSize: 12 }}>GPA: {edu.gpa}</div> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
