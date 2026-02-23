import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import type { ResumeData, Experience, Education, Project } from '../types/resume';
import { EMPTY_RESUME } from '../types/resume';

interface ResumeBuilderProps {
  data: ResumeData;
  onChange: (data: ResumeData) => void;
}

export function ResumeBuilder({ data, onChange }: ResumeBuilderProps) {
  const [showClearModal, setShowClearModal] = useState(false);

  const updatePersonalInfo = (field: string, value: string) => {
    onChange({
      ...data,
      personalInfo: { ...data.personalInfo, [field]: value },
    });
  };

  const addExperience = () => {
    const newExp: Experience = {
      id: Date.now().toString(),
      position: '',
      company: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      description: '',
    };
    onChange({ ...data, experience: [...data.experience, newExp] });
  };

  const updateExperience = (id: string, field: string, value: string | boolean) => {
    onChange({
      ...data,
      experience: data.experience.map((exp) =>
        exp.id === id ? { ...exp, [field]: value } : exp
      ),
    });
  };

  const deleteExperience = (id: string) => {
    onChange({
      ...data,
      experience: data.experience.filter((exp) => exp.id !== id),
    });
  };

  const addEducation = () => {
    const newEdu: Education = {
      id: Date.now().toString(),
      degree: '',
      institution: '',
      location: '',
      graduationDate: '',
      gpa: '',
    };
    onChange({ ...data, education: [...data.education, newEdu] });
  };

  const updateEducation = (id: string, field: string, value: string) => {
    onChange({
      ...data,
      education: data.education.map((edu) =>
        edu.id === id ? { ...edu, [field]: value } : edu
      ),
    });
  };

  const deleteEducation = (id: string) => {
    onChange({
      ...data,
      education: data.education.filter((edu) => edu.id !== id),
    });
  };

  const addProject = () => {
    const newProject: Project = {
      id: Date.now().toString(),
      name: '',
      description: '',
      technologies: [],
      link: '',
    };
    onChange({ ...data, projects: [...(data.projects || []), newProject] });
  };

  const updateProject = (id: string, field: string, value: string | string[]) => {
    onChange({
      ...data,
      projects: (data.projects || []).map((proj) =>
        proj.id === id ? { ...proj, [field]: value } : proj
      ),
    });
  };

  const deleteProject = (id: string) => {
    onChange({
      ...data,
      projects: (data.projects || []).filter((proj) => proj.id !== id),
    });
  };

  const updateSkills = (value: string) => {
    onChange({ ...data, skills: value.split(',').map((s) => s.trim()).filter(Boolean) });
  };

  const handleClearTemplate = () => {
    onChange(EMPTY_RESUME);
    setShowClearModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Personal Information</CardTitle>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowClearModal(true)}
              title="Clear all pre-filled template content"
            >
              Clear template
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={data.personalInfo.fullName}
                onChange={(e) => updatePersonalInfo('fullName', e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={data.personalInfo.email}
                onChange={(e) => updatePersonalInfo('email', e.target.value)}
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={data.personalInfo.phone}
                onChange={(e) => updatePersonalInfo('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={data.personalInfo.location}
                onChange={(e) => updatePersonalInfo('location', e.target.value)}
                placeholder="San Francisco, CA"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="linkedin">LinkedIn (optional)</Label>
              <Input
                id="linkedin"
                value={data.personalInfo.linkedin || ''}
                onChange={(e) => updatePersonalInfo('linkedin', e.target.value)}
                placeholder="linkedin.com/in/johndoe"
              />
            </div>
            <div>
              <Label htmlFor="website">Website (optional)</Label>
              <Input
                id="website"
                value={data.personalInfo.website || ''}
                onChange={(e) => updatePersonalInfo('website', e.target.value)}
                placeholder="johndoe.com"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="summary">Professional Summary</Label>
            <Textarea
              id="summary"
              value={data.personalInfo.summary}
              onChange={(e) => updatePersonalInfo('summary', e.target.value)}
              placeholder="A brief summary of your professional background and goals..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* Experience */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Work Experience</CardTitle>
          <Button onClick={addExperience} size="sm" type="button">
            <Plus className="h-4 w-4 mr-2" />
            Add Experience
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.experience.map((exp, index) => (
            <div key={exp.id}>
              {index > 0 && <Separator className="mb-6" />}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Experience {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => deleteExperience(exp.id)}
                    aria-label="Delete experience"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Position</Label>
                    <Input
                      value={exp.position}
                      onChange={(e) => updateExperience(exp.id, 'position', e.target.value)}
                      placeholder="Software Engineer"
                    />
                  </div>
                  <div>
                    <Label>Company</Label>
                    <Input
                      value={exp.company}
                      onChange={(e) => updateExperience(exp.id, 'company', e.target.value)}
                      placeholder="Tech Corp"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={exp.location}
                      onChange={(e) => updateExperience(exp.id, 'location', e.target.value)}
                      placeholder="New York, NY"
                    />
                  </div>
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      value={exp.startDate}
                      onChange={(e) => updateExperience(exp.id, 'startDate', e.target.value)}
                      placeholder="Jan 2020"
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      value={exp.endDate}
                      onChange={(e) => updateExperience(exp.id, 'endDate', e.target.value)}
                      placeholder="Present"
                      disabled={exp.current}
                    />
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={exp.description}
                    onChange={(e) => updateExperience(exp.id, 'description', e.target.value)}
                    placeholder={
                      "• Led development of key features\n• Collaborated with cross-functional teams\n• Improved performance by 30%"
                    }
                    rows={4}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Education</CardTitle>
          <Button onClick={addEducation} size="sm" type="button">
            <Plus className="h-4 w-4 mr-2" />
            Add Education
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.education.map((edu, index) => (
            <div key={edu.id}>
              {index > 0 && <Separator className="mb-6" />}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Education {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => deleteEducation(edu.id)}
                    aria-label="Delete education"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Degree</Label>
                    <Input
                      value={edu.degree}
                      onChange={(e) => updateEducation(edu.id, 'degree', e.target.value)}
                      placeholder="Bachelor of Science in Computer Science"
                    />
                  </div>
                  <div>
                    <Label>Institution</Label>
                    <Input
                      value={edu.institution}
                      onChange={(e) => updateEducation(edu.id, 'institution', e.target.value)}
                      placeholder="Stanford University"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={edu.location}
                      onChange={(e) => updateEducation(edu.id, 'location', e.target.value)}
                      placeholder="Stanford, CA"
                    />
                  </div>
                  <div>
                    <Label>Graduation Date</Label>
                    <Input
                      value={edu.graduationDate}
                      onChange={(e) => updateEducation(edu.id, 'graduationDate', e.target.value)}
                      placeholder="May 2020"
                    />
                  </div>
                  <div>
                    <Label>GPA (optional)</Label>
                    <Input
                      value={edu.gpa || ''}
                      onChange={(e) => updateEducation(edu.id, 'gpa', e.target.value)}
                      placeholder="3.8/4.0"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <Label>Skills (comma-separated)</Label>
          <Textarea
            value={data.skills.join(', ')}
            onChange={(e) => updateSkills(e.target.value)}
            placeholder="JavaScript, React, Node.js, Python, AWS, Docker"
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Projects (Optional)</CardTitle>
          <Button onClick={addProject} size="sm" type="button">
            <Plus className="h-4 w-4 mr-2" />
            Add Project
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {(data.projects || []).map((proj, index) => (
            <div key={proj.id}>
              {index > 0 && <Separator className="mb-6" />}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Project {index + 1}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => deleteProject(proj.id)}
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Project Name</Label>
                    <Input
                      value={proj.name}
                      onChange={(e) => updateProject(proj.id, 'name', e.target.value)}
                      placeholder="E-commerce Platform"
                    />
                  </div>
                  <div>
                    <Label>Link (optional)</Label>
                    <Input
                      value={proj.link || ''}
                      onChange={(e) => updateProject(proj.id, 'link', e.target.value)}
                      placeholder="github.com/user/project"
                    />
                  </div>
                </div>

                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={proj.description}
                    onChange={(e) => updateProject(proj.id, 'description', e.target.value)}
                    placeholder="Built a full-stack e-commerce platform with payment integration..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Technologies (comma-separated)</Label>
                  <Input
                    value={proj.technologies.join(', ')}
                    onChange={(e) =>
                      updateProject(
                        proj.id,
                        'technologies',
                        e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                      )
                    }
                    placeholder="React, Node.js, MongoDB"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Clear Template Modal */}
      {showClearModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Clear all template content?</h2>

            <p className="mt-2 text-sm text-gray-600">
              This will remove all pre-filled personal info, summary, experience, education,
              skills, projects, and certifications.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowClearModal(false)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="destructive"
                onClick={handleClearTemplate}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
