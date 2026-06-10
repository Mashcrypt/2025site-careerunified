export default {
  name: 'university',
  title: 'University',
  type: 'document',
  fields: [
    {
      name: 'name',
      title: 'University Name',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'slug',
      title: 'University URL',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96
      },
      description: 'Generate this when editing a university. Existing records also receive a compatible URL automatically.'
    },
    {
      name: 'applicationLink',
      title: 'Application Link',
      type: 'url',
      description: 'Full URL starting with https://',
      validation: Rule =>
        Rule.required().uri({
          allowRelative: false,
          scheme: ['http', 'https']
        })
    },
    {
      name: 'applicationFee',
      title: 'Application Fee',
      type: 'string',
      description: 'Optional application fee shown on the varsity listing, e.g. R300 or Free'
    },
    {
      name: 'registrationFee',
      title: 'Registration Fee',
      type: 'string',
      description: 'Optional registration fee shown on the varsity listing, e.g. R5 000 or Varies by programme'
    },
    {
      name: 'deadline',
      title: 'Application Deadline',
      type: 'date'
    },
    {
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Optional extra info (e.g. online applications open)'
    }
  ]
}

