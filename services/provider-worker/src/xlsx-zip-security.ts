import { WorkerError } from "./errors";

export type XlsxZipLimits = {
  maxEntries: number;
  maxTotalUncompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxXmlUncompressedBytes: number;
  maxCompressionRatio: number;
  ratioCheckMinimumBytes: number;
};

export const DEFAULT_XLSX_ZIP_LIMITS: XlsxZipLimits = {
  maxEntries: 2_048,
  maxTotalUncompressedBytes: 64 * 1024 * 1024,
  maxEntryUncompressedBytes: 32 * 1024 * 1024,
  maxXmlUncompressedBytes: 32 * 1024 * 1024,
  maxCompressionRatio: 200,
  ratioCheckMinimumBytes: 1024 * 1024,
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function invalidArchive(): never {
  throw new WorkerError(
    "IMPORT_XLSX_INVALID",
    "Excel 文件损坏或格式不受支持。",
  );
}

function unsafeArchive(): never {
  throw new WorkerError(
    "IMPORT_XLSX_UNSAFE_ARCHIVE",
    "Excel 文件解压后超过安全处理限制，请拆分或重新导出后重试。",
  );
}

function decodeEntryName(bytes: Uint8Array, utf8: boolean): string {
  try {
    return new TextDecoder(utf8 ? "utf-8" : "latin1", {
      fatal: true,
    }).decode(bytes);
  } catch {
    return invalidArchive();
  }
}

function isUnsafePath(name: string): boolean {
  if (!name || name.includes("\\") || name.startsWith("/")) return true;
  if (/^[A-Za-z]:/.test(name) || name.includes("\0")) return true;
  return name.split("/").some((segment) => segment === "..");
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 22 - 65_535);
  for (
    let offset = view.byteLength - 22;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return invalidArchive();
}

export function validateXlsxZipArchive(
  bytes: Uint8Array,
  limits: XlsxZipLimits = DEFAULT_XLSX_ZIP_LIMITS,
): void {
  if (bytes.byteLength < 22) invalidArchive();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  if (eocdOffset + 22 + commentLength !== bytes.byteLength) invalidArchive();

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntries = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    unsafeArchive();
  }
  if (totalEntries > limits.maxEntries) unsafeArchive();
  const centralEnd = centralOffset + centralSize;
  if (centralEnd > eocdOffset || centralOffset > bytes.byteLength) {
    invalidArchive();
  }

  let offset = centralOffset;
  let totalUncompressedBytes = 0;
  const paths = new Set<string>();
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (
      offset + 46 > centralEnd ||
      view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE
    ) {
      invalidArchive();
    }
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedBytes = view.getUint32(offset + 20, true);
    const uncompressedBytes = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localOffset = view.getUint32(offset + 42, true);
    const entryEnd =
      offset + 46 + nameLength + extraLength + entryCommentLength;
    if (entryEnd > centralEnd || diskStart !== 0) invalidArchive();
    if ((flags & 0x1) !== 0) unsafeArchive();

    const name = decodeEntryName(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
      (flags & 0x800) !== 0,
    );
    if (isUnsafePath(name) || paths.has(name)) unsafeArchive();
    paths.add(name);

    totalUncompressedBytes += uncompressedBytes;
    if (
      totalUncompressedBytes > limits.maxTotalUncompressedBytes ||
      uncompressedBytes > limits.maxEntryUncompressedBytes ||
      (name.toLocaleLowerCase("en-US").endsWith(".xml") &&
        uncompressedBytes > limits.maxXmlUncompressedBytes)
    ) {
      unsafeArchive();
    }
    if (
      uncompressedBytes >= limits.ratioCheckMinimumBytes &&
      uncompressedBytes / Math.max(1, compressedBytes) >
        limits.maxCompressionRatio
    ) {
      unsafeArchive();
    }

    if (
      localOffset + 30 > bytes.byteLength ||
      view.getUint32(localOffset, true) !== LOCAL_FILE_SIGNATURE
    ) {
      invalidArchive();
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localDataOffset =
      localOffset + 30 + localNameLength + localExtraLength;
    const localFlags = view.getUint16(localOffset + 6, true);
    const localCompressionMethod = view.getUint16(localOffset + 8, true);
    if ((localFlags & 0x1) !== 0) unsafeArchive();
    if (localCompressionMethod !== compressionMethod) invalidArchive();
    const localName = decodeEntryName(
      bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength),
      (localFlags & 0x800) !== 0,
    );
    if (localName !== name || isUnsafePath(localName)) unsafeArchive();
    if (localDataOffset + compressedBytes > bytes.byteLength) invalidArchive();

    offset = entryEnd;
  }
  if (offset !== centralEnd) invalidArchive();
}
