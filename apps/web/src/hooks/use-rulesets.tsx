import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import type { RuleSet as SharedRuleSet, Rule, Segment, EnumSegment, FreeformSegment, Source } from "@taxo/shared";

export type { Rule, Segment, EnumSegment, FreeformSegment, Source };

export type RuleSet = SharedRuleSet & {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "campaign-naming-rulesets-v1";
const LEGACY_STORAGE_KEY = "campaign-taxonomy-taxonomies-v2";

const seedRuleSets: RuleSet[] = [
  {
    id: "ruleset-global",
    name: "Global campaign standard",
    ownerId: "maya",
    createdAt: "2024-09-10T09:00:00.000Z",
    updatedAt: "2025-02-21T15:42:00.000Z",
    rules: [
      {
        key: "initiative_name",
        label: "Initiative Name",
        delimiter: "-",
        source: {
          dataset: "marketing_dw",
          table: "initiatives",
          nameColumn: "initiative_id",
        },
        segments: [
          {
            kind: "enum",
            key: "region",
            label: "Region",
            required: true,
            allowedValues: ["na", "emea", "apac", "latam"],
          },
          {
            kind: "enum",
            key: "channel",
            label: "Channel",
            required: true,
            allowedValues: ["paid_search", "paid_social", "email", "display", "partner"],
          },
          {
            kind: "freeform",
            key: "initiative",
            label: "Initiative",
            required: true,
            maxLength: 32,
            illegalChars: [" ", "/", "?", "#", "&", "-"],
          },
          {
            kind: "enum",
            key: "quarter",
            label: "Quarter",
            required: true,
            allowedValues: ["q1", "q2", "q3", "q4"],
          },
        ],
      },
    ],
  },
  {
    id: "ruleset-lifecycle",
    name: "Lifecycle & CRM",
    ownerId: "jonah",
    createdAt: "2024-11-04T11:15:00.000Z",
    updatedAt: "2025-02-19T12:18:00.000Z",
    rules: [
      {
        key: "lifecycle_campaign",
        label: "Lifecycle Campaign",
        delimiter: "_",
        source: {
          dataset: "crm_dw",
          table: "campaigns",
          nameColumn: "campaign_name",
        },
        segments: [
          {
            kind: "enum",
            key: "motion",
            label: "Motion",
            required: true,
            allowedValues: ["acq", "nurture", "retention", "winback"],
          },
          {
            kind: "freeform",
            key: "audience",
            label: "Audience",
            required: true,
            maxLength: 24,
            illegalChars: [" ", "/", "?", "#", "&", "_"],
          },
          {
            kind: "freeform",
            key: "offer",
            label: "Offer",
            required: false,
            maxLength: 28,
            illegalChars: [" ", "/", "?", "#", "&", "_"],
          },
        ],
      },
    ],
  },
  {
    id: "ruleset-product",
    name: "Product launches",
    ownerId: "alina",
    createdAt: "2025-01-18T08:30:00.000Z",
    updatedAt: "2025-02-14T16:05:00.000Z",
    rules: [
      {
        key: "launch_code",
        label: "Launch Code",
        delimiter: ".",
        source: {
          dataset: "product_dw",
          table: "launches",
          nameColumn: "launch_code",
        },
        segments: [
          {
            kind: "enum",
            key: "product",
            label: "Product",
            required: true,
            allowedValues: ["atlas", "beacon", "orbit"],
          },
          {
            kind: "freeform",
            key: "launch",
            label: "Launch",
            required: true,
            maxLength: 36,
            illegalChars: [" ", "/", "?", "#", "&", "."],
          },
          {
            kind: "enum",
            key: "market",
            label: "Market",
            required: true,
            allowedValues: ["enterprise", "midmarket", "smb"],
          },
        ],
      },
    ],
  },
];

type RuleSetsContextType = {
  ruleSets: RuleSet[];
  createRuleSet: (draft: Pick<RuleSet, "name" | "rules">) => RuleSet;
  updateRuleSet: (id: string, draft: Pick<RuleSet, "name" | "rules">) => void;
  deleteRuleSet: (id: string) => void;
};

const RuleSetsContext = createContext<RuleSetsContextType | null>(null);

function normalizeRuleSet(ruleSet: RuleSet): RuleSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.map((rule) => ({
      ...rule,
      segments: rule.segments.map((segment) =>
        segment.kind === "freeform"
          ? {
              ...segment,
              illegalChars: Array.from(
                new Set([...segment.illegalChars, rule.delimiter].filter(Boolean)),
              ),
            }
          : segment,
      ),
    })),
  };
}

type LegacyRuleSet = Omit<RuleSet, "rules"> & {
  levels: Rule[];
};

function isLegacyRuleSet(value: unknown): value is LegacyRuleSet {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LegacyRuleSet>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && Array.isArray(candidate.levels);
}

function readRuleSets(): RuleSet[] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      return Array.isArray(parsed)
        ? (parsed as RuleSet[]).map(normalizeRuleSet)
        : seedRuleSets.map(normalizeRuleSet);
    }
    
    const legacySaved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacySaved) {
      const parsed: unknown = JSON.parse(legacySaved);
      if (Array.isArray(parsed)) {
        const migrated = parsed.filter(isLegacyRuleSet).map((old) => {
          const { levels, ...rest } = old;
          return {
            ...rest,
            id: old.id.replace('taxonomy-', 'ruleset-'),
            rules: levels.map((rule) => ({ ...rule })),
          };
        });
        
        if (migrated.length > 0) {
          const normalized = migrated.map(normalizeRuleSet);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          return normalized;
        }
      }
    }
    
    return seedRuleSets.map(normalizeRuleSet);
  } catch {
    return seedRuleSets.map(normalizeRuleSet);
  }
}

export function RuleSetsProvider({ children }: { children: ReactNode }) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>(readRuleSets);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ruleSets));
  }, [ruleSets]);

  const createRuleSet = useCallback((draft: Pick<RuleSet, "name" | "rules">) => {
    const now = new Date().toISOString();
    const ruleSet: RuleSet = {
      ...draft,
      id: `ruleset-${Date.now()}`,
      ownerId: "you",
      createdAt: now,
      updatedAt: now,
    };
    setRuleSets((current) => [ruleSet, ...current]);
    return ruleSet;
  }, []);

  const updateRuleSet = useCallback((id: string, draft: Pick<RuleSet, "name" | "rules">) => {
    setRuleSets((current) =>
      current.map((item) =>
        item.id === id ? { ...item, ...draft, updatedAt: new Date().toISOString() } : item,
      ),
    );
  }, []);

  const deleteRuleSet = useCallback((id: string) => {
    setRuleSets((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <RuleSetsContext.Provider value={{ ruleSets, createRuleSet, updateRuleSet, deleteRuleSet }}>
      {children}
    </RuleSetsContext.Provider>
  );
}

export function useRuleSets() {
  const ctx = useContext(RuleSetsContext);
  if (!ctx) throw new Error("useRuleSets must be used within RuleSetsProvider");
  return ctx;
}