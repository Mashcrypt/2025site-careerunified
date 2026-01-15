export default {
  name: 'recruiter',
  title: 'Recruiter',
  type: 'document',

  fields: [
    /* ===============================
       LINK TO AUTH SYSTEM
    =============================== */
    {
      name: 'userId',
      title: 'Firebase User ID',
      type: 'string',
      description: 'Must match Firebase UID',
      validation: Rule => Rule.required()
    },

    {
      name: 'email',
      title: 'Recruiter Email',
      type: 'string',
      validation: Rule =>
        Rule.required().regex(
          /^[^@]+@[^@]+\.[^@]+$/,
          'Valid email required'
        )
    },

    /* ===============================
       COMPANY RELATION
    =============================== */
    {
      name: 'company',
      title: 'Company',
      type: 'reference',
      to: [{ type: 'company' }],
      validation: Rule => Rule.required()
    },

    {
      name: 'jobTitle',
      title: 'Job Title / Role',
      type: 'string',
      description: 'e.g. Talent Manager, HR Lead',
      validation: Rule => Rule.required()
    },

    /* ===============================
       VERIFICATION STATUS
    =============================== */
    {
      name: 'status',
      title: 'Verification Status',
      type: 'string',
      options: {
        list: [
          { title: 'Pending Review', value: 'pending' },
          { title: 'Verified', value: 'verified' },
          { title: 'Rejected', value: 'rejected' },
          { title: 'Suspended', value: 'suspended' }
        ],
        layout: 'radio'
      },
      initialValue: 'pending',
      validation: Rule => Rule.required()
    },

    {
      name: 'verifiedAt',
      title: 'Verified At',
      type: 'datetime',
      hidden: ({ parent }) => parent?.status !== 'verified'
    },

    {
      name: 'rejectionReason',
      title: 'Rejection Reason',
      type: 'text',
      hidden: ({ parent }) => parent?.status !== 'rejected'
    },

    /* ===============================
       PLAN & ACCESS CONTROL
    =============================== */
    {
      name: 'plan',
      title: 'Recruiter Plan',
      type: 'string',
      options: {
        list: [
          { title: 'Free', value: 'free' },
          { title: 'Sponsored', value: 'sponsored' },
          { title: 'Premier', value: 'premier' }
        ]
      },
      initialValue: 'free',
      validation: Rule => Rule.required()
    },

    {
      name: 'credits',
      title: 'CV View Credits',
      type: 'number',
      initialValue: 0,
      hidden: ({ parent }) => parent?.plan === 'premier'
    },

    /* ===============================
       LEGAL & COMPLIANCE
    =============================== */
    {
      name: 'acceptedDataPolicy',
      title: 'Accepted Data Protection Agreement',
      type: 'boolean',
      initialValue: false,
      validation: Rule =>
        Rule.custom(val =>
          val === true ? true : 'Must accept data protection terms'
        )
    }
  ],

  preview: {
    select: {
      email: 'email',
      status: 'status',
      plan: 'plan'
    },
    prepare({ email, status, plan }) {
      return {
        title: email,
        subtitle: `${status.toUpperCase()} • ${plan}`
      }
    }
  }
}
