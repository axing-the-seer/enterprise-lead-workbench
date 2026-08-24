import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = process.env.KC_SKILL_DIR
  ? resolve(process.env.KC_SKILL_DIR)
  : join(homedir(), ".codex", "skills", "获客助手");
const referencesRoot = join(skillRoot, "references");
const outputRoot = join(projectRoot, "public", "catalogs");

const regionSource = join(referencesRoot, "region.json");
const industrySource = join(referencesRoot, "industries.md");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const unique = (values) => [...new Set(values)];

function sourceMetadata(path, hash) {
  return { path, sha256: hash };
}

function regionItems(tree) {
  const items = [];
  for (const province of tree) {
    const cities = Array.isArray(province.children) ? province.children : [];
    const provinceValues = [];
    for (const city of cities) {
      const districts = Array.isArray(city.children) ? city.children : [];
      const selectableDistricts = districts.filter(
        (district) => district.value !== "市辖区$A",
      );
      if (selectableDistricts.length === 0) {
        provinceValues.push(province.value, city.value);
        continue;
      }
      for (const district of selectableDistricts) {
        provinceValues.push(province.value, city.value, district.value);
      }
    }
    items.push({
      id: `region:${province.value}`,
      label: province.label,
      pathLabels: [province.label],
      searchText: `${province.label} ${province.short ?? ""}`.trim(),
      level: 1,
      selectable: cities.length > 0,
      providerValues: cities.length > 0 ? unique(provinceValues) : [],
    });

    for (const city of cities) {
      const districts = Array.isArray(city.children) ? city.children : [];
      const selectableDistricts = districts.filter(
        (district) => district.value !== "市辖区$A",
      );
      items.push({
        id: `region:${province.value}/${city.value}`,
        label: city.label,
        pathLabels: [province.label, city.label],
        searchText: `${province.label} ${city.label}`,
        level: 2,
        // A bare $C token is a provider-wide wildcard. Cities with no district
        // values therefore remain visible but cannot be selected safely.
        selectable: selectableDistricts.length > 0,
        providerValues:
          selectableDistricts.length > 0
            ? unique([
                province.value,
                city.value,
                ...selectableDistricts.map((district) => district.value),
              ])
            : [],
      });

      for (const district of districts) {
        const placeholder = district.value === "市辖区$A";
        items.push({
          id: `region:${province.value}/${city.value}/${district.value}`,
          label: district.label,
          pathLabels: [province.label, city.label, district.label],
          searchText: `${province.label} ${city.label} ${district.label}`,
          level: 3,
          // 市辖区$A is a grouping placeholder that returns zero records.
          selectable: !placeholder,
          providerValues: placeholder
            ? []
            : [province.value, city.value, district.value],
        });
      }
    }
  }
  return items;
}

function industryItems(markdown) {
  const sections = new Map();
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^###\s+([A-Z])\s+[—-]\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { code: heading[1], label: heading[2], divisions: [] };
      sections.set(current.code, current);
      continue;
    }
    const row = /^\|\s*([A-Z]#\d{2})\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (row && current && row[1].startsWith(`${current.code}#`)) {
      current.divisions.push({ code: row[1], label: row[2] });
    }
  }

  const items = [];
  for (const section of sections.values()) {
    if (section.divisions.length === 0) continue;
    items.push({
      id: `industry:${section.code}`,
      label: section.label,
      pathLabels: [section.label],
      searchText: `${section.code} ${section.label} ${section.divisions
        .map((division) => division.label)
        .join(" ")}`,
      level: "section",
      selectable: true,
      providerValues: section.divisions.map((division) => division.code),
    });
    for (const division of section.divisions) {
      items.push({
        id: `industry:${division.code}`,
        label: division.label,
        pathLabels: [section.label, division.label],
        searchText: `${section.code} ${division.code} ${section.label} ${division.label}`,
        level: "division",
        selectable: true,
        providerValues: [division.code],
      });
    }
  }
  return items;
}

async function main() {
  const [regionBytes, industryBytes] = await Promise.all([
    readFile(regionSource),
    readFile(industrySource),
  ]);
  const regionTree = JSON.parse(regionBytes.toString("utf8"));
  const regions = {
    schemaVersion: "1.0",
    source: sourceMetadata(
      "获客助手/references/region.json",
      sha256(regionBytes),
    ),
    items: regionItems(regionTree),
  };
  const industries = {
    schemaVersion: "1.0",
    source: sourceMetadata(
      "获客助手/references/industries.md",
      sha256(industryBytes),
    ),
    items: industryItems(industryBytes.toString("utf8")),
  };

  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(
      join(outputRoot, "kc-regions.v1.json"),
      `${JSON.stringify(regions)}\n`,
    ),
    writeFile(
      join(outputRoot, "kc-industries.v1.json"),
      `${JSON.stringify(industries)}\n`,
    ),
  ]);

  process.stdout.write(
    `${JSON.stringify({
      regions: regions.items.length,
      industries: industries.items.length,
      regionSourceSha256: regions.source.sha256,
      industrySourceSha256: industries.source.sha256,
    })}\n`,
  );
}

await main();
