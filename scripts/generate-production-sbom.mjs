#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const outputDir = path.join(root, "compliance");
const checkOnly = process.argv.includes("--check");
const allowIncomplete = process.argv.includes("--allow-incomplete");

const packageLock = readJson(path.join(root, "package-lock.json"));
const denoLock = readJson(path.join(root, "deno.lock"));
const verifiedLicenseOverrides = readJson(
  path.join(root, "compliance", "license-overrides.json"),
);
const components = new Map();
const blockers = new Set();
const buildMaps = [];
const packageCandidates = buildPackageCandidateIndex();

const copiedSourceLicenses = {
  "shadcn-admin-kit": `MIT License

Copyright (c) 2025 marmelab

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  "shadcn-ui": `MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  kysely: `The MIT License (MIT)

Copyright (c) 2022 Sami Koskimäki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  "deno-postgres": `MIT License

Copyright (c) 2018-2022 Bartłomiej Iwańczuk and Steven Guerrero

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  "deno-std": `MIT License

Copyright 2018-2022 the Deno authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
};

collectFrontendBundle();
collectProviderWorkerRuntime();
collectSupabaseFunctionRuntime();
collectCopiedSource();

const sortedComponents = [...components.values()].sort(compareComponents);
const productRef = "pkg:npm/enterprise-lead-workbench@0.1.0";
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": productRef,
      name: "enterprise-lead-workbench",
      version: "0.1.0",
    },
    properties: [
      {
        name: "workbench:build-evidence",
        value: buildMaps.map(relativePath).sort().join(","),
      },
      {
        name: "workbench:release-status",
        value: blockers.size === 0 ? "complete" : "blocked-incomplete",
      },
      {
        name: "workbench:release-blocker-count",
        value: String(blockers.size),
      },
    ],
  },
  components: sortedComponents.map(toCycloneDxComponent),
  dependencies: [
    {
      ref: productRef,
      dependsOn: sortedComponents.map((component) => component.ref).sort(),
    },
  ],
};
validateCycloneDxStructure(sbom);
for (const property of sbom.metadata.properties) {
  if (property.name === "workbench:release-status") {
    property.value = blockers.size === 0 ? "complete" : "blocked-incomplete";
  }
  if (property.name === "workbench:release-blocker-count") {
    property.value = String(blockers.size);
  }
}

const artifacts = new Map([
  [path.join(outputDir, "sbom.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`],
  [
    path.join(outputDir, "THIRD_PARTY_LICENSES.txt"),
    renderThirdPartyLicenses(sortedComponents),
  ],
  [path.join(outputDir, "SBOM_BLOCKERS.md"), renderBlockers()],
]);

if (checkOnly) {
  for (const [file, expected] of artifacts) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== expected) {
      blockers.add(
        `Generated compliance artifact is stale: ${relativePath(file)}`,
      );
    }
  }
} else {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [file, content] of artifacts) fs.writeFileSync(file, content);
}

process.stdout.write(
  `${checkOnly ? "Checked" : "Generated"} ${sortedComponents.length} components from ${buildMaps.length} production source maps and server runtime imports.\n`,
);
if (blockers.size > 0) {
  console.error(`Release compliance blockers (${blockers.size}):`);
  for (const blocker of [...blockers].sort()) console.error(`- ${blocker}`);
  if (!allowIncomplete) process.exitCode = 2;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function relativePath(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function walkFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(file, predicate));
    else if (predicate(file)) files.push(file);
  }
  return files;
}

function collectFrontendBundle() {
  if (!fs.existsSync(distDir)) {
    throw new Error(
      "dist/ is missing; run the production build before SBOM generation",
    );
  }
  const maps = walkFiles(distDir, (file) => file.endsWith(".map")).sort();
  if (maps.length === 0) {
    throw new Error("No production source maps found under dist/");
  }

  let staleSourceCount = 0;
  for (const mapFile of maps) {
    const map = readJson(mapFile);
    buildMaps.push(mapFile);
    for (let index = 0; index < (map.sources || []).length; index += 1) {
      const source = map.sources[index];
      if (source.includes("node_modules/")) {
        const packageDir = resolveSourcePackageDir(mapFile, source);
        if (!packageDir) {
          blockers.add(
            `Cannot resolve bundled npm source ${source} from ${relativePath(mapFile)}`,
          );
          continue;
        }
        addNpmPackageDir(packageDir, "frontend-bundle", {
          evidence: relativePath(mapFile),
        });
        if (
          packageDir.endsWith(`${path.sep}node_modules${path.sep}exceljs`) &&
          source.endsWith("/dist/exceljs.min.js")
        ) {
          collectExcelJsEmbeddedPackages(packageDir);
        }
        continue;
      }

      const localFile = path.resolve(path.dirname(mapFile), source);
      const sourceContent = map.sourcesContent?.[index];
      if (
        sourceContent != null &&
        /\.(?:[cm]?[jt]sx?|css)$/i.test(localFile) &&
        localFile.startsWith(`${root}${path.sep}`) &&
        fs.existsSync(localFile) &&
        normalizeText(fs.readFileSync(localFile, "utf8")) !==
          normalizeText(sourceContent)
      ) {
        staleSourceCount += 1;
      }
    }
  }

  if (staleSourceCount > 0) {
    blockers.add(
      `dist source maps are stale for ${staleSourceCount} current source file(s); rebuild before release`,
    );
  }

  const interFonts = walkFiles(distDir, (file) =>
    /\/inter-[^/]+\.woff2$/i.test(file),
  );
  if (interFonts.length > 0) {
    addNpmPackageDir(
      path.join(root, "node_modules", "@fontsource-variable", "inter"),
      "frontend-font",
      { evidence: interFonts.map(relativePath).sort().join(",") },
    );
  }
}

function resolveSourcePackageDir(mapFile, source) {
  const cleanSource = source.split(/[?#]/, 1)[0];
  const candidates = [path.resolve(path.dirname(mapFile), cleanSource)];
  const markerIndex = cleanSource.indexOf("node_modules/");
  if (markerIndex >= 0) {
    candidates.push(path.join(root, cleanSource.slice(markerIndex)));
  }
  for (const candidate of candidates) {
    let current =
      fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
        ? candidate
        : path.dirname(candidate);
    while (current.startsWith(`${root}${path.sep}`)) {
      const packageJsonFile = path.join(current, "package.json");
      if (fs.existsSync(packageJsonFile)) {
        const packageJson = readJson(packageJsonFile);
        if (packageJson.name && packageJson.version) return current;
      }
      if (current === root) break;
      current = path.dirname(current);
    }
  }
  return null;
}

function collectExcelJsEmbeddedPackages(excelJsDir) {
  const nestedMapFile = path.join(excelJsDir, "dist", "exceljs.min.js.map");
  if (!fs.existsSync(nestedMapFile)) {
    blockers.add("ExcelJS browser bundle has no nested source map");
    return;
  }
  const map = readJson(nestedMapFile);
  const occurrences = new Map();
  for (let index = 0; index < (map.sources || []).length; index += 1) {
    const parsed = parseEmbeddedPackageSource(map.sources[index]);
    if (!parsed) continue;
    const key = `${parsed.name}|${parsed.occurrence}`;
    if (!occurrences.has(key)) {
      occurrences.set(key, { name: parsed.name, sources: [] });
    }
    occurrences.get(key).sources.push({
      relativeFile: parsed.relativeFile,
      content: map.sourcesContent?.[index],
    });
  }

  const unresolved = [];
  for (const occurrence of occurrences.values()) {
    const match = matchEmbeddedPackage(occurrence);
    if (match) {
      addNpmPackageDir(match.dir, "frontend-embedded-exceljs", {
        evidence: "node_modules/exceljs/dist/exceljs.min.js.map",
        fingerprint: "exact-sourcesContent",
      });
    } else {
      addUnresolvedEmbeddedPackage(occurrence.name);
      unresolved.push(occurrence.name);
    }
  }

  if (unresolved.length > 0) {
    blockers.add(
      `ExcelJS 4.4.0 browser bundle contains ${new Set(unresolved).size} embedded package name(s) whose exact versions and license files are not provable from the release lock`,
    );
  }
}

function parseEmbeddedPackageSource(source) {
  const marker = "node_modules/";
  const lastMarker = source.lastIndexOf(marker);
  if (lastMarker < 0) return null;
  const tail = source.slice(lastMarker + marker.length);
  const parts = tail.split("/");
  const scoped = parts[0].startsWith("@");
  const name = scoped ? parts.slice(0, 2).join("/") : parts[0];
  const nameParts = scoped ? 2 : 1;
  return {
    name,
    occurrence: source.slice(0, lastMarker + marker.length) + name,
    relativeFile: parts.slice(nameParts).join("/"),
  };
}

function matchEmbeddedPackage(occurrence) {
  const candidates = packageCandidates.get(occurrence.name) || [];
  const matchingVersions = new Map();
  for (const candidate of candidates) {
    const comparable = occurrence.sources.filter(
      (source) => source.content != null,
    );
    if (comparable.length === 0) continue;
    const matchesAll = comparable.every((source) => {
      const file = path.join(candidate.dir, source.relativeFile);
      return (
        fs.existsSync(file) &&
        normalizeText(fs.readFileSync(file, "utf8")) ===
          normalizeText(source.content)
      );
    });
    if (matchesAll && !matchingVersions.has(candidate.version)) {
      matchingVersions.set(candidate.version, candidate);
    }
  }
  return matchingVersions.size === 1 ? [...matchingVersions.values()][0] : null;
}

function normalizeText(value) {
  return String(value).replace(/\r\n/g, "\n").trimEnd();
}

function addUnresolvedEmbeddedPackage(name) {
  const ref = `urn:workbench:embedded-exceljs:${encodeURIComponent(name)}`;
  const existing = components.get(ref);
  if (existing) {
    existing.scopes.add("frontend-embedded-exceljs");
    return;
  }
  components.set(ref, {
    ref,
    type: "library",
    name,
    license: { name: "NOASSERTION" },
    licenseLabel: "NOASSERTION",
    licenseTexts: [],
    scopes: new Set(["frontend-embedded-exceljs"]),
    properties: new Map([
      ["workbench:evidence", "node_modules/exceljs/dist/exceljs.min.js.map"],
      ["workbench:resolution-status", "embedded-version-unresolved"],
    ]),
  });
}

function collectProviderWorkerRuntime() {
  const workerDir = path.join(root, "services", "provider-worker", "src");
  const packageNames = new Set();
  for (const file of walkFiles(
    workerDir,
    (candidate) =>
      candidate.endsWith(".ts") &&
      !candidate.includes(".test.") &&
      !candidate.includes(".spec."),
  )) {
    for (const specifier of extractImportSpecifiers(
      fs.readFileSync(file, "utf8"),
    )) {
      const packageName = npmPackageName(specifier);
      if (packageName) packageNames.add(packageName);
    }
  }
  for (const packageName of [...packageNames].sort()) {
    const packageDir = path.join(
      root,
      "node_modules",
      ...packageName.split("/"),
    );
    if (!fs.existsSync(path.join(packageDir, "package.json"))) {
      blockers.add(
        `Provider worker runtime package is missing: ${packageName}`,
      );
      continue;
    }
    addNpmDependencyTree(packageDir, "provider-worker-runtime");
  }

  const rootPackage = readJson(path.join(root, "package.json"));
  const productionLauncher = rootPackage.scripts?.["worker:start"] || "";
  if (
    /\btsx\b/.test(productionLauncher) ||
    !/\bnode\b/.test(productionLauncher)
  ) {
    blockers.add(
      "Provider worker production launcher uses devDependency tsx; define build:worker and run compiled JavaScript before release",
    );
  }
  const compiledEntry = productionLauncher.match(
    /\bnode\s+([^\s]*services\/provider-worker\/dist\/[^\s]+\.js)\b/,
  )?.[1];
  if (/\bnode\b/.test(productionLauncher) && !compiledEntry) {
    blockers.add(
      "Provider worker production launcher does not point to a compiled services/provider-worker/dist JavaScript entry",
    );
  } else if (
    compiledEntry &&
    !fs.existsSync(path.resolve(root, compiledEntry))
  ) {
    blockers.add(
      `Provider worker compiled entry is missing: ${compiledEntry}; run npm run build:worker before release`,
    );
  }
}

function addNpmDependencyTree(seedDir, scope) {
  const queue = [seedDir];
  const visited = new Set();
  while (queue.length > 0) {
    const packageDir = queue.shift();
    const packageJson = readJson(path.join(packageDir, "package.json"));
    const key = `${packageJson.name}@${packageJson.version}|${packageDir}`;
    if (visited.has(key)) continue;
    visited.add(key);
    addNpmPackageDir(packageDir, scope);
    for (const dependency of Object.keys(
      packageJson.dependencies || {},
    ).sort()) {
      const dependencyDir = resolveInstalledDependency(packageDir, dependency);
      if (!dependencyDir) {
        blockers.add(
          `Cannot resolve ${dependency}, required by ${packageJson.name}@${packageJson.version}`,
        );
      } else {
        queue.push(dependencyDir);
      }
    }
  }
}

function resolveInstalledDependency(packageDir, dependency) {
  let current = packageDir;
  while (current.startsWith(root)) {
    const candidate = path.join(
      current,
      "node_modules",
      ...dependency.split("/"),
    );
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (current === root) break;
    current = path.dirname(current);
  }
  const rootCandidate = path.join(
    root,
    "node_modules",
    ...dependency.split("/"),
  );
  return fs.existsSync(path.join(rootCandidate, "package.json"))
    ? rootCandidate
    : null;
}

function collectSupabaseFunctionRuntime() {
  const functionsDir = path.join(root, "supabase", "functions");
  const npmLockKeys = new Set();
  const jsrLockKeys = new Set();

  for (const file of walkFiles(
    functionsDir,
    (candidate) =>
      candidate.endsWith(".ts") &&
      !candidate.includes(".test.") &&
      !candidate.includes(".spec.") &&
      path.basename(candidate) !== "vitest-deno-setup.ts",
  )) {
    const configImports = findNearestDenoImports(file, functionsDir);
    for (let specifier of extractImportSpecifiers(
      fs.readFileSync(file, "utf8"),
    )) {
      if (
        specifier.startsWith(".") ||
        specifier.startsWith("node:") ||
        specifier.startsWith("/")
      ) {
        continue;
      }
      if (!specifier.includes(":") && configImports[specifier]) {
        specifier = configImports[specifier];
      }
      if (specifier.startsWith("npm:")) {
        const lockKey = resolveDenoSpecifier("npm", specifier.slice(4));
        if (lockKey) npmLockKeys.add(lockKey);
        else blockers.add(`Deno npm import is not locked: ${specifier}`);
      } else if (specifier.startsWith("jsr:")) {
        const lockKey = resolveDenoSpecifier("jsr", specifier.slice(4));
        if (lockKey) jsrLockKeys.add(lockKey);
        else blockers.add(`Deno JSR import is not locked: ${specifier}`);
      } else if (specifier.startsWith("https://esm.sh/kysely@0.27.2")) {
        addManualComponent({
          ref: "pkg:npm/kysely@0.27.2",
          name: "kysely",
          version: "0.27.2",
          licenseText: copiedSourceLicenses.kysely,
          scope: "supabase-function-runtime",
          purl: "pkg:npm/kysely@0.27.2",
          repository: "https://github.com/kysely-org/kysely",
          evidence: specifier,
        });
      } else if (
        specifier.startsWith("https://deno.land/x/postgres@v0.17.0/")
      ) {
        addManualComponent({
          ref: "pkg:github/denodrivers/postgres@v0.17.0",
          name: "deno-postgres",
          version: "0.17.0",
          licenseText: copiedSourceLicenses["deno-postgres"],
          scope: "supabase-function-runtime",
          purl: "pkg:github/denodrivers/postgres@v0.17.0",
          repository: "https://github.com/denodrivers/postgres",
          evidence: specifier,
        });
      } else if (
        specifier.startsWith("http://") ||
        specifier.startsWith("https://")
      ) {
        blockers.add(`Unrecognized remote production import: ${specifier}`);
      } else if (!specifier.includes(":")) {
        blockers.add(
          `Bare Deno production import has no pinned import-map entry: ${specifier}`,
        );
      }
    }
  }

  collectDenoJsrClosure(jsrLockKeys, npmLockKeys);
  collectDenoNpmClosure(npmLockKeys);
  collectDenoRemoteRuntime();
}

function collectDenoRemoteRuntime() {
  const remoteUrls = Object.keys(denoLock.remote || {});
  const recognized = remoteUrls.filter(
    (url) =>
      url.startsWith("https://esm.sh/kysely@0.27.2") ||
      url.startsWith("https://deno.land/x/postgres@v0.17.0/") ||
      url.startsWith("https://deno.land/std@0.160.0/"),
  );
  const unrecognized = remoteUrls.filter((url) => !recognized.includes(url));
  if (unrecognized.length > 0) {
    blockers.add(
      `deno.lock contains ${unrecognized.length} unrecognized remote production module(s)`,
    );
  }

  const denoStdUrls = remoteUrls.filter((url) =>
    url.startsWith("https://deno.land/std@0.160.0/"),
  );
  if (denoStdUrls.length > 0) {
    addManualComponent({
      ref: "pkg:github/denoland/std@0.160.0",
      name: "Deno Standard Library",
      version: "0.160.0",
      licenseText: copiedSourceLicenses["deno-std"],
      scope: "supabase-function-runtime",
      purl: "pkg:github/denoland/std@0.160.0",
      repository: "https://github.com/denoland/std",
      evidence: `deno.lock (${denoStdUrls.length} remote modules)`,
    });
  }
}

function findNearestDenoImports(file, stopDir) {
  let current = path.dirname(file);
  while (current.startsWith(stopDir)) {
    const config = path.join(current, "deno.json");
    if (fs.existsSync(config)) return readJson(config).imports || {};
    if (current === stopDir) break;
    current = path.dirname(current);
  }
  return {};
}

function resolveDenoSpecifier(ecosystem, packageSpecifier) {
  const request = parseRegistryRequest(packageSpecifier);
  if (!request) return null;

  const lockEntries = denoLock[ecosystem] || {};
  const exactSpecifier =
    denoLock.specifiers?.[`${ecosystem}:${request.packageSpec}`];
  const matchingSpecifiers = Object.entries(denoLock.specifiers || {}).filter(
    ([key]) =>
      key.startsWith(`${ecosystem}:`) &&
      parseRegistryRequest(key.slice(ecosystem.length + 1))?.name ===
        request.name,
  );
  const resolvedVersions = new Set(
    [exactSpecifier, ...matchingSpecifiers.map(([, value]) => value)].filter(
      Boolean,
    ),
  );

  if (request.version) {
    const direct = resolveDenoLockDependency(
      lockEntries,
      `${request.name}@${request.version}`,
    );
    if (direct) return direct;
  }

  const resolvedKeys = [...resolvedVersions]
    .map((version) =>
      resolveDenoLockDependency(lockEntries, `${request.name}@${version}`),
    )
    .filter(Boolean);
  const uniqueResolvedKeys = [...new Set(resolvedKeys)];
  if (uniqueResolvedKeys.length === 1) return uniqueResolvedKeys[0];

  const packageMatches = Object.keys(lockEntries).filter(
    (key) => parseNamedVersion(key)?.name === request.name,
  );
  return packageMatches.length === 1 ? packageMatches[0] : null;
}

function parseRegistryRequest(value) {
  const scoped = value.match(/^(@[^/]+\/[^/@]+)(?:@([^/]+))?(?:\/.*)?$/);
  if (scoped) {
    return {
      name: scoped[1],
      version: scoped[2],
      packageSpec: scoped[2] ? `${scoped[1]}@${scoped[2]}` : scoped[1],
    };
  }
  const unscoped = value.match(/^([^/@]+)(?:@([^/]+))?(?:\/.*)?$/);
  if (!unscoped) return null;
  return {
    name: unscoped[1],
    version: unscoped[2],
    packageSpec: unscoped[2] ? `${unscoped[1]}@${unscoped[2]}` : unscoped[1],
  };
}

function collectDenoJsrClosure(seedKeys, npmSeedKeys) {
  const queue = [...seedKeys];
  const visited = new Set();
  while (queue.length > 0) {
    const lockKey = queue.shift();
    if (visited.has(lockKey)) continue;
    visited.add(lockKey);
    const entry = denoLock.jsr?.[lockKey];
    if (!entry) {
      blockers.add(`JSR lock entry is missing: ${lockKey}`);
      continue;
    }
    const parsed = parseNamedVersion(lockKey);
    const licensePackageName =
      parsed.name === "@panva/jose" ? "jose" : parsed.name;
    const licenseDir = findPackageCandidate(
      licensePackageName,
      parsed.version,
    )?.dir;
    addRegistryComponent({
      ecosystem: "jsr",
      name: parsed.name,
      version: parsed.version,
      scope: "supabase-function-runtime",
      integrity: `sha256-${entry.integrity}`,
      licenseDir,
      evidence: "deno.lock",
    });
    for (const dependency of entry.dependencies || []) {
      if (dependency.startsWith("npm:")) {
        const packageName = dependency.slice(4);
        const resolved = resolveDenoLockDependency(
          denoLock.npm || {},
          packageName,
        );
        if (resolved) npmSeedKeys.add(resolved);
        else blockers.add(`Cannot resolve JSR npm dependency ${dependency}`);
      } else if (dependency.startsWith("jsr:")) {
        const resolved = resolveDenoLockDependency(
          denoLock.jsr || {},
          dependency.slice(4),
        );
        if (resolved) queue.push(resolved);
        else blockers.add(`Cannot resolve JSR dependency ${dependency}`);
      }
    }
  }
}

function collectDenoNpmClosure(seedKeys) {
  const queue = [...seedKeys];
  const visited = new Set();
  while (queue.length > 0) {
    const lockKey = queue.shift();
    if (visited.has(lockKey)) continue;
    visited.add(lockKey);
    const entry = denoLock.npm?.[lockKey];
    if (!entry) {
      blockers.add(`Deno npm lock entry is missing: ${lockKey}`);
      continue;
    }
    const parsed = parseNamedVersion(lockKey);
    const packageDir = findPackageCandidate(parsed.name, parsed.version)?.dir;
    if (!packageDir) {
      blockers.add(
        `Locked Deno npm package is not cached for license review: ${parsed.name}@${parsed.version}`,
      );
    } else {
      addNpmPackageDir(packageDir, "supabase-function-runtime", {
        evidence: "deno.lock",
        integrity: entry.integrity,
      });
    }
    for (const dependency of entry.dependencies || []) {
      const resolved = resolveDenoLockDependency(denoLock.npm, dependency);
      if (resolved) queue.push(resolved);
      else
        blockers.add(
          `Cannot resolve Deno npm dependency ${dependency} from ${lockKey}`,
        );
    }
  }
}

function resolveDenoLockDependency(lockEntries, dependency) {
  if (lockEntries[dependency]) return dependency;
  const exactPrefix = `${dependency}_`;
  const exactMatches = Object.keys(lockEntries).filter(
    (key) => key === dependency || key.startsWith(exactPrefix),
  );
  if (exactMatches.length === 1) return exactMatches[0];
  const parsed = parseNamedVersion(dependency);
  const packageName = parsed?.name || dependency;
  const nameMatches = Object.keys(lockEntries).filter(
    (key) => parseNamedVersion(key)?.name === packageName,
  );
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

function parseNamedVersion(value) {
  const match = value.match(/^(@[^/]+\/[^@]+|[^@]+)@([^_]+)(?:_.*)?$/);
  return match ? { name: match[1], version: match[2] } : null;
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return specifiers;
}

function npmPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.includes(":")
  ) {
    return null;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0];
}

function collectCopiedSource() {
  addManualComponent({
    ref: "pkg:github/marmelab/atomic-crm@167a4cdb652b1ab2b4b030831cfa7adcf2099321",
    name: "Atomic CRM",
    version: "0.1.0+167a4cdb",
    licenseText: fs.readFileSync(path.join(root, "LICENSE.md"), "utf8"),
    scope: "copied-source",
    purl: "pkg:github/marmelab/atomic-crm@167a4cdb652b1ab2b4b030831cfa7adcf2099321",
    repository: "https://github.com/marmelab/atomic-crm",
    evidence: "LICENSE.md,src/components/atomic-crm",
  });
  addManualComponent({
    ref: "pkg:github/marmelab/shadcn-admin-kit@v1.6.0",
    name: "Shadcn Admin Kit",
    version: "1.6.0",
    licenseText: copiedSourceLicenses["shadcn-admin-kit"],
    scope: "copied-source",
    purl: "pkg:github/marmelab/shadcn-admin-kit@v1.6.0",
    repository: "https://github.com/marmelab/shadcn-admin-kit",
    evidence: "src/components/admin",
  });
  addManualComponent({
    ref: "urn:workbench:copied-source:shadcn-ui",
    name: "shadcn/ui copied components",
    licenseText: copiedSourceLicenses["shadcn-ui"],
    scope: "copied-source",
    repository: "https://github.com/shadcn-ui/ui",
    evidence: "src/components/ui",
  });
}

function addNpmPackageDir(packageDir, scope, extra = {}) {
  const packageJsonFile = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonFile)) {
    blockers.add(`Package metadata is missing: ${relativePath(packageDir)}`);
    return;
  }
  const packageJson = readJson(packageJsonFile);
  if (!packageJson.name || !packageJson.version) {
    blockers.add(
      `Package identity is incomplete: ${relativePath(packageJsonFile)}`,
    );
    return;
  }
  const ref = npmPurl(packageJson.name, packageJson.version);
  const existing = components.get(ref);
  if (existing) {
    existing.scopes.add(scope);
    mergeProperty(existing, "workbench:evidence", extra.evidence);
    mergeProperty(existing, "workbench:fingerprint", extra.fingerprint);
    return;
  }

  const selected = selectLicense(packageJson.license);
  let licenseFiles = readPackageLicenseFiles(packageDir, selected.choice);
  const licenseOverride =
    verifiedLicenseOverrides[`${packageJson.name}@${packageJson.version}`];
  if (licenseFiles.length === 0 && licenseOverride) {
    if (licenseOverride.license !== selected.license?.id) {
      blockers.add(
        `${packageJson.name}@${packageJson.version} verified license override does not match package metadata`,
      );
    } else {
      const overrideFile = path.join(outputDir, licenseOverride.file);
      if (!fs.existsSync(overrideFile)) {
        blockers.add(
          `${packageJson.name}@${packageJson.version} verified license override file is missing: ${licenseOverride.file}`,
        );
      } else {
        licenseFiles = [
          {
            name: path.basename(overrideFile),
            text: `${normalizeText(fs.readFileSync(overrideFile, "utf8"))}\n`,
          },
        ];
      }
    }
  }
  if (!selected.license && !selected.expression) {
    blockers.add(
      `${packageJson.name}@${packageJson.version} has no recognized license metadata`,
    );
  }
  if (licenseFiles.length === 0) {
    blockers.add(
      `${packageJson.name}@${packageJson.version} has no distributable license/notice file`,
    );
  }
  const integrity =
    extra.integrity ||
    findPackageLockIntegrity(packageJson.name, packageJson.version);
  const component = {
    ref,
    type: "library",
    name: packageJson.name,
    version: packageJson.version,
    purl: ref,
    license:
      selected.license ||
      (selected.expression ? undefined : { name: "NOASSERTION" }),
    licenseExpression: selected.expression,
    licenseLabel: selected.label || "NOASSERTION",
    licenseTexts: licenseFiles,
    scopes: new Set([scope]),
    repository: normalizeRepository(packageJson.repository),
    integrity,
    properties: new Map(),
  };
  mergeProperty(component, "workbench:evidence", extra.evidence);
  mergeProperty(component, "workbench:fingerprint", extra.fingerprint);
  if (licenseOverride && licenseFiles.length > 0) {
    component.properties.set(
      "workbench:verified-license-source",
      licenseOverride.source,
    );
    component.properties.set(
      "workbench:verified-license-reason",
      licenseOverride.reason,
    );
  }
  if (selected.choice) {
    component.properties.set("workbench:dual-license-choice", selected.choice);
  }
  components.set(ref, component);
}

function addRegistryComponent({
  ecosystem,
  name,
  version,
  scope,
  integrity,
  licenseDir,
  evidence,
}) {
  const ref = `pkg:generic/${ecosystem}.io/${encodePurlName(name)}@${encodeURIComponent(version)}`;
  const packageJson = licenseDir
    ? readJson(path.join(licenseDir, "package.json"))
    : {};
  const selected = selectLicense(packageJson.license || "MIT");
  const licenseTexts = licenseDir
    ? readPackageLicenseFiles(licenseDir, selected.choice)
    : [];
  if (licenseTexts.length === 0) {
    blockers.add(
      `${ecosystem}:${name}@${version} has no locally verified license text`,
    );
  }
  components.set(ref, {
    ref,
    type: "library",
    name,
    version,
    purl: ref,
    license:
      selected.license ||
      (selected.expression ? undefined : { name: "NOASSERTION" }),
    licenseExpression: selected.expression,
    licenseLabel: selected.label || "NOASSERTION",
    licenseTexts,
    scopes: new Set([scope]),
    repository: normalizeRepository(packageJson.repository),
    integrity,
    properties: new Map([["workbench:evidence", evidence]]),
  });
}

function addManualComponent({
  ref,
  name,
  version,
  licenseText,
  scope,
  purl,
  repository,
  evidence,
}) {
  components.set(ref, {
    ref,
    type: "library",
    name,
    version,
    purl,
    license: { id: "MIT" },
    licenseLabel: "MIT",
    licenseTexts: [
      { name: "LICENSE", text: normalizeText(licenseText) + "\n" },
    ],
    scopes: new Set([scope]),
    repository,
    properties: new Map([["workbench:evidence", evidence]]),
  });
}

function selectLicense(rawLicense) {
  const raw = typeof rawLicense === "object" ? rawLicense?.type : rawLicense;
  if (!raw || /^(UNLICENSED|SEE LICENSE IN)/i.test(raw)) return {};
  if (/MPL-2\.0/.test(raw) && /Apache-2\.0/.test(raw) && /\bOR\b/.test(raw)) {
    return {
      license: { id: "Apache-2.0" },
      label: "Apache-2.0 (selected from MPL-2.0 OR Apache-2.0)",
      choice: "Apache-2.0",
    };
  }
  if (
    /\bMIT\b/.test(raw) &&
    /GPL-3\.0-or-later/.test(raw) &&
    /\bOR\b/.test(raw)
  ) {
    return {
      license: { id: "MIT" },
      label: "MIT (selected from MIT OR GPL-3.0-or-later)",
      choice: "MIT",
    };
  }
  if (/^[A-Za-z0-9.+-]+$/.test(raw)) {
    return { license: { id: raw }, label: raw };
  }
  return { expression: raw, label: raw };
}

function readPackageLicenseFiles(packageDir, selectedChoice) {
  const files = fs
    .readdirSync(packageDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^(licen[cs]e|copying|notice)(?:[-._].*)?$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .filter((name) => !(selectedChoice === "Apache-2.0" && /MPL/i.test(name)))
    .sort();
  return files.map((name) => {
    let text = normalizeText(
      fs.readFileSync(path.join(packageDir, name), "utf8"),
    );
    const jsZipGplMarker = "\nGPL version 3\n";
    if (
      selectedChoice === "MIT" &&
      text.startsWith("JSZip is dual licensed.") &&
      text.includes(jsZipGplMarker)
    ) {
      text = text.slice(0, text.indexOf(jsZipGplMarker)).trimEnd();
    }
    return { name, text: `${text}\n` };
  });
}

function findPackageLockIntegrity(name, version) {
  const matches = Object.entries(packageLock.packages || {}).filter(
    ([, value]) => {
      return (
        value.name === name && value.version === version && value.integrity
      );
    },
  );
  if (matches.length > 0) return matches[0][1].integrity;
  for (const [lockPath, value] of Object.entries(packageLock.packages || {})) {
    if (
      !lockPath.includes("node_modules/") ||
      value.version !== version ||
      !value.integrity
    ) {
      continue;
    }
    const packageDir = path.join(root, lockPath);
    try {
      if (readJson(path.join(packageDir, "package.json")).name === name)
        return value.integrity;
    } catch {
      // A platform-specific lock entry may not be installed on this machine.
    }
  }
  return undefined;
}

function normalizeRepository(repository) {
  const value = typeof repository === "string" ? repository : repository?.url;
  const normalized = value
    ?.replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
  if (!normalized) return undefined;
  const githubPath = normalized
    .replace(/^github:/, "")
    .replace(/^git@github\.com:/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(githubPath)) {
    return `https://github.com/${githubPath}`;
  }
  return normalized;
}

function mergeProperty(component, name, value) {
  if (!value) return;
  const current = component.properties.get(name);
  const values = new Set([
    ...(current ? current.split(",") : []),
    ...value.split(","),
  ]);
  component.properties.set(name, [...values].filter(Boolean).sort().join(","));
}

function npmPurl(name, version) {
  return `pkg:npm/${encodePurlName(name)}@${encodeURIComponent(version)}`;
}

function encodePurlName(name) {
  if (!name.startsWith("@")) return encodeURIComponent(name);
  const [scope, packageName] = name.slice(1).split("/");
  return `%40${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}`;
}

function buildPackageCandidateIndex() {
  const index = new Map();
  const add = (packageDir) => {
    try {
      const packageJson = readJson(path.join(packageDir, "package.json"));
      if (!index.has(packageJson.name)) index.set(packageJson.name, []);
      const candidates = index.get(packageJson.name);
      if (!candidates.some((candidate) => candidate.dir === packageDir)) {
        candidates.push({
          name: packageJson.name,
          version: packageJson.version,
          dir: packageDir,
        });
      }
    } catch {
      // Ignore absent optional packages and incomplete global caches.
    }
  };

  for (const lockPath of Object.keys(packageLock.packages || {})) {
    if (lockPath.includes("node_modules/")) add(path.join(root, lockPath));
  }

  const cacheRoots = [
    process.env.DENO_DIR &&
      path.join(process.env.DENO_DIR, "npm", "registry.npmjs.org"),
    path.join(
      os.homedir(),
      "Library",
      "Caches",
      "deno",
      "npm",
      "registry.npmjs.org",
    ),
    path.join(os.homedir(), ".cache", "deno", "npm", "registry.npmjs.org"),
  ].filter(Boolean);
  for (const cacheRoot of cacheRoots) {
    if (!fs.existsSync(cacheRoot)) continue;
    for (const first of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!first.isDirectory()) continue;
      const firstPath = path.join(cacheRoot, first.name);
      if (first.name.startsWith("@")) {
        for (const second of fs.readdirSync(firstPath, {
          withFileTypes: true,
        })) {
          if (!second.isDirectory()) continue;
          const packagePath = path.join(firstPath, second.name);
          for (const version of fs.readdirSync(packagePath, {
            withFileTypes: true,
          })) {
            if (version.isDirectory())
              add(path.join(packagePath, version.name));
          }
        }
      } else {
        for (const version of fs.readdirSync(firstPath, {
          withFileTypes: true,
        })) {
          if (version.isDirectory()) add(path.join(firstPath, version.name));
        }
      }
    }
  }
  return index;
}

function findPackageCandidate(name, version) {
  return (packageCandidates.get(name) || []).find(
    (candidate) => candidate.version === version,
  );
}

function compareComponents(left, right) {
  return (
    left.name.localeCompare(right.name, "en") ||
    String(left.version || "").localeCompare(
      String(right.version || ""),
      "en",
    ) ||
    left.ref.localeCompare(right.ref, "en")
  );
}

function toCycloneDxComponent(component) {
  const result = {
    type: component.type,
    "bom-ref": component.ref,
    name: component.name,
    licenses: [
      component.licenseExpression
        ? { expression: component.licenseExpression }
        : { license: component.license },
    ],
    properties: [
      {
        name: "workbench:distribution-scope",
        value: [...component.scopes].sort().join(","),
      },
      ...[...component.properties.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([name, value]) => ({ name, value })),
    ],
  };
  if (component.version) result.version = component.version;
  if (component.purl) result.purl = component.purl;
  if (component.repository) {
    result.externalReferences = [{ type: "vcs", url: component.repository }];
  }
  const hash = integrityToHash(component.integrity);
  if (hash) result.hashes = [hash];
  return result;
}

function validateCycloneDxStructure(document) {
  const knownRefs = new Set([document.metadata.component["bom-ref"]]);
  for (const component of document.components) {
    if (knownRefs.has(component["bom-ref"])) {
      blockers.add(`CycloneDX bom-ref is duplicated: ${component["bom-ref"]}`);
    }
    knownRefs.add(component["bom-ref"]);

    if (!Array.isArray(component.licenses) || component.licenses.length === 0) {
      blockers.add(`${component["bom-ref"]} has no CycloneDX license choice`);
      continue;
    }
    for (const choice of component.licenses) {
      const hasExpression =
        typeof choice.expression === "string" && choice.expression.length > 0;
      const hasLicense =
        choice.license &&
        (typeof choice.license.id === "string" ||
          typeof choice.license.name === "string");
      if (hasExpression === Boolean(hasLicense)) {
        blockers.add(
          `${component["bom-ref"]} has an invalid CycloneDX license choice`,
        );
      }
      if (choice.license && "expression" in choice.license) {
        blockers.add(
          `${component["bom-ref"]} nests an SPDX expression inside license instead of the CycloneDX expression field`,
        );
      }
    }

    for (const reference of component.externalReferences || []) {
      try {
        const url = new URL(reference.url);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        blockers.add(
          `${component["bom-ref"]} has a non-HTTP external reference: ${reference.url}`,
        );
      }
    }
  }

  for (const dependency of document.dependencies || []) {
    for (const ref of [dependency.ref, ...(dependency.dependsOn || [])]) {
      if (!knownRefs.has(ref)) {
        blockers.add(`CycloneDX dependency references unknown bom-ref: ${ref}`);
      }
    }
  }
}

function integrityToHash(integrity) {
  if (!integrity) return null;
  const match = integrity.match(/^(sha256|sha384|sha512)-(.+)$/i);
  if (!match) return null;
  const algorithm = match[1].toUpperCase().replace("SHA", "SHA-");
  const raw = match[2];
  const content = /^[a-f0-9]+$/i.test(raw)
    ? raw.toLowerCase()
    : Buffer.from(raw, "base64").toString("hex");
  return { alg: algorithm, content };
}

function renderThirdPartyLicenses(sorted) {
  const lines = [
    "ENTERPRISE LEAD WORKBENCH - THIRD-PARTY LICENSE TEXTS",
    "",
    "This file is generated from production source maps, server runtime imports,",
    "package locks, package archives/caches, and copied-source provenance.",
    "Do not edit it manually. See THIRD_PARTY_NOTICES.md for the release command.",
    "",
  ];
  if (blockers.size > 0) {
    lines.push(
      "RELEASE STATUS: INCOMPLETE - SEE compliance/SBOM_BLOCKERS.md",
      "",
    );
  }
  for (const component of sorted) {
    lines.push("=".repeat(80));
    lines.push(
      `${component.name}${component.version ? `@${component.version}` : ""}`,
    );
    lines.push(`License: ${component.licenseLabel}`);
    lines.push(
      `Distribution scope: ${[...component.scopes].sort().join(", ")}`,
    );
    lines.push("-".repeat(80));
    if (component.licenseTexts.length === 0) {
      lines.push(
        "LICENSE TEXT UNRESOLVED. This component blocks commercial distribution.",
        "",
      );
      continue;
    }
    for (const licenseFile of component.licenseTexts) {
      lines.push(`[${licenseFile.name}]`, licenseFile.text.trimEnd(), "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderBlockers() {
  const lines = [
    "# SBOM release blockers",
    "",
    "This file is generated. A production release is compliant only when this list is empty and `--check` succeeds.",
    "",
  ];
  if (blockers.size === 0) lines.push("No blockers detected.");
  else for (const blocker of [...blockers].sort()) lines.push(`- ${blocker}`);
  return `${lines.join("\n")}\n`;
}
