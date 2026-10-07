// tdh patch (2026-10-07): marketplace skill listings from the skillsmp.com
// REST API (skills.sh removed by owner decision). Server-side fetch rides
// PAPERCLIP_REMOTE_HTTP_PROXY (skillsmp is unreachable direct from dev-01);
// the API key comes from PAPERCLIP_SKILLSMP_API_KEY. Installs flow through
// the stock skill-import path using owner/repo/skill-dir sources.

import https from "node:https";
import net from "node:net";
import tls from "node:tls";

export type MarketplaceSkill = {
  key: string;
  name: string;
  author: string;
  description: string | null;
  stars: number | null;
  url: string;
  githubUrl: string | null;
  /** owner/repo[/skill-dir] — accepted by POST /skills/import. */
  installSource: string | null;
  source: "skillsmp";
};

export type MarketplaceListing = {
  fetchedAt: string;
  sources: { id: string; label: string; siteUrl: string; count: number }[];
  skills: MarketplaceSkill[];
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const API_BASE = "https://skillsmp.com/api/v1/skills/search";
// The API is keyword-search only; seeds approximate a general listing.
const SEEDS = ["agent", "code", "test", "design", "data", "automation", "review", "writing", "security", "browser"];
let cache: { at: number; data: MarketplaceListing } | null = null;

type SkillsMpRaw = {
  id?: string;
  name?: string;
  author?: string;
  description?: string;
  stars?: number;
  skillUrl?: string;
  githubUrl?: string;
};

function proxyUrl(): URL | null {
  const raw = process.env.PAPERCLIP_REMOTE_HTTP_PROXY?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function connectAgent(proxy: URL): https.Agent {
  const agent = new https.Agent({ keepAlive: false });
  agent.createConnection = ((opts: { host?: string; port?: number; servername?: string }, cb: (error: Error | null, socket: tls.TLSSocket | net.Socket) => void) => {
    const host = opts.host ?? "";
    const port = opts.port ?? 443;
    const raw = net.connect({ host: proxy.hostname, port: Number(proxy.port) || 80 });
    raw.once("connect", () => {
      raw.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
      let head = "";
      const onData = (chunk: Buffer) => {
        head += chunk.toString("latin1");
        if (!head.includes("\r\n\r\n")) return;
        raw.off("data", onData);
        if (!/^HTTP\/1\.[01] 2\d\d/.test(head)) {
          cb(new Error("egress proxy refused CONNECT"), raw);
          return;
        }
        const secure = tls.connect({ socket: raw, servername: opts.servername ?? host });
        secure.once("secureConnect", () => cb(null, secure));
        secure.once("error", (error) => cb(error, raw));
      };
      raw.on("data", onData);
    });
    raw.once("error", (error) => cb(error, raw));
  }) as never;
  return agent;
}

function httpGetJson(url: string, headers: Record<string, string>, timeoutMs = 15_000): Promise<unknown | null> {
  return new Promise((resolve) => {
    const target = new URL(url);
    const proxy = proxyUrl();
    const request = https.request(target, {
      method: "GET",
      headers: { ...headers, Accept: "application/json", "User-Agent": "paperclip-skills-marketplace" },
      timeout: timeoutMs,
      ...(proxy ? { agent: connectAgent(proxy) } : {}),
    }, (response) => {
      if ((response.statusCode ?? 0) !== 200) {
        response.resume();
        resolve(null);
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
      response.on("error", () => resolve(null));
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
    request.end();
  });
}

function deriveInstallSource(githubUrl: string | null): string | null {
  if (!githubUrl) return null;
  const tree = githubUrl.match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/tree\/[^/]+\/(.+?)\/?$/);
  if (tree) {
    const [, owner, repo, path] = tree;
    const segments = path.split("/").filter(Boolean);
    const dir = segments[segments.length - 1];
    return dir ? `${owner}/${repo}/${dir}` : `${owner}/${repo}`;
  }
  const root = githubUrl.match(/^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  return root ? `${root[1]}/${root[2]}` : null;
}

async function fetchSkillsMp(): Promise<MarketplaceSkill[]> {
  const key = process.env.PAPERCLIP_SKILLSMP_API_KEY?.trim();
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  const seeds = key ? SEEDS : ["agent"];
  const limit = key ? 50 : 20;
  const byId = new Map<string, SkillsMpRaw>();
  await Promise.all(
    seeds.map(async (seed) => {
      const url = `${API_BASE}?q=${encodeURIComponent(seed)}&limit=${limit}&sortBy=stars`;
      const json = (await httpGetJson(url, headers)) as { data?: { skills?: SkillsMpRaw[] } } | null;
      for (const raw of json?.data?.skills ?? []) {
        if (raw.id && raw.name) byId.set(raw.id, raw);
      }
    }),
  );
  return [...byId.values()].map((raw) => ({
    key: raw.id ?? "",
    name: raw.name ?? "",
    author: raw.author ?? "unknown",
    description: raw.description ?? null,
    stars: typeof raw.stars === "number" ? raw.stars : null,
    url: raw.skillUrl ?? "https://skillsmp.com/skills",
    githubUrl: raw.githubUrl ?? null,
    installSource: deriveInstallSource(raw.githubUrl ?? null),
    source: "skillsmp" as const,
  }));
}

export async function listMarketplaceSkills(force = false): Promise<MarketplaceListing> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const skills = await fetchSkillsMp();
  const data: MarketplaceListing = {
    fetchedAt: new Date().toISOString(),
    sources: [
      { id: "skillsmp", label: "skillsmp.com", siteUrl: "https://skillsmp.com/skills", count: skills.length },
    ],
    skills,
  };
  cache = { at: Date.now(), data };
  return data;
}
