// ================================
// Resume Types
// ================================

export interface ResumeData {
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    website?: string;
    driversLicense?: string;
    summary: string;
  };
  experience: Experience[];
  education: Education[];
  skills: string[];
  projects?: Project[];
  certifications?: string[];
}

export interface Experience {
  id: string;
  position: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  link?: string;
}

export type TemplateType =
  | 'modern'
  | 'professional'
  | 'creative'
  | 'minimalist';

// ================================
// Empty Resume (Clear Template)
// ================================

export const EMPTY_RESUME: ResumeData = {
  personalInfo: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    website: '',
    driversLicense: '',
    summary: '',
  },
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
};
