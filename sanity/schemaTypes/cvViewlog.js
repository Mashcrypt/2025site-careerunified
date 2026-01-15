export default {
  name: 'cvViewLog',
  title: 'CV View Log',
  type: 'document',

  fields: [
    {
      name: 'recruiter',
      title: 'Recruiter',
      type: 'reference',
      to: [{ type: 'recruiter' }],
      validation: Rule => Rule.required()
    },

    {
      name: 'candidateId',
      title: 'Candidate ID',
      type: 'string',
      description: 'Firebase UID of candidate',
      validation: Rule => Rule.required()
    },

    {
      name: 'cvId',
      title: 'CV ID',
      type: 'string',
      validation: Rule => Rule.required()
    },

    {
      name: 'viewedAt',
      title: 'Viewed At',
      type: 'datetime',
      initialValue: () => new Date().toISOString()
    },

    {
      name: 'action',
      title: 'Action Type',
      type: 'string',
      options: {
        list: ['preview', 'download']
      }
    }
  ]
}
