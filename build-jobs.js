import fs from "fs";
import fetch from "node-fetch";

const PROJECT_ID = "qjg5raj1";
const DATASET = "production";

const query = `
*[_type=="job"]{
  _id,
  title,
  slug,
  location,
  salary,
  deadline,
  "company": company->name,
  "logo": company->logo.asset->url
}
`;

const url = `https://${PROJECT_ID}.api.sanity.io/v2023-08-01/data/query/${DATASET}?query=${encodeURIComponent(query)}`;

const res = await fetch(url);
const data = await res.json();

const template = fs.readFileSync("jobs-template.html", "utf8");

fs.mkdirSync("jobs", { recursive: true });

data.result.forEach(job => {
  let html = template
    .replaceAll("{{title}}", job.title)
    .replaceAll("{{company}}", job.company)
    .replaceAll("{{location}}", job.location)
    .replaceAll("{{salary}}", job.salary || "Not specified")
    .replaceAll("{{deadline}}", job.deadline)
    .replaceAll("{{logo}}", job.logo || "https://careerunified.com/default-logo.png")
    .replaceAll("{{slug}}", job.slug.current)
    .replaceAll("{{id}}", job._id);

  fs.writeFileSync(`jobs/${job.slug.current}.html`, html);
});
