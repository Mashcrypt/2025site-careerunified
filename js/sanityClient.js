export const sanityClient = sanityClient({
    projectId: 'qjg5raj1',
    dataset: 'production',
    apiVersion: '2026-01-08', // today’s date or current
    useCdn: true, // for faster read-only queries
});

