// tdh patch (2026-10-07): read-only marketplace skill listings (skills.sh +
// skillsmp.com) surfaced in the Skills Discover view. HTML scraping is a
// deliberate ceiling — swap for a real API/registry (SCPR) when one lands.

export type MarketplaceSkill = {
  key: string;
  name: string;
  owner: string;
  repo: string;
  url: string;
  source: "skills-sh" | "skillsmp";
};

export type MarketplaceListing = {
  fetchedAt: string;
  sources: { id: string; label: string; siteUrl: string; count: number }[];
  skills: MarketplaceSkill[];
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const SKILLS_SH_MAX = 200;
let cache: { at: number; data: MarketplaceListing } | null = null;

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "paperclip-skills-marketplace" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseSkillsSh(html: string): MarketplaceSkill[] {
  const out: MarketplaceSkill[] = [];
  const seen = new Set<string>();
  const excludeOwners = new Set(["_next", "agent", "site", "trending", "hot", "api"]);
  const re = /href="\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)"/g;
  for (const m of html.matchAll(re)) {
    const [, owner, repo, name] = m;
    if (excludeOwners.has(owner) || owner.includes(".") || repo.includes(".css")) continue;
    const key = `${owner}/${repo}/${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name, owner, repo, url: `https://www.skills.sh/${key}`, source: "skills-sh" });
    if (out.length >= SKILLS_SH_MAX) break;
  }
  return out;
}

function parseSkillsMp(html: string): MarketplaceSkill[] {
  const out: MarketplaceSkill[] = [];
  const seen = new Set<string>();
  const re = /href="\/creators\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/skills-([a-z0-9-]+)"/g;
  for (const m of html.matchAll(re)) {
    const [, owner, repo, name] = m;
    const key = `${owner}/${repo}/${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name,
      owner,
      repo,
      url: `https://skillsmp.com/creators/${owner}/${repo}/skills-${name}`,
      source: "skillsmp",
    });
  }
  return out;
}

// Alternate sources so the smaller directory stays visible in the initial view.
function interleaveSources(a: MarketplaceSkill[], b: MarketplaceSkill[]): MarketplaceSkill[] {
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  const out: MarketplaceSkill[] = [];
  for (let i = 0; i < longer.length; i += 1) {
    out.push(longer[i]);
    if (i < shorter.length) out.push(shorter[i]);
  }
  return out;
}

export async function listMarketplaceSkills(force = false): Promise<MarketplaceListing> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const [shHtml, mpHtml] = await Promise.all([
    fetchText("https://www.skills.sh/"),
    fetchText("https://skillsmp.com/skills"),
  ]);
  const skillsSh = shHtml ? parseSkillsSh(shHtml) : [];
  const skillsMp = mpHtml ? parseSkillsMp(mpHtml) : [];
  const data: MarketplaceListing = {
    fetchedAt: new Date().toISOString(),
    sources: [
      { id: "skills-sh", label: "skills.sh", siteUrl: "https://www.skills.sh", count: skillsSh.length },
      { id: "skillsmp", label: "skillsmp.com", siteUrl: "https://skillsmp.com/skills", count: skillsMp.length },
    ],
    skills: interleaveSources(skillsSh, skillsMp),
  };
  cache = { at: Date.now(), data };
  return data;
}
