import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { WorkerError } from "./errors";

const catalogItemSchema = z
  .object({
    label: z.string().min(1),
    pathLabels: z.array(z.string().min(1)).min(1),
    selectable: z.boolean(),
    providerValues: z.array(z.string().min(1)),
  })
  .passthrough();

const catalogDocumentSchema = z.object({
  schemaVersion: z.literal("1.0"),
  items: z.array(catalogItemSchema),
});

type CatalogKind = "regions" | "industries";
type CatalogSelection = { label: string; providerValues: string[] };
type CatalogDocument = z.infer<typeof catalogDocumentSchema>;

const cache = new Map<CatalogKind, CatalogDocument>();

function catalogPath(kind: CatalogKind) {
  const directory = process.env.KC_CATALOG_DIR
    ? resolve(process.env.KC_CATALOG_DIR)
    : resolve(process.cwd(), "public", "catalogs");
  return resolve(directory, `kc-${kind}.v1.json`);
}

function loadCatalog(kind: CatalogKind): CatalogDocument {
  const cached = cache.get(kind);
  if (cached) return cached;
  try {
    const parsed = catalogDocumentSchema.parse(
      JSON.parse(readFileSync(catalogPath(kind), "utf8")),
    );
    cache.set(kind, parsed);
    return parsed;
  } catch {
    throw new WorkerError(
      "KC_CATALOG_UNAVAILABLE",
      "获客助手筛选目录不可用，请重新同步目录后再试。",
    );
  }
}

function normalizeLabel(value: string) {
  return value
    .replaceAll("›", "·")
    .replaceAll(" ", "")
    .replace(/·+/g, "·")
    .trim();
}

function sameValues(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}

export function canonicalizeCatalogSelections(
  kind: CatalogKind,
  selections: CatalogSelection[] | undefined,
): CatalogSelection[] | undefined {
  if (!selections?.length) return selections;
  const catalog = loadCatalog(kind);
  return selections.map((selection) => {
    const label = normalizeLabel(selection.label);
    let candidates = catalog.items.filter(
      (item) =>
        item.selectable &&
        item.providerValues.length > 0 &&
        (normalizeLabel(item.label) === label ||
          normalizeLabel(item.pathLabels.join("·")) === label),
    );
    if (candidates.length > 1) {
      candidates = candidates.filter((item) =>
        sameValues(item.providerValues, selection.providerValues),
      );
    }
    if (candidates.length !== 1) {
      throw new WorkerError(
        "KC_CATALOG_SELECTION_INVALID",
        `获客助手${kind === "regions" ? "地区" : "行业"}选项无效或不明确，请从当前目录重新选择。`,
      );
    }
    return {
      label: selection.label,
      providerValues: [...candidates[0].providerValues],
    };
  });
}

export function clearKcCatalogCacheForTests() {
  cache.clear();
}
