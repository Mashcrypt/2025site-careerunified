import type { ResumeData } from '../types/resume';

export const southAfricanSampleData: ResumeData = {
  personalInfo: {
    fullName: 'John Smith',
    email: 'john.smith@gmail.com',
    phone: '+27 68 103 2512',
    location: 'Cape Town, Western Cape',
    linkedin: 'linkedin.com/in/john-smith',
    website: 'john-portfolio.co.za',
    summary:
      'Results-driven Software Engineer with 6+ years of experience developing innovative fintech solutions for South African markets. Proven track record of building scalable applications that have served over 500,000 users. Passionate about leveraging technology to solve African business challenges and mentor emerging developers.',
  },
  experience: [
    {
      id: '1',
      position: 'Senior Software Engineer',
      company: 'CapeTech Solutions',
      location: 'Cape Town, Western Cape',
      startDate: 'Mar 2021',
      endDate: 'Present',
      current: true,
      description:
        '• Led development of mobile banking platform serving 200,000+ South African customers\n• Architected microservices infrastructure that reduced transaction processing time by 60%\n• Collaborated with Capitec and FNB integration teams for seamless payment solutions\n• Mentored team of 5 junior developers, improving code quality by 40%\n• Implemented POPIA-compliant data protection protocols',
    },
    {
      id: '2',
      position: 'Software Engineer',
      company: 'Investec Technology Labs',
      location: 'Sandton, Gauteng',
      startDate: 'Jan 2019',
      endDate: 'Feb 2021',
      current: false,
      description:
        '• Developed RESTful APIs for wealth management platform used by 50,000+ clients\n• Built real-time JSE stock trading dashboard with React and WebSockets\n• Optimized database queries reducing load times by 45%\n• Participated in agile ceremonies and sprint planning sessions',
    },
    {
      id: '3',
      position: 'Junior Developer',
      company: 'Takealot Group',
      location: 'Cape Town, Western Cape',
      startDate: 'Jun 2017',
      endDate: 'Dec 2018',
      current: false,
      description:
        '• Contributed to e-commerce platform improvements serving millions of South Africans\n• Implemented inventory management features for warehouse operations\n• Fixed critical bugs improving system stability by 30%\n• Collaborated with cross-functional teams across SA regions',
    },
  ],
  education: [
    {
      id: '1',
      degree: 'Bachelor of Science in Computer Science',
      institution: 'University of Cape Town',
      location: 'Cape Town, Western Cape',
      graduationDate: 'Dec 2016',
      gpa: '3.7/4.0',
    },
    {
      id: '2',
      degree: 'National Senior Certificate',
      institution: 'Bishops Diocesan College',
      location: 'Cape Town, Western Cape',
      graduationDate: 'Dec 2012',
      gpa: 'Distinctions: Mathematics, Physical Sciences',
    },
  ],
  skills: [
    'JavaScript',
    'TypeScript',
    'React',
    'Node.js',
    'Python',
    'AWS',
    'Docker',
    'PostgreSQL',
    'MongoDB',
    'Git',
    'REST APIs',
    'Agile/Scrum',
  ],
  projects: [
    {
      id: '1',
      name: 'Township Business Directory',
      description:
        'Created a web platform connecting township entrepreneurs with customers across South Africa. Featured multilingual support (English, isiZulu, isiXhosa, Afrikaans) and mobile-first design reaching 10,000+ users.',
      technologies: ['React', 'Node.js', 'MongoDB', 'Google Maps API'],
      link: 'github.com/tmabena/township-directory',
    },
    {
      id: '2',
      name: 'Load Shedding Scheduler',
      description:
        'Built an intelligent scheduling app that helps South African businesses plan around Eskom load shedding. Integrated real-time stage updates and automated notifications.',
      technologies: ['React Native', 'Firebase', 'Push Notifications'],
      link: 'github.com/tmabena/loadshedding-app',
    },
  ],
};
