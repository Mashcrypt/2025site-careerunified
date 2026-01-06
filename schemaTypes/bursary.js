export default {
  name: 'bursary',
  title: 'Bursary',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'Bursary Name',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'provider',
      title: 'Provider',
      type: 'string'
    },
    {
      name: 'faculty',
      title: 'Faculty / Category',
      type: 'string',
      options: {
        list: [
          'Accounting & Finance',
          'Arts & Humanities',
          'Commerce & Business',
          'Computer Science & IT',
          'Construction & Built Environment',
          'Engineering',
          'Health & Medical',
          'Law',
          'MBA & Postgraduate',
          'Nursing',
          'Science',
          'Government',
          'Student Loan'
        ]
      }
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text'
    },
    {
      name: 'applicationLink',
      title: 'Application Link',
      type: 'url'
    },
    {
      name: 'deadline',
      title: 'Closing Date',
      type: 'date'
    }
  ]
}
