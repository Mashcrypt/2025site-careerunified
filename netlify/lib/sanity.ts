import { createClient } from "https://esm.sh/@sanity/client";

const client = createClient({
  projectId: "qjg5raj1",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: true
});

export async function getJob(id: string) {
  return await client.fetch(
    `*[_type == "job" && _id == $id][0]{
      _id,
      title,
      description,
      location,
      salary,
      posted,
      deadline,
      "company": company->{
        name,
        "logo": logo.asset->{
          url
        }
      }
    }`,
    { id }
  );
}
