import { createClient } from 'https://cdn.skypack.dev/@sanity/client';

export const sanityClient = createClient({
  projectId: 'qjg5raj1',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true
});

