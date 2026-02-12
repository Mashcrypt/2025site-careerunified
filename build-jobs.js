const fs = require("fs");
const https = require("https");

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

const url =
  "https://" +
  PROJECT_ID +
  ".api.sanity.io/v2023-08-01/data/query/" +
  DATASET +
  "?query=" +
  encodeURIComponent(query);

https.get(url, res => {
  let data = "";

  res.on("data", chunk => {
    data += chunk;
  });

  res.on("end", () => {
    const json = JSON.parse(data);

    const template = fs.readFileSync("jobs-template.html", "utf8");

    fs.mkdirSync("jobs", { recursive: true });

    json.result.forEach(job => {
      let html = template
        .replace(/{{title}}/g, job.title)
        .replace(/{{company}}/g, job.company || "")
        .replace(/{{location}}/g, job.location || "")
        .replace(/{{salary}}/g, job.salary || "Not specified")
        .replace(/{{deadline}}/g, job.deadline || "")
        .replace(/{{logo}}/g, job.logo || "https://careerunified.com/default-logo.png")
        .replace(/{{slug}}/g, job.slug.current)
        .replace(/{{id}}/g, job._id);

      fs.writeFileSync(`jobs/${job.slug.current}.html`, html);
    });

    console.log("Jobs built successfully");
  });
});

