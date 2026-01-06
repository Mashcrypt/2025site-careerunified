export default {
  name: 'cvTip',
  title: 'CV Tip',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          'Formatting Tips',
          'Content Tips',
          'Common Mistakes',
          'Interview Preparation Tips'
        ]
      },
      validation: Rule => Rule.required()
    },
    {
      name: 'content',
      title: 'Content',
      type: 'text',
      validation: Rule => Rule.required()
    }
  ]
}
