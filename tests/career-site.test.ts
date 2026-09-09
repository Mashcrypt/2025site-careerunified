import assert from "node:assert/strict";
import test from "node:test";
import {companySlugFromHost, isPublishedJob, RESERVED_CAREER_SUBDOMAINS, slugifyCompanyName, validCompanySlug} from "../netlify/functions/_careerSite";

test("company names become stable kebab-case slugs", () => {
  assert.equal(slugifyCompanyName("ABC & Sons (Pty) Ltd"), "abc-sons-pty-ltd");
  assert.equal(slugifyCompanyName("!!!"), "company");
});

test("host resolution accepts tenant hosts and rejects reserved or malformed slugs", () => {
  assert.equal(companySlugFromHost(new Request("https://abc.careerunified.com")), "abc");
  assert.equal(companySlugFromHost(new Request("http://abc.localhost:8888")), "abc");
  assert.equal(companySlugFromHost(new Request("http://abc.127.0.0.1.nip.io:8888")), "abc");
  assert.equal(validCompanySlug("abc"), true);
  assert.equal(validCompanySlug("bad_slug"), false);
  assert.equal(RESERVED_CAREER_SUBDOMAINS.has("admin"), true);
});

test("only the owning recruiter published open jobs are public", () => {
  const base = {recruiterId: "company-a", status: "active", title: "Engineer", description: "Build things"};
  assert.equal(isPublishedJob(base, "company-a"), true);
  assert.equal(isPublishedJob({...base, recruiterId: "company-b"}, "company-a"), false);
  assert.equal(isPublishedJob({...base, status: "draft"}, "company-a"), false);
  assert.equal(isPublishedJob({...base, deadline: "2000-01-01"}, "company-a"), false);
});
