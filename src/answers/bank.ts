/**
 * Canonical answers for questions that come up on most applications. JEV
 * maps a free-text field to one of these intents; Claude adapts the draft to
 * the company and the field's length. Every claim here traces to the profile.
 */

export const BANK_INTENTS: Record<string, string> = {
  why_company: "Why do you want to work at this company, or what interests you about us",
  why_role: "Why this role, team or internship specifically",
  about_yourself: "Tell us about yourself, a short bio, or a summary",
  proudest_project: "Describe a project you are proud of, your best work, or something you built",
  challenge: "Describe a hard problem, a challenge you overcame, or a failure and what you learned",
  strengths: "Your strengths, what you are good at, or what you bring",
  weakness: "A weakness or an area you are improving",
  teamwork: "Working in a team, collaboration, handling disagreement or conflict",
  leadership: "A time you led, took initiative or ownership",
  why_hire: "Why should we hire you, what makes you different",
  career_goals: "Career goals, where you see yourself, what you want to learn",
  technical_interest: "A technology, area or problem space you find interesting",
  ai_tools: "How you use AI or coding assistants in your work",
  additional_info: "Anything else you want us to know, additional information, comments",
  availability_details: "Details about availability, start date, work term length or hours",
  relocation_details: "Willingness or plans to relocate, or location preferences in prose",
  how_heard_details: "How you heard about the role, in prose",
  experience_summary: "Summarize your relevant experience with a technology or domain named in the question",
};

export type BankIntent = keyof typeof BANK_INTENTS;

/** Starting drafts. Placeholders in braces are filled by Claude from the job and profile. */
export const BANK_DRAFTS: Record<BankIntent, string> = {
  why_company:
    "{One sentence naming something specific this company builds or a problem it solves, from the posting.} I have spent the last two years building products people actually use, and I want to do that on a team whose work I would use myself. {One sentence connecting a concrete thing from the profile to what the company does.}",
  why_role:
    "I want a role where I ship real features and get feedback from users fast. That is what I did at BC Housing, where I shipped six React and TypeScript features for an app used by 80 staff, and it is what I do on my own products. {One sentence tying the role's stack or team to that.}",
  about_yourself:
    "I am a final-year Computing Science student at the University of Alberta, graduating April 2027. I build consumer and fintech software, mostly in TypeScript, React, React Native, Node and Postgres. I built and launched Philo, an iOS journal with 65,000 downloads, as the sole engineer, and I am the founder of Koba Money, a shared-finance product that runs inside iMessage. I have interned at BC Housing as a software engineer and at the Government of Alberta as a data analyst.",
  proudest_project:
    "Philo. It is an iOS thinking journal that matches what you write to quotes from 20,000 philosophers using local embeddings and vector search, with results in under 500 ms and no third-party ML APIs. I built it alone in React Native and Expo, launched it, and grew it to 65,000 downloads, 18,000 monthly users and 58 percent day-7 retention without paid acquisition. The hard part was making search feel instant on a phone without a server bill, which is why it runs locally.",
  challenge:
    "At BC Housing the app's first page load took 3.2 seconds and staff noticed. I profiled the bundle, split it by route, lazy-loaded the heavy views and cut unnecessary re-renders in the React components. Load time dropped to 1.8 seconds, a 44 percent improvement. The lesson was to measure first. Most of the time went to two components nobody suspected.",
  strengths:
    "I ship. I have taken two products from nothing to real users on my own, and in a team I am the person who gets the feature merged and tested. I also write tests without being asked. At BC Housing I added 45 Jest and React Testing Library tests and took frontend coverage from 54 to 81 percent.",
  weakness:
    "I am still building depth in algorithms and data structures. I learned by shipping products before I learned by solving puzzles, so I am working through that material deliberately now and it is improving every week.",
  teamwork:
    "At BC Housing I worked with a small team on a housing-management app used by 80 staff. I integrated eight REST endpoints that other engineers owned, which meant agreeing on error handling and validation up front rather than after things broke. I also run Index Competitive at the University of Alberta, a club that forms teams for hackathons, so most of what I do is making groups of people work well together quickly.",
  leadership:
    "I am the president of Index Competitive at the University of Alberta, a club that builds teams for hackathons and competitions. I also built the team-formation algorithm it uses to match members by skills, role preference and goals. Outside the club, being the only engineer on Philo and the founder of Koba Money means every decision about what to build and how is mine.",
  why_hire:
    "Because I have already done the job at a small scale. I built an app with 65,000 downloads by myself, shipped production features at BC Housing, and built a TypeScript and Postgres backend for Koba Money with concurrent message handling and duplicate-action prevention. I learn fast, I test my work, and I care that people actually use what I build.",
  career_goals:
    "I want to become an engineer who can own a product end to end, from the backend to what the user sees. The next few years are about doing that inside a strong team and learning how good engineering is done at scale, which I cannot learn alone.",
  technical_interest:
    "Systems that turn plain language into reliable actions. For Koba Money I built an LLM orchestration layer with persistent memory and tool execution, and the interesting problems were the boring-sounding ones: idempotency, concurrency, and making sure the model never does the same money transfer twice.",
  ai_tools:
    "I use AI coding tools every day and treat them like a fast junior pair. They write the first draft and I review, test and own the result. For anything that touches money or user data I read every line.",
  additional_info:
    "I am a Canadian citizen based in Edmonton, available to start in May 2027 and open to any term length. My work is at qendrimbeka.com and github.com/qbeka.",
  availability_details:
    "Available from May 2027 for any term length, including 4, 8, 12 or 16 months. Flexible on start date.",
  relocation_details:
    "Yes. Vancouver is my first choice, and I am open to anywhere in Canada or remote work. I would need visa sponsorship for a role in the United States.",
  how_heard_details: "LinkedIn.",
  experience_summary:
    "{Two to four sentences naming the exact technology from the question and the concrete places in the profile where it was used, with one number.}",
};

/** Cheap keyword match from a question to the closest intents, best first. */
export function closestIntents(question: string, limit = 3): BankIntent[] {
  const q = question.toLowerCase();
  const scores: Array<[BankIntent, number]> = (Object.keys(BANK_INTENTS) as BankIntent[]).map((intent) => {
    const words = `${intent.replace(/_/g, " ")} ${BANK_INTENTS[intent]}`.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const hits = words.filter((w) => q.includes(w)).length;
    return [intent, hits];
  });
  return scores.sort((a, b) => b[1] - a[1]).filter(([, s]) => s > 0).slice(0, limit).map(([i]) => i);
}
