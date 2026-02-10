export default {
  name: 'company',
  title: 'Company',
  type: 'document',

  fields: [
    {
      name: 'name',
      title: 'Company Name',
      type: 'string',
      validation: Rule => Rule.required()
    },

    {
      name: 'logo',
      title: 'Company Logo',
      type: 'image',
      options: {
        hotspot: true
      },
      validation: Rule => Rule.required()
    },

    {
      name: 'website',
      title: 'Company Website',
      type: 'url'
    }
  ],

  preview: {
    select: {
      title: 'name',
      media: 'logo'
    }
  }
}

