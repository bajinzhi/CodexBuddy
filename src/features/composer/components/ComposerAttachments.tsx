import { convertFileSrc } from "@tauri-apps/api/core";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Image from "lucide-react/dist/esm/icons/image";
import X from "lucide-react/dist/esm/icons/x";
import { getFileTypeIconUrl } from "../../../utils/fileTypeIcons";

type ComposerAttachmentsProps = {
  attachments: string[];
  disabled: boolean;
  onRemoveAttachment?: (path: string) => void;
};

function fileTitle(path: string) {
  if (path.startsWith("data:")) {
    return "Pasted image";
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return "Image";
  }
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

const imageExtensions = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
];

function isImageAttachment(path: string) {
  if (path.startsWith("data:image/")) {
    return true;
  }
  if (path.startsWith("data:")) {
    return false;
  }
  const lower = path.toLowerCase();
  return imageExtensions.some((ext) => lower.endsWith(ext));
}

function attachmentPreviewSrc(path: string) {
  if (!isImageAttachment(path)) {
    return "";
  }
  if (path.startsWith("data:")) {
    return path;
  }
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

function fileIconSrc(path: string) {
  if (isImageAttachment(path)) {
    return "";
  }
  try {
    return getFileTypeIconUrl(fileTitle(path));
  } catch {
    return "";
  }
}

export function ComposerAttachments({
  attachments,
  disabled,
  onRemoveAttachment,
}: ComposerAttachmentsProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="composer-attachments">
      {attachments.map((path) => {
        const title = fileTitle(path);
        const titleAttr = path.startsWith("data:") ? "Pasted image" : path;
        const previewSrc = attachmentPreviewSrc(path);
        const iconSrc = fileIconSrc(path);
        return (
          <div
            key={path}
            className="composer-attachment"
            title={titleAttr}
          >
            {previewSrc && (
              <span className="composer-attachment-preview" aria-hidden>
                <img src={previewSrc} alt="" />
              </span>
            )}
            {previewSrc ? (
              <span className="composer-attachment-thumb" aria-hidden>
                <img src={previewSrc} alt="" />
              </span>
            ) : iconSrc ? (
              <span className="composer-attachment-thumb composer-attachment-thumb--file" aria-hidden>
                <img src={iconSrc} alt="" />
              </span>
            ) : (
              <span className="composer-icon" aria-hidden>
                {isImageAttachment(path) ? <Image size={14} /> : <FileText size={14} />}
              </span>
            )}
            <span className="composer-attachment-name">{title}</span>
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => onRemoveAttachment?.(path)}
              aria-label={`Remove ${title}`}
              disabled={disabled}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
