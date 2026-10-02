import { describe, expect, it } from "vitest";
import { ageDays, atsFromUrl, canonicalUrl, dedupe, jobId, parseLooseDate, type Job } from "../src/jobs/normalize.js";

describe("canonicalUrl and jobId", () => {
  it("drops tracking params and fragments so duplicates collapse", () => {
    const a = canonicalUrl("https://jobs.ashbyhq.com/replit/7e0d?utm_source=github-vansh-ouckah&ref=Simplify#top");
    const b = canonicalUrl("https://jobs.ashbyhq.com/replit/7e0d");
    expect(a).toBe(b);
    expect(jobId(a)).toBe(jobId(b));
  });
  it("keeps params that identify the job", () => {
    expect(canonicalUrl("https://stripe.com/jobs/search?gh_jid=8157838&utm_source=x")).toBe("https://stripe.com/jobs/search?gh_jid=8157838");
  });
});

describe("atsFromUrl", () => {
  it.each([
    ["https://job-boards.greenhouse.io/doordashcanada/jobs/8170944", "greenhouse"],
    ["https://stripe.com/jobs/search?gh_jid=8157838", "greenhouse"],
    ["https://jobs.lever.co/matchgroup/69396299/apply", "lever"],
    ["https://jobs.ashbyhq.com/cohere/8c035d3d", "ashby"],
    ["https://intactfc.wd3.myworkdayjobs.com/en-US/intactfc/job/x", "workday"],
    ["https://careers-kinaxis.icims.com/jobs/35372/job", "icims"],
    ["https://amazon.jobs/en/jobs/10553947/x", "amazon"],
    ["https://egup.fa.us2.oraclecloud.com/hcmUI/x", "oracle"],
    ["https://www.tesla.com/careers/search/job/x", "other"],
  ])("%s → %s", (url, ats) => {
    expect(atsFromUrl(url)).toBe(ats);
  });
});

describe("parseLooseDate", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("parses full and year-less dates", () => {
    expect(parseLooseDate("Sep 29, 2026", now)).toBe("2026-09-29");
    expect(parseLooseDate("Sep 09", now)).toBe("2026-09-09");
    expect(parseLooseDate("Sept 5", now)).toBe("2026-09-05");
    expect(parseLooseDate("2026-08-21", now)).toBe("2026-08-21");
  });
  it("assumes last year when a year-less date would be in the future", () => {
    expect(parseLooseDate("Dec 20", now)).toBe("2025-12-20");
  });
  it("returns null for junk", () => {
    expect(parseLooseDate("Rolling", now)).toBeNull();
  });
});

describe("ageDays and dedupe", () => {
  const base: Job = { id: "x", source: "a", company: "C", title: "T", url: "https://x", ats: "other", locations: [], postedAt: "2026-09-30", terms: [], sponsorship: "unknown", degrees: [], category: null };
  it("computes whole days", () => {
    expect(ageDays(base, new Date("2026-10-02T23:00:00Z"))).toBe(2);
    expect(ageDays({ postedAt: null })).toBeNull();
  });
  it("merges duplicates and keeps the richer record", () => {
    const a = { ...base, locations: ["Toronto, ON"], sponsorship: "unknown" as const };
    const b = { ...base, source: "b", locations: [], postedAt: null, sponsorship: "offers" as const };
    const [m] = dedupe([a, b]);
    expect(m?.locations).toEqual(["Toronto, ON"]);
    expect(m?.postedAt).toBe("2026-09-30");
    expect(m?.sponsorship).toBe("offers");
    expect(m?.source).toBe("a+b");
  });
});

describe("applyUrlFor", () => {
  it("builds direct form urls for the three main ATSs", async () => {
    const { applyUrlFor } = await import("../src/jobs/normalize.js");
    expect(applyUrlFor({ ats: "greenhouse", url: "https://job-boards.greenhouse.io/pinterest/jobs/8138049" })).toBe("https://boards.greenhouse.io/embed/job_app?for=pinterest&token=8138049");
    expect(applyUrlFor({ ats: "greenhouse", url: "https://stripe.com/jobs/search?gh_jid=8157838" })).toBe("https://stripe.com/jobs/search?gh_jid=8157838");
    expect(applyUrlFor({ ats: "lever", url: "https://jobs.lever.co/matchgroup/69396299-e587-4063-aef6-0ce2fd66e9ee" })).toBe("https://jobs.lever.co/matchgroup/69396299-e587-4063-aef6-0ce2fd66e9ee/apply");
    expect(applyUrlFor({ ats: "ashby", url: "https://jobs.ashbyhq.com/cohere/8c035d3d-081d-4c8a-914a-72f4efaad254" })).toBe("https://jobs.ashbyhq.com/cohere/8c035d3d-081d-4c8a-914a-72f4efaad254/application");
    expect(applyUrlFor({ ats: "other", url: "https://x/y" })).toBe("https://x/y");
  });
});
