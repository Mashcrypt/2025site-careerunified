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
      name: 'applicationLink',
      title: 'Application Link',
      type: 'url',
      validation: Rule => Rule.required()
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
