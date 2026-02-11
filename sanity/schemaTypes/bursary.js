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
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
      validation: Rule => Rule.required(),
      description: 'Auto-generated URL-friendly version of the bursary name. Click "Generate" button.'
    },
    {
      name: 'provider',
      title: 'Provider',
      type: 'string'
    },
    {
      name: 'providerLogo',
      title: 'Provider Logo',
      type: 'image',
      options: {
        hotspot: true
      },
      description: 'Logo of the company/organization offering the bursary (recommended: 1200x630px)'
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
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'provider',
      media: 'providerLogo'
    }
  }
}
