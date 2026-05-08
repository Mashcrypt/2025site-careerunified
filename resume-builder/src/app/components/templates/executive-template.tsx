import type { ResumeData } from '../../types/resume';
import { CarFront } from 'lucide-react';

type Props = {
  data: ResumeData;
  colorTheme?: string;
};

export function ExecutiveTemplate({ data }: Props) {
  const p = data.personalInfo;

  return (
    <div
      style={{
        width: 816,
        background: '#fff',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        lineHeight: 1.35,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr' }}>
        {/* Sidebar */}
        <aside style={{ background: '#0b1220', color: '#e2e8f0', padding: 34 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.2 }}>{p.fullName}</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
            <div>{p.location}</div>
            <div style={{ marginTop: 6 }}>{p.phone}</div>
            <div style={{ marginTop: 6 }}>{p.email}</div>
            {p.linkedin ? <div style={{ marginTop: 6 }}>{p.linkedin}</div> : null}
            {p.website ? <div style={{ marginTop: 6 }}>{p.website}</div> : null}
            {p.driversLicense ? (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CarFront style={{ width: 13, height: 13 }} />
                <span>{p.driversLicense}</span>
              </div>
            ) : null}
          </div>

          {data.skills?.length ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: 0.8, fontWeight: 800 }}>CORE SKILLS</div>
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.95, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.skills.slice(0, 12).map((s, i) => (
                  <div key={i}>• {s}</div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        {/* Main */}
        <main style={{ padding: 38 }}>
          {p.summary ? (
            <section style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>EXECUTIVE SUMMARY</div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#0f172a' }}>{p.summary}</div>
            </section>
          ) : null}

          <section style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>LEADERSHIP EXPERIENCE</div>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.experience?.map((exp) => (
                <div key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      {exp.position}
                      <span style={{ fontWeight: 700, color: '#334155' }}> · {exp.company}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                      {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                    </div>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 12, color: '#475569' }}>{exp.location}</div>
                  {exp.description ? (
                    <div style={{ marginTop: 7, fontSize: 13 }}>{exp.description}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {data.education?.length ? (
            <section>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.7 }}>EDUCATION</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.education.map((edu) => (
                  <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{edu.degree}</div>
                      <div style={{ fontSize: 12, color: '#475569' }}>
                        {edu.institution} · {edu.location}
                        {edu.gpa ? ` · GPA: ${edu.gpa}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                      {edu.graduationDate}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
