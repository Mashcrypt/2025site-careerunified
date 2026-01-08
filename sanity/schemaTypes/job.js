export default {
  name: 'job',
  title: 'Job',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Job Title',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'company',
      title: 'Company',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'description',
      title: 'Job Description',
      type: 'text',
      validation: Rule => Rule.required()
    },
    {
      name: 'location',
      title: 'Location',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'salary',
      title: 'Salary',
      type: 'string'
    },
    {
      name: 'applyLink',
      title: 'Application Link',
      type: 'url',
      validation: Rule => Rule.required().uri({ allowRelative: false })
    },
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Internship / Graduate', value: 'internship' },
          { title: 'Temporary Contract', value: 'temporary' },
          { title: 'Freelance', value: 'freelance' }
        ],
        layout: 'radio'
      },
      validation: Rule => Rule.required()
    },
    {
      name: 'jobType',
      title: 'Job Type',
      type: 'string',
      options: {
        list: ['Full-time', 'Part-time', 'Contract', 'Remote']
      }
    },
    {
      name: 'posted',
      title: 'Date Posted',
      type: 'date',
      validation: Rule => Rule.required()
    },
    {
      name: 'deadline',
      title: 'Closing Date',
      type: 'date',
      validation: Rule => Rule.required()
    }
  ]
}

