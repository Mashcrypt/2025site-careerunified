import type { ResumeData } from '../../types/resume';
import { CarFront } from 'lucide-react';

type Props = {
  data: ResumeData;
  colorTheme?: string;
};

export function ATSProTemplate({ data }: Props) {
  const p = data.personalInfo;

  return (
    <div
      style={{
        width: 816,
        background: '#fff',
        color: '#0f172a',
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        lineHeight: 1.35,
        padding: 42,
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.3 }}>{p.fullName}</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
          {p.location} · {p.phone} · {p.email}
          {p.linkedin ? ` · ${p.linkedin}` : ''}
          {p.website ? ` · ${p.website}` : ''}
          {p.driversLicense ? (
            <span>
              {' · '}
              <CarFront style={{ display: 'inline', width: 13, height: 13, verticalAlign: -2 }} />
              {` ${p.driversLicense}`}
            </span>
          ) : null}
        </div>
      </div>

      {/* Summary */}
      {p.summary ? (
        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: '#0f172a' }}>
            SUMMARY
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#0f172a' }}>{p.summary}</div>
        </section>
      ) : null}

      {/* Experience */}
      <section style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6 }}>EXPERIENCE</div>

        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.experience?.map((exp) => (
            <div key={exp.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {exp.position} — <span style={{ fontWeight: 700 }}>{exp.company}</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'nowrap' }}>
                  {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                </div>
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: '#475569' }}>{exp.location}</div>
              {exp.description ? (
                <div style={{ marginTop: 6, fontSize: 13, color: '#0f172a' }}>{exp.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      {data.skills?.length ? (
        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6 }}>SKILLS</div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#0f172a' }}>
            {data.skills.join(' · ')}
          </div>
        </section>
      ) : null}

      {/* Education */}
      {data.education?.length ? (
        <section>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6 }}>EDUCATION</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.education.map((edu) => (
              <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{edu.degree}</div>
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
    </div>
  );
}
