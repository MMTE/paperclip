import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink } from "lucide-react";
import { companySkillsApi, type MarketplaceListing, type MarketplaceSkill } from "../api/companySkills";

const INITIAL_ROWS = 24;

const SOURCE_LABEL: Record<MarketplaceSkill["source"], string> = {
  "skills-sh": "skills.sh",
  skillsmp: "skillsmp.com",
};

function MarketplaceRow({ skill }: { skill: MarketplaceSkill }) {
  const [copied, setCopied] = useState(false);
  const install =
    skill.source === "skills-sh"
      ? `npx skills add ${skill.owner}/${skill.repo}`
      : skill.url;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{skill.name}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-(length:--text-micro) text-muted-foreground">
            {SOURCE_LABEL[skill.source]}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {skill.owner}/{skill.repo}
        </p>
      </div>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Copy install command"
        aria-label={`Copy install command for ${skill.name}`}
        onClick={() => {
          void navigator.clipboard?.writeText(install).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <a
        href={skill.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Open on the marketplace"
        aria-label={`Open ${skill.name} on ${SOURCE_LABEL[skill.source]}`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function MarketplaceSection() {
  const listing = useQuery<MarketplaceListing>({
    queryKey: ["skills-marketplace"],
    queryFn: () => companySkillsApi.marketplaceList(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const [expanded, setExpanded] = useState(false);

  const data = listing.data;
  const total = data?.skills.length ?? 0;
  const rows = data ? (expanded ? data.skills : data.skills.slice(0, INITIAL_ROWS)) : [];

  return (
    <section className="px-4 pt-4 pb-8" aria-label="Skill marketplaces">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Marketplace skills</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Public skill directories — skills.sh and skillsmp.com.
          </p>
        </div>
        {data ? (
          <a
            href={data.sources[0]?.siteUrl ?? "https://www.skills.sh"}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Browse sites
          </a>
        ) : null}
      </div>
      {listing.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading marketplace listings…</p>
      ) : listing.isError || !data ? (
        <p className="text-xs text-muted-foreground">
          Marketplace listings unavailable right now — the directory sites are not reachable from this
          instance.
        </p>
      ) : total === 0 ? (
        <p className="text-xs text-muted-foreground">No marketplace listings found.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((skill) => (
              <MarketplaceRow key={`${skill.source}:${skill.key}`} skill={skill} />
            ))}
          </div>
          {total > INITIAL_ROWS ? (
            <button
              type="button"
              className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show fewer" : `Show all ${total}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
