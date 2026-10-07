import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  companySkillsApi,
  type MarketplaceListing,
  type MarketplaceSkill,
} from "../api/companySkills";
import type { DiscoveryCard } from "../pages/CompanySkills";

const SOURCE_CATEGORY = "skillsmp.com";

function toCard(skill: MarketplaceSkill, fetchedAt: string): DiscoveryCard {
  return {
    key: `mp:${skill.source}:${skill.key}`,
    skillId: null,
    catalogRef: null,
    name: skill.name,
    slug: skill.name,
    author: skill.author,
    version: null,
    tagline: skill.description?.slice(0, 120) ?? `From ${SOURCE_CATEGORY}`,
    description: skill.description,
    categories: [SOURCE_CATEGORY],
    iconUrl: null,
    color: null,
    starCount: skill.stars ?? 0,
    agentCount: 0,
    forkCount: 0,
    installed: false,
    required: false,
    forkedFrom: false,
    updatedAt: Date.parse(fetchedAt) || Date.now(),
    sourceBadge: "github",
    sourceLabel: SOURCE_CATEGORY,
    sourceKind: null,
  };
}

// tdh patch (2026-10-07): skillsmp.com listings surface as extra Discover
// cards (category rail = website filter). Installs flow through the stock
// skill-import endpoint via owner/repo[/dir] sources.
export function useMarketplaceCards(enabled: boolean) {
  const listing = useQuery<MarketplaceListing>({
    queryKey: ["skills-marketplace"],
    queryFn: () => companySkillsApi.marketplaceList(),
    staleTime: 30 * 60 * 1000,
    retry: false,
    enabled,
  });
  const cards = useMemo(
    () =>
      (listing.data?.skills ?? []).map((skill) =>
        toCard(skill, listing.data?.fetchedAt ?? ""),
      ),
    [listing.data],
  );
  const installSourceByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of listing.data?.skills ?? []) {
      if (skill.installSource) map.set(`mp:${skill.source}:${skill.key}`, skill.installSource);
    }
    return map;
  }, [listing.data]);
  const urlByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of listing.data?.skills ?? []) {
      map.set(`mp:${skill.source}:${skill.key}`, skill.url);
    }
    return map;
  }, [listing.data]);
  return { cards, urlByKey, installSourceByKey, isLoading: listing.isLoading };
}
