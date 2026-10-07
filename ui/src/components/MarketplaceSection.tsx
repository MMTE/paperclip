import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  companySkillsApi,
  type MarketplaceListing,
  type MarketplaceSkill,
} from "../api/companySkills";
import type { DiscoveryCard } from "../pages/CompanySkills";

const SOURCE_CATEGORY: Record<MarketplaceSkill["source"], string> = {
  "skills-sh": "skills.sh",
  skillsmp: "skillsmp.com",
};

function toCard(skill: MarketplaceSkill, fetchedAt: string): DiscoveryCard {
  const category = SOURCE_CATEGORY[skill.source];
  return {
    key: `mp:${skill.source}:${skill.key}`,
    skillId: null,
    catalogRef: null,
    name: skill.name,
    slug: skill.name,
    author: `${skill.owner}/${skill.repo}`,
    version: null,
    tagline: `From ${category}`,
    description: null,
    categories: [category],
    iconUrl: null,
    color: null,
    starCount: 0,
    agentCount: 0,
    forkCount: 0,
    installed: false,
    required: false,
    forkedFrom: false,
    updatedAt: Date.parse(fetchedAt) || Date.now(),
    sourceBadge: skill.source === "skills-sh" ? "skills_sh" : null,
    sourceLabel: category,
    sourceKind: null,
  };
}

// tdh patch (2026-10-07): marketplace listings (skills.sh + skillsmp.com)
// surface as extra Discover cards — the category rail doubles as the
// website filter. Card click opens the listing on its marketplace site.
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
  const urlByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of listing.data?.skills ?? []) {
      map.set(`mp:${skill.source}:${skill.key}`, skill.url);
    }
    return map;
  }, [listing.data]);
  return { cards, urlByKey, isLoading: listing.isLoading };
}
