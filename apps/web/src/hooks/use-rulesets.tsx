import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from "react";
import type { RuleSet as SharedRuleSet, Rule, Segment, EnumSegment, FreeformSegment, Source, Tags } from "@taxo/shared";
import { newId } from "@/lib/ids";

export type { Rule, Segment, EnumSegment, FreeformSegment, Source, Tags };

export type RuleSet = SharedRuleSet & {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

// v2: Rules and Segments carry immutable ids, Rules have `name` and `tags`.
const STORAGE_KEY = "campaign-naming-rulesets-v2";
// v1: no ids, Rules had `label` plus flat `platform` / `entityType`, and the
// delimiter was copied into every freeform segment's illegalChars.
const V1_STORAGE_KEY = "campaign-naming-rulesets-v1";
// v0: the prototype's "taxonomy" shape, with `levels` instead of `rules`.
const V0_STORAGE_KEY = "campaign-taxonomy-taxonomies-v2";

const seedRuleSets: RuleSet[] = [
  {
    id: "ruleset-global",
    name: "Global campaign standard",
    ownerId: "maya",
    createdAt: "2024-09-10T09:00:00.000Z",
    updatedAt: "2025-02-21T15:42:00.000Z",
    rules: [
      {
        id: "rule-initiative",
        key: "initiative_name",
        name: "Initiative Name",
        tags: { platform: "google", entityType: "campaign" },
        delimiter: "-",
        source: {
          dataset: "marketing_dw",
          table: "initiatives",
          nameColumn: "initiative_id",
        },
        segments: [
          { id: "seg-region", kind: "enum", key: "region", label: "Region", required: true, allowedValues: ["na", "emea", "apac", "latam"] },
          { id: "seg-channel", kind: "enum", key: "channel", label: "Channel", required: true, allowedValues: ["paid_search", "paid_social", "email", "display", "partner"] },
          { id: "seg-initiative", kind: "freeform", key: "initiative", label: "Initiative", required: true, maxLength: 32, illegalChars: [" ", "/", "?", "#", "&"] },
          { id: "seg-quarter", kind: "enum", key: "quarter", label: "Quarter", required: true, allowedValues: ["q1", "q2", "q3", "q4"] },
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
        id: "rule-lifecycle",
        key: "lifecycle_campaign",
        name: "Lifecycle Campaign",
        tags: { platform: "email", entityType: "campaign" },
        delimiter: "_",
        source: {
          dataset: "crm_dw",
          table: "campaigns",
          nameColumn: "campaign_name",
        },
        segments: [
          { id: "seg-motion", kind: "enum", key: "motion", label: "Motion", required: true, allowedValues: ["acq", "nurture", "retention", "winback"] },
          { id: "seg-audience", kind: "freeform", key: "audience", label: "Audience", required: true, maxLength: 24, illegalChars: [" ", "/", "?", "#", "&"] },
          { id: "seg-offer", kind: "freeform", key: "offer", label: "Offer", required: false, maxLength: 28, illegalChars: [" ", "/", "?", "#", "&"] },
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
        id: "rule-launch",
        key: "launch_code",
        name: "Launch Code",
        delimiter: ".",
        source: {
          dataset: "product_dw",
          table: "launches",
          nameColumn: "launch_code",
        },
        segments: [
          { id: "seg-product", kind: "enum", key: "product", label: "Product", required: true, allowedValues: ["atlas", "beacon", "orbit"] },
          { id: "seg-launch", kind: "freeform", key: "launch", label: "Launch", required: true, maxLength: 36, illegalChars: [" ", "/", "?", "#", "&"] },
          { id: "seg-market", kind: "enum", key: "market", label: "Market", required: true, allowedValues: ["enterprise", "midmarket", "smb"] },
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

// ---- Stored-shape migrations ------------------------------------------------

type V1Segment = {
  kind: "enum" | "freeform";
  key: string;
  label: string;
  required: boolean;
  allowedValues?: string[];
  maxLength?: number;
  illegalChars?: string[];
};

type V1Rule = {
  key: string;
  label: string;
  delimiter: string;
  segments: V1Segment[];
  source: Source;
  platform?: string;
  entityType?: string;
};

type V1RuleSet = Omit<RuleSet, "rules"> & { rules: V1Rule[] };
type V0RuleSet = Omit<RuleSet, "rules"> & { levels: V1Rule[] };

function migrateV1Segment(segment: V1Segment, delimiter: string): Segment {
  if (segment.kind === "enum") {
    return {
      id: newId(),
      kind: "enum",
      key: segment.key,
      label: segment.label,
      required: segment.required,
      allowedValues: segment.allowedValues ?? [],
    };
  }
  return {
    id: newId(),
    kind: "freeform",
    key: segment.key,
    label: segment.label,
    required: segment.required,
    maxLength: segment.maxLength ?? 32,
    // The engine enforces the delimiter; drop the copy older versions stored.
    illegalChars: (segment.illegalChars ?? []).filter((character) => character !== delimiter),
  };
}

function migrateV1Rule(rule: V1Rule): Rule {
  const tags: Tags = {};
  if (rule.platform) tags.platform = rule.platform;
  if (rule.entityType) tags.entityType = rule.entityType;
  return {
    id: newId(),
    key: rule.key,
    name: rule.label,
    ...(Object.keys(tags).length ? { tags } : {}),
    delimiter: rule.delimiter,
    segments: rule.segments.map((segment) => migrateV1Segment(segment, rule.delimiter)),
    source: rule.source,
  };
}

function migrateV1RuleSet(ruleSet: V1RuleSet): RuleSet {
  return { ...ruleSet, rules: ruleSet.rules.map(migrateV1Rule) };
}

function isV0RuleSet(value: unknown): value is V0RuleSet {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<V0RuleSet>;
  return typeof candidate.id === "string" && typeof candidate.name === "string" && Array.isArray(candidate.levels);
}

function migrateV0RuleSet(old: V0RuleSet): RuleSet {
  const { levels, ...rest } = old;
  return migrateV1RuleSet({ ...rest, id: old.id.replace("taxonomy-", "ruleset-"), rules: levels });
}

function readRuleSets(): RuleSet[] {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      return Array.isArray(parsed) ? (parsed as RuleSet[]) : seedRuleSets;
    }

    const v1 = window.localStorage.getItem(V1_STORAGE_KEY);
    if (v1) {
      const parsed: unknown = JSON.parse(v1);
      if (Array.isArray(parsed)) {
        return (parsed as V1RuleSet[]).map(migrateV1RuleSet);
      }
    }

    const v0 = window.localStorage.getItem(V0_STORAGE_KEY);
    if (v0) {
      const parsed: unknown = JSON.parse(v0);
      if (Array.isArray(parsed)) {
        const migrated = parsed.filter(isV0RuleSet).map(migrateV0RuleSet);
        if (migrated.length > 0) return migrated;
      }
    }

    return seedRuleSets;
  } catch {
    return seedRuleSets;
  }
}

// ---- Provider -----------------------------------------------------------------

export function RuleSetsProvider({ children }: { children: ReactNode }) {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>(readRuleSets);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ruleSets));
  }, [ruleSets]);

  const createRuleSet = useCallback((draft: Pick<RuleSet, "name" | "rules">) => {
    const now = new Date().toISOString();
    const ruleSet: RuleSet = {
      ...draft,
      id: newId(),
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
