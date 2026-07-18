import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResumeData } from '../types/resume';
import {
  analyzeResumeForAts,
  ATS_STRONG_SCORE,
  buildAtsFeedbackForTailor,
  extractAtsKeywordCandidates,
} from './ats-analysis';

const baseResume: ResumeData = {
  personalInfo: {
    fullName: 'Test Candidate',
    email: 'candidate@example.com',
    phone: '+27 82 555 0101',
    location: 'Johannesburg, Gauteng',
    linkedin: 'linkedin.com/in/test-candidate',
    summary:
      'Administrative professional with experience supporting accurate records, customer enquiries, reporting, scheduling, and collaborative office operations in busy service environments.',
  },
  experience: [
    {
      id: 'exp-1',
      position: 'Administrative Officer',
      company: 'Example Services',
      location: 'Johannesburg, Gauteng',
      startDate: 'Jan 2022',
      endDate: 'Present',
      current: true,
      description:
        'Managed more than 120 customer records each month and resolved service enquiries. Coordinated weekly reports, monitored document quality, prepared meeting packs, implemented an electronic filing register, supported audit requests, and reduced missing-file follow-ups by 25%.',
    },
    {
      id: 'exp-2',
      position: 'Office Assistant',
      company: 'Community Support Centre',
      location: 'Johannesburg, Gauteng',
      startDate: 'Feb 2020',
      endDate: 'Dec 2021',
      current: false,
      description:
        'Administered appointment schedules for 8 staff members, captured client information, delivered monthly activity reports, supported procurement records, prepared correspondence, and improved document turnaround time by 15% through a clear tracking process.',
    },
  ],
  education: [
    {
      id: 'edu-1',
      degree: 'Diploma in Public Administration',
      institution: 'Example College',
      location: 'Johannesburg, Gauteng',
      graduationDate: '2019',
    },
  ],
  skills: [
    'Administration',
    'Microsoft Office',
    'Excel',
    'Records Management',
    'Customer Service',
    'Report Writing',
    'Data Capturing',
    'Procurement',
    'Communication',
    'Attention to Detail',
    'Time Management',
    'Teamwork',
  ],
  projects: [
    {
      id: 'project-1',
      name: 'Digital Records Register',
      description:
        'Created and maintained a searchable records register that gave the administration team a reliable view of document ownership, status, review dates, and outstanding actions.',
      technologies: ['Microsoft Excel'],
    },
  ],
  certifications: ['Microsoft Office Fundamentals'],
  additionalSections: [],
};

const administrationJob = `
Administrative Officer vacancy. The role requires public administration, office administration,
records management, Microsoft Office, Excel, data capturing, customer service, report writing,
procurement, communication, attention to detail, time management, teamwork and compliance.
The successful candidate will coordinate records, prepare reports, monitor service requests and
support accurate administrative processes for internal stakeholders.
`;

test('normalizes the complete rubric to a true 100-point score', () => {
  const analysis = analyzeResumeForAts(baseResume, administrationJob);

  assert.equal(analysis.rawMax, 93);
  assert.equal(analysis.score, Math.round((analysis.rawScore / analysis.rawMax) * 100));
  assert.ok(analysis.score >= ATS_STRONG_SCORE);
});

test('includes every missing assessed keyword in feedback instead of hiding later batches', () => {
  const sparseResume: ResumeData = {
    ...baseResume,
    personalInfo: { ...baseResume.personalInfo, summary: 'Reliable assistant seeking a new opportunity.' },
    skills: [],
    experience: [],
    projects: [],
    certifications: [],
  };
  const keywordHeavyJob = `
The vacancy requires accounting, bookkeeping, budgeting, audit, compliance, CRM, customer service,
data analysis, data capturing, Excel, financial reporting, human resources, inventory management,
payroll, Power BI, procurement, project management, public administration, report writing, SAP,
SQL, stakeholder management, communication, leadership, problem solving and time management.
`;
  const analysis = analyzeResumeForAts(sparseResume, keywordHeavyJob);
  const feedback = buildAtsFeedbackForTailor(analysis);

  assert.ok(analysis.missingKeywords.length > 10);
  analysis.missingKeywords.forEach((keyword) => assert.match(feedback, new RegExp(keyword, 'i')));
});

test('does not treat generic recruitment wording as a high-value phrase', () => {
  const keywords = extractAtsKeywordCandidates(
    'The successful candidate must submit an application. The successful candidate will be contacted. Excel and report writing are required.',
  );

  assert.ok(!keywords.includes('successful candidate'));
  assert.ok(keywords.includes('excel'));
  assert.ok(keywords.includes('report writing'));
});
