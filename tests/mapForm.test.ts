import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ProfileSchema } from "../src/profile/schema.js";
import { PROFILE_KEYS, profileFacts, valueFor } from "../src/profile/fieldKeys.js";
import { authForCountry, planField, questionsFor, valueForJob } from "../src/forms/mapForm.js";
import { FieldsDump, type DumpedField } from "../src/forms/fields.js";
import type { Job } from "../src/jobs/normalize.js";

const profile = ProfileSchema.parse(JSON.parse(readFileSync(new URL("../data/profile.example.json", import.meta.url), "utf8")));
const job = (locations: string[]): Job => ({ id: "j", source: "t", company: "Acme", title: "SWE Intern", url: "https://x", ats: "greenhouse", locations, postedAt: null, terms: [], sponsorship: "unknown", degrees: [], category: null });
const field = (over: Partial<DumpedField>): DumpedField => ({ id: "f0", selector: "#x", kind: "text", name: "", label: "", hint: "", placeholder: "", required: false, value: "", options: [], accept: "", maxLength: null, autocomplete: "", buttonGroup: false, ...over });

describe("profile field keys", () => {
  it("has a value or a deliberate null for every key", () => {
    for (const key of Object.keys(PROFILE_KEYS) as Array<keyof typeof PROFILE_KEYS>) {
      expect(() => valueFor(profile, key)).not.toThrow();
    }
    expect(valueFor(profile, "full_name")).toBe("Ada Lovelace");
    expect(valueFor(profile, "phone_with_country_code")).toBe("+15555550123");
    expect(valueFor(profile, "graduation_date")).toBe("April 2027");
    expect(valueFor(profile, "salary_expectation")).toBeNull();
    expect(valueFor(profile, "gpa")).toBeNull();
  });
  it("flattens facts for a JEV state without empty values", () => {
    const facts = profileFacts(profile);
    expect(facts.email).toBe("ada@example.com");
    expect(facts).not.toHaveProperty("salary_expectation");
  });
});

describe("work authorization per posting country", () => {
  it("answers truthfully for Canada and the US", () => {
    expect(authForCountry(profile, "Canada")).toEqual({ authorized: "Yes", requires_sponsorship: "No" });
    expect(authForCountry(profile, "United States")).toEqual({ authorized: "No", requires_sponsorship: "Yes" });
    expect(valueForJob(profile, job(["Toronto, ON"]), "authorized_to_work")).toBe("Yes");
    expect(valueForJob(profile, job(["Austin, TX"]), "requires_sponsorship")).toBe("Yes");
  });
});

describe("questionsFor", () => {
  it("asks a key choice for text fields, an option choice for selects, a noul for checkboxes", () => {
    const q = questionsFor([
      field({ id: "f0", kind: "text", label: "First name" }),
      field({ id: "f1", kind: "select", label: "Are you authorized to work in Canada?", options: [{ value: "y", label: "Yes" }, { value: "n", label: "No" }] }),
      field({ id: "f2", kind: "checkbox", label: "I agree to the privacy policy" }),
      field({ id: "f3", kind: "file", label: "Resume" }),
    ]);
    expect(q.f0?.type).toBe("choice");
    expect(Object.keys((q.f0 as { criteria: Record<string, string> }).criteria)).toContain("first_name");
    expect(Object.keys((q.f0 as { criteria: Record<string, string> }).criteria)).toContain("bank:why_company");
    expect((q.f1 as { criteria: Record<string, string> }).criteria).toMatchObject({ o0: "Yes", o1: "No" });
    expect(q.f2?.type).toBe("noul");
    expect(q.f3).toBeUndefined();
  });
});

describe("planField", () => {
  const j = job(["Toronto, ON"]);
  it("fills a confidently mapped profile key", () => {
    const p = planField(field({ label: "Email" }), { type: "choice", choice: "email", probabilities: {}, confidence: 0.97 }, profile, j);
    expect(p).toMatchObject({ action: "fill", key: "email", value: "ada@example.com" });
  });
  it("sends low-confidence answers to review", () => {
    const p = planField(field({ label: "Favourite colour" }), { type: "choice", choice: "email", probabilities: {}, confidence: 0.3 }, profile, j);
    expect(p.action).toBe("review");
  });
  it("turns bank intents and free_text into drafts", () => {
    expect(planField(field({ kind: "textarea", label: "Why Acme?" }), { type: "choice", choice: "bank:why_company", probabilities: {}, confidence: 0.9 }, profile, j)).toMatchObject({ action: "draft", key: "why_company" });
    expect(planField(field({ kind: "textarea", label: "Anything else?" }), { type: "choice", choice: "free_text", probabilities: {}, confidence: 0.9 }, profile, j).action).toBe("draft");
  });
  it("picks select options by index and leaves optional ones unselected", () => {
    const sel = field({ kind: "select", label: "Gender", options: [{ value: "m", label: "Male" }, { value: "f", label: "Female" }] });
    expect(planField(sel, { type: "choice", choice: "o1", probabilities: {}, confidence: 0.95 }, profile, j)).toMatchObject({ action: "fill", value: "f", optionLabel: "Female" });
    expect(planField(sel, { type: "choice", choice: "__none__", probabilities: {}, confidence: 0.9 }, profile, j).action).toBe("skip");
    expect(planField({ ...sel, required: true }, { type: "choice", choice: "__none__", probabilities: {}, confidence: 0.9 }, profile, j).action).toBe("review");
  });
  it("gives the GPA only when the field is required", () => {
    const a = { type: "choice" as const, choice: "gpa", probabilities: {}, confidence: 0.95 };
    expect(planField(field({ label: "GPA" }), a, profile, j)).toMatchObject({ action: "skip" });
    expect(planField(field({ label: "GPA", required: true }), a, profile, j)).toMatchObject({ action: "fill", value: "3.50" });
  });
  it("checks consent boxes and leaves opt-ins alone", () => {
    expect(planField(field({ kind: "checkbox", label: "I certify the above is accurate" }), { type: "noul", noul: 0.95 }, profile, j)).toMatchObject({ action: "fill", value: "true" });
    expect(planField(field({ kind: "checkbox", label: "Send me job alerts" }), { type: "noul", noul: 0.05 }, profile, j).action).toBe("skip");
  });
  it("never fills salary", () => {
    const p = planField(field({ label: "Salary expectation" }), { type: "choice", choice: "salary_expectation", probabilities: {}, confidence: 0.95 }, profile, j);
    expect(p.action).toBe("skip");
  });
});

describe("captured form dumps", () => {
  it.each(["greenhouse", "ashby", "lever"])("%s dump parses and has no invisible validation inputs", (ats) => {
    const dump = FieldsDump.parse(JSON.parse(readFileSync(new URL(`./fixtures/dump-${ats}.json`, import.meta.url), "utf8")));
    expect(dump.fields.length).toBeGreaterThan(5);
    expect(dump.fields.every((f) => f.id && f.selector && f.label !== undefined)).toBe(true);
    const labels = dump.fields.filter((f) => f.kind !== "file" && f.kind !== "checkbox").map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(Object.keys(questionsFor(dump.fields)).length).toBe(dump.fields.filter((f) => f.kind !== "file").length);
  });
});
