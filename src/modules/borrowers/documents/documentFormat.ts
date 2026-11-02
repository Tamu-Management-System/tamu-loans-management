import type { DocumentFile } from "../../../api/types";
import { formatDate } from "../../../lib/format";

/** 412_000 -> "402 KB", 2_400_000 -> "2.3 MB" */
export function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const fileType = (file: DocumentFile) => (file.contentType === "application/pdf" ? "PDF" : file.contentType === "image/png" ? "PNG" : "JPEG");

/**
 * How and when the document came in, e.g.
 * "Scanned paper · PDF · 402 KB · Sharon Nakalema, 21 Jul 2026",
 * "Completed online by David Ssali, 19 Jun 2026 · PDF · 288 KB" or, for photos, "JPEG · 402 KB · Sharon Nakalema, 21 Jul 2026".
 */
export function describeFile(file: DocumentFile, isForm = false) {
  const size = `${fileType(file)} · ${formatFileSize(file.sizeBytes)}`;
  const version = file.version > 1 ? ` · version ${file.version}` : "";
  if (isForm && file.method === "online") return `Completed online by ${file.uploadedBy}, ${formatDate(file.uploadedAt)} · ${size}${version}`;
  return `${isForm ? "Scanned paper · " : ""}${size} · ${file.uploadedBy}, ${formatDate(file.uploadedAt)}${version}`;
}
