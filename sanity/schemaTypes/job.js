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
    maxLength: 80
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
          { title: 'Learnershi', value: 'learnership' },
          { title: 'Part-time', value: 'part-time' },
          { title: 'Graduate Program', value: 'graduate program' },
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
       MONETISATION / PROMOTION
    =============================== */

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
          const tier = context.parent?.listingTier;
          if (tier !== 'normal' && !value) {
            return 'Promotion expiry date is required';
          }
          return true;
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

  /* ===============================
     SANITY STUDIO PREVIEW
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

      if (tier && tier !== 'normal') {
        subtitle += ` • ${tier.toUpperCase()}`;
        if (until) subtitle += ` (until ${until})`;
      }

      return {
        title,
        subtitle
      };
    }
  }
};



