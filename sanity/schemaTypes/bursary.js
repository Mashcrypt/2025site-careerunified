// /schemas/bursary.js (or bursary.ts if you use TS)
const FACULTY_OPTIONS = [
  { title: "Accounting & Finance", value: "Accounting & Finance" },
  { title: "Arts & Humanities", value: "Arts & Humanities" },
  { title: "Commerce & Business", value: "Commerce & Business" },
  { title: "Computer Science & IT", value: "Computer Science & IT" },
  { title: "Construction & Built Environment", value: "Construction & Built Environment" },
  { title: "Engineering", value: "Engineering" },
  { title: "Health & Medical", value: "Health & Medical" },
  { title: "Law", value: "Law" },
  { title: "MBA & Postgraduate", value: "MBA & Postgraduate" },
  { title: "Nursing", value: "Nursing" },
  { title: "Science", value: "Science" },
  { title: "Government", value: "Government" },
  { title: "Student Loan", value: "Student Loan" },
];

export default {
  name: "bursary",
  title: "Bursary",
  type: "document",
  fields: [
    {
      name: "name",
      title: "Bursary Name",
      type: "string",
      validation: (Rule) =>
        Rule.required()
          .min(5)
          .error("Please enter a bursary name (min 5 characters)."),
    },
    {
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "name",
        maxLength: 96,
        slugify: (input) =>
          input
            .toLowerCase()
            .trim()
            .replace(/&/g, "and")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 96),
      },
      validation: (Rule) =>
        Rule.required().error('Slug is required. Click the "Generate" button.'),
      description:
        'Auto-generated URL-friendly version of the bursary name. Click "Generate".',
    },
    {
      name: "provider",
      title: "Provider",
      type: "string",
      validation: (Rule) =>
        Rule.required()
          .min(2)
          .error("Provider is required (e.g. Microsoft, NSFAS, Deloitte)."),
      description: "Company/organization offering the bursary.",
    },
    {
      name: "providerLogo",
      title: "Provider Logo",
      type: "image",
      options: {
        hotspot: true,
      },
      validation: (Rule) =>
        Rule.required().error(
          "Provider logo is required (this is used for social sharing previews)."
        ),
      description:
        "Logo used for bursary sharing preview (recommended: 1200×630 or larger).",
    },
    {
      name: "faculties",
      title: "Faculties / Categories",
      type: "array",
      options: {
        list: FACULTY_OPTIONS,
        layout: "tags",
      },
      of: [{ type: "string" }],
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (Array.isArray(value) && value.length) return true;
          if (context?.document?.faculty) return true;
          return "Please choose at least one faculty/category.";
        }),
      description:
        "Choose every faculty/category this bursary covers. For example: Engineering and Accounting & Finance.",
    },
    {
      name: "faculty",
      title: "Legacy Faculty / Category",
      type: "string",
      options: {
        list: FACULTY_OPTIONS,
      },
      hidden: true,
      readOnly: true,
      description:
        "Legacy single-faculty value kept for old bursaries. Use Faculties / Categories for new uploads.",
    },
    {
      name: "description",
      title: "Description",
      type: "text",
      rows: 6,
      validation: (Rule) =>
        Rule.required()
          .min(30)
          .error("Description is required (min 30 characters)."),
      description:
        "Short but informative description. First ~160 characters will be used in link previews.",
    },
    {
      name: "applicationLink",
      title: "Application Link",
      type: "url",
      validation: (Rule) =>
        Rule.uri({
          scheme: ["http", "https"],
        }).error("Application link must start with https:// (or http://)"),
      description: "Official application page link.",
    },
    {
      name: "deadline",
      title: "Closing Date",
      type: "date",
      options: {
        dateFormat: "YYYY-MM-DD",
      },
      initialValue: () => {
        // optional: default to 30 days from today (helps prevent blanks)
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      },
      validation: (Rule) => Rule.required().error("Closing date is required."),
    },
  ],

  preview: {
    select: {
      title: "name",
      subtitle: "provider",
      faculties: "faculties",
      legacyFaculty: "faculty",
      media: "providerLogo",
    },
    prepare({ title, subtitle, faculties, legacyFaculty, media }) {
      const facultyText = Array.isArray(faculties) && faculties.length ? faculties.join(", ") : legacyFaculty;
      return {
        title: title || "Untitled bursary",
        subtitle: [subtitle ? `Provider: ${subtitle}` : "Provider: Not set", facultyText].filter(Boolean).join(" | "),
        media,
      };
    },
  },
};

