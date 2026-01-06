export default {
  name: 'job',
  title: 'Job',
  type: 'document',
  fields: [
    { name: 'title', title: 'Job Title', type: 'string' },
    { name: 'company', title: 'Company', type: 'string' },
    { name: 'description', title: 'Job Description', type: 'text' },
    { name: 'location', title: 'Location', type: 'string' },
    { name: 'salary', title: 'Salary', type: 'string' },
    { name: 'applyLink', title: 'Application Link', type: 'url' },
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Internship / Graduate', value: 'internship' },
          { title: 'Temporary Contract', value: 'temporary' },
          { title: 'Freelance', value: 'freelance' }
        ]
      }
    },
    {
      name: 'jobType',
      title: 'Job Type',
      type: 'string',
      options: {
        list: ['Full-time', 'Part-time', 'Contract', 'Remote']
      }
    },
    { name: 'posted', title: 'Date Posted', type: 'date' },
    { name: 'deadline', title: 'Closing Date', type: 'date' },
    {
      name: 'views',
      title: 'Views',
      type: 'number',
      initialValue: 0,
      readOnly: true
    }
  ]
}
