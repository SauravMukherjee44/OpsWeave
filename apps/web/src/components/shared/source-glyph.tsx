import {
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
} from "lucide-react";
import { SectionIcon, type IconTone } from "@/components/ui";

export function SourceGlyph({ mediaType, size = 17 }: { mediaType: string; size?: number }) {
  if (mediaType.startsWith("image/")) return <FileImage size={size} />;
  if (mediaType.startsWith("audio/")) return <FileAudio size={size} />;
  if (mediaType.startsWith("video/")) return <FileVideo size={size} />;
  if (mediaType.includes("sheet") || mediaType.includes("csv")) return <FileSpreadsheet size={size} />;
  return <FileText size={size} />;
}

/** Modality drives the icon tone so the library scans by type at a glance. */
export function mediaTone(mediaType: string): IconTone {
  if (mediaType.startsWith("image/")) return "accent";
  if (mediaType.startsWith("audio/")) return "warning";
  if (mediaType.startsWith("video/")) return "danger";
  if (mediaType.includes("csv") || mediaType.includes("sheet")) return "success";
  if (mediaType.includes("json") || mediaType.includes("yaml")) return "info";
  return "primary";
}

export function mediaGroup(mediaType: string) {
  if (mediaType.startsWith("image/")) return "Images";
  if (mediaType.startsWith("audio/")) return "Audio";
  if (mediaType.startsWith("video/")) return "Video";
  if (mediaType.includes("csv") || mediaType.includes("json") || mediaType.includes("yaml")) {
    return "Structured";
  }
  return "Documents";
}

export function SourceIcon({ mediaType, size = "md" }: { mediaType: string; size?: "sm" | "md" | "lg" }) {
  return (
    <SectionIcon tone={mediaTone(mediaType)} size={size}>
      <SourceGlyph mediaType={mediaType} />
    </SectionIcon>
  );
}
