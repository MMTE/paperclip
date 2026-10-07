import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  companySkillsApi,
  type MarketplaceListing,
  type MarketplaceSkill,
} from "../api/companySkills";
import { DiscoveryGrid, type DiscoveryCard } from "../pages/CompanySkills";

const SOURCE_CATEGORY: Record<MarketplaceSkill["source"], string> = {
  "skills-sh": "skills.sh",
  skillsmp: "skillsmp.com",
};

type GridSort = "agents" | "stars" | "forks" | "recent" | "alphabetical";

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

export function MarketplaceSection() {
  const listing = useQuery<MarketplaceListing>({
    queryKey: ["skills-marketplace"],
    queryFn: () => companySkillsApi.marketplaceList(),
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GridSort>("alphabetical");

  const urlByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of listing.data?.skills ?? []) {
      map.set(`mp:${skill.source}:${skill.key}`, skill.url);
    }
    return map;
  }, [listing.data]);

  const allCards = useMemo(
    () => (listing.data?.skills ?? []).map((skill) => toCard(skill, listing.data?.fetchedAt ?? "")),
    [listing.data],
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of allCards) {
      for (const category of card.categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
    }
    return Array.from(counts, ([slug, count]) => ({ slug, count }));
  }, [allCards]);

  const visibleCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = allCards.filter((card) => {
      if (activeCategory && !card.categories.includes(activeCategory)) return false;
      if (!query) return true;
      return (
        card.name.toLowerCase().includes(query) || card.author.toLowerCase().includes(query)
      );
    });
    if (sort === "alphabetical") {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }
    // Marketplace listings keep their directory (leaderboard) order for every
    // non-alphabetical sort — star/agent/fork counts do not apply.
    return filtered;
  }, [allCards, activeCategory, search, sort]);

  return (
    <DiscoveryGrid
      tab="marketplace"
      categories={categories}
      categoryTotal={allCards.length}
      activeCategory={activeCategory}
      onCategoryChange={setActiveCategory}
      search={search}
      onSearchChange={setSearch}
      sort={sort}
      onSortChange={setSort}
      cards={visibleCards}
      onOpenCard={(card) => {
        const url = urlByKey.get(card.key);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }}
      loading={listing.isLoading}
      error={listing.isError ? "Marketplace listings unavailable right now." : null}
      totalCount={allCards.length}
      onCreate={() => {}}
      onImport={() => {}}
      onImportFromProject={() => {}}
      onBrowseDiscover={() => {}}
      onScan={() => {}}
      scanPending={false}
      scanStatus={null}
      showBrowseRails
    />
  );
}
