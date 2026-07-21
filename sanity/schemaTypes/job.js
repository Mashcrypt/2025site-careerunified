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
      name: 'slug',
      title: 'Job URL',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 120,
        slugify: input =>
          input
            .toLowerCase()
            .trim()
            .replace(/&/g, 'and')
            .replace(/[-_]+/g, ' ')
            .replace(/\bapply\s+now\b/g, '')
            .replace(/\bclosing\s+soon\b/g, '')
            .replace(/\bor\s+apply\b/g, '')
            .replace(/\bapply\b$/g, '')
            .replace(/\bor\b/g, '')
            .replace(/speciliast/g, 'specialist')
            .replace(/machanical/g, 'mechanical')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 120)
            .replace(/-+$/g, '')
      },
      validation: Rule => Rule.required()
    },

    {
      name: 'company',
      title: 'Company',
      type: 'reference',
      to: [{ type: 'company' }],
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
      validation: Rule =>
        Rule.required().uri({ allowRelative: false })
    },

    {
      name: 'category',
      title: 'Category',
      type: 'string',
      options: {
        list: [
          { title: 'Internship / Graduate', value: 'internship' },
          { title: 'Temporary Contract', value: 'temporary' },
          { title: 'Permanent', value: 'permanent' },
          { title: 'Learnership', value: 'learnership' },
          { title: 'Part-time', value: 'part-time' },
          { title: 'Graduate Program', value: 'graduate-program' },
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
      description: 'Use this only when the advert gives an exact closing date. Leave blank for unspecified or open-ended adverts.'
    },

    {
      name: 'deadlineText',
      title: 'Closing Date Text',
      type: 'string',
      description: 'Shown to users when there is no exact date, e.g. "Unspecified", "Open until filled", or "Apply as soon as possible".',
      options: {
        list: [
          { title: 'Unspecified', value: 'Unspecified' },
          { title: 'Open until filled', value: 'Open until filled' },
          { title: 'Apply as soon as possible', value: 'Apply as soon as possible' },
          { title: 'Not stated in advert', value: 'Not stated in advert' }
        ]
      },
      validation: Rule =>
        Rule.custom((value, context) => {
          if (!context.parent?.deadline && !value) {
            return 'Add an exact closing date or a closing date text label.'
          }
          return true
        })
    },

    {
      name: 'listingTier',
      title: 'Listing Tier',
      type: 'string',
      description: 'Select how this job is promoted',
      options: {
        list: [
          { title: 'Normal (Free)', value: 'normal' },
          { title: 'Sponsored', value: 'sponsored' },
          { title: 'Premier', value: 'premier' }
        ],
        layout: 'radio'
      },
      initialValue: 'normal',
      validation: Rule => Rule.required()
    },

    {
      name: 'sponsoredUntil',
      title: 'Promotion Active Until',
      type: 'date',
      description: 'Required for Sponsored or Premier jobs',
      hidden: ({ parent }) => parent?.listingTier === 'normal',
      validation: Rule =>
        Rule.custom((value, context) => {
          const tier = context.parent?.listingTier
          if (tier !== 'normal' && !value) {
            return 'Promotion expiry date is required'
          }
          return true
        })
    },

    {
      name: 'badge',
      title: 'Custom Badge Text',
      type: 'string',
      description: 'Optional (e.g. Featured, Top Employer)',
      hidden: ({ parent }) => parent?.listingTier === 'normal'
    }
  ],

  preview: {
    select: {
      title: 'title',
      companyName: 'company.name',
      deadline: 'deadline',
      deadlineText: 'deadlineText',
      tier: 'listingTier',
      until: 'sponsoredUntil'
    },

    prepare({ title, companyName, deadline, deadlineText, tier, until }) {
      let subtitle = companyName || 'No company'
      subtitle += ` | Closing: ${deadlineText || deadline || 'Not specified'}`

      if (tier && tier !== 'normal') {
        subtitle += ` | ${tier.toUpperCase()}`
        if (until) subtitle += ` (until ${until})`
      }

      return {
        title,
        subtitle
      }
    }
  }
}
