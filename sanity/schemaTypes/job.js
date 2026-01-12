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
    },

    /* ===============================
       MONETISATION (CONTROLLED)
    =============================== */

    {
      name: 'listingTier',
      title: 'Listing Tier',
      type: 'string',
      description: 'Choose how this job is promoted',
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
      description: 'Required for Sponsored or Premier listings',
      hidden: ({ parent }) => parent?.listingTier === 'normal',
      validation: Rule =>
        Rule.custom((value, context) => {
          const tier = context.parent?.listingTier;
          if (tier !== 'normal' && !value) {
            return 'Promotion expiry date is required for Sponsored or Premier jobs';
          }
          return true;
        })
    },

    {
      name: 'badge',
      title: 'Custom Badge Text',
      type: 'string',
      description: 'Optional override (e.g. "Featured", "Top Employer")',
      hidden: ({ parent }) => parent?.listingTier === 'normal'
    }
  ],

  /* ===============================
     COMPUTED PREVIEW (VERY IMPORTANT)
  =============================== */

  preview: {
    select: {
      title: 'title',
      company: 'company',
      tier: 'listingTier',
      until: 'sponsoredUntil'
    },
    prepare({ title, company, tier, until }) {
      let subtitle = company;

      if (tier !== 'normal') {
        subtitle += ` • ${tier.toUpperCase()}`;
        if (until) subtitle += ` (until ${until})`;
      }

      return {
        title,
        subtitle
      };
    }
  }
}


