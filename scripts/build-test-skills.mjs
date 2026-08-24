import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDirectory = path.join(projectRoot, "测试用Skill");
const fixedArchiveDate = new Date("2026-08-24T00:00:00.000Z");

const packages = [
  {
    source: "integrations/workbuddy-skill/enterprise-lead-workbench",
    output: "企业名单-找企业-测试版.zip",
    required: [
      "SKILL.md",
      "agents/openai.yaml",
      "references/app-contract.md",
      "references/kc-query-contract.md",
      "references/source-policy.md",
    ],
  },
  {
    source: "integrations/workbuddy-skill/enterprise-public-report",
    output: "企业名单-企业报告-测试版.zip",
    required: [
      "SKILL.md",
      "agents/openai.yaml",
      "references/agent-contract.md",
      "scripts/save_report.py",
    ],
  },
];

async function listFiles(directory, relativeDirectory = "") {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) continue;

    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

await mkdir(outputDirectory, { recursive: true });

for (const packageDefinition of packages) {
  const sourceDirectory = path.join(projectRoot, packageDefinition.source);
  const files = await listFiles(sourceDirectory);
  const missingFiles = packageDefinition.required.filter(
    (file) => !files.includes(file),
  );

  if (missingFiles.length > 0) {
    throw new Error(
      `${packageDefinition.output} 缺少必需文件：${missingFiles.join("、")}`,
    );
  }

  const archive = new JSZip();
  for (const relativePath of files) {
    const absolutePath = path.join(sourceDirectory, relativePath);
    const [contents, metadata] = await Promise.all([
      readFile(absolutePath),
      stat(absolutePath),
    ]);
    archive.file(relativePath, contents, {
      date: fixedArchiveDate,
      unixPermissions: metadata.mode & 0o777,
    });
  }

  const buffer = await archive.generateAsync({
    type: "nodebuffer",
    platform: "UNIX",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  const outputPath = path.join(outputDirectory, packageDefinition.output);
  await writeFile(outputPath, buffer);
  process.stdout.write(`${packageDefinition.output}: ${files.length} 个文件\n`);
}
