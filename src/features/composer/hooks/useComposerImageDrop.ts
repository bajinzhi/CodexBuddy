import { useEffect, useRef, useState } from "react";
import { subscribeWindowDragDrop } from "../../../services/dragDrop";

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

const documentExtensions = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".docx",
  ".pptx",
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
];

function isSupportedAttachmentPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".gdoc")) {
    return false;
  }
  return (
    imageExtensions.some((ext) => lower.endsWith(ext)) ||
    documentExtensions.some((ext) => lower.endsWith(ext))
  );
}

function uniqueNonEmptyStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getFilePath(file: File) {
  return (file as File & { path?: string }).path ?? "";
}

function getSupportedAttachmentPaths(files: File[]) {
  return uniqueNonEmptyStrings(files.map(getFilePath)).filter(isSupportedAttachmentPath);
}

function isDragFileTransfer(types: readonly string[] | undefined) {
  if (!types || types.length === 0) {
    return false;
  }
  return (
    types.includes("Files") ||
    types.includes("public.file-url") ||
    types.includes("application/x-moz-file")
  );
}

function getTransferTypes(types: readonly string[] | undefined) {
  if (!types || types.length === 0) {
    return [];
  }
  return Array.from(types);
}

function hasTextualClipboardData(clipboardData: DataTransfer | null | undefined) {
  if (!clipboardData) {
    return false;
  }
  const getData = (clipboardData as DataTransfer & {
    getData?: (format: string) => string;
  }).getData;
  if (typeof getData === "function") {
    try {
      if (getData.call(clipboardData, "text/plain").length > 0) {
        return true;
      }
    } catch {
      // Some webviews expose clipboard metadata without allowing text reads.
    }
  }
  return getTransferTypes(clipboardData.types).some((type) =>
    type.toLowerCase().startsWith("text/"),
  );
}

async function readNativeClipboardAttachmentPaths() {
  try {
    const { readClipboardFilePaths } = await import("../../../services/tauri");
    const paths = await readClipboardFilePaths();
    return uniqueNonEmptyStrings(paths).filter(isSupportedAttachmentPath);
  } catch {
    return [];
  }
}

function readFilesAsDataUrls(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        }),
    ),
  ).then((items) => items.filter(Boolean));
}

function getDragPosition(position: { x: number; y: number }) {
  return position;
}

function normalizeDragPosition(
  position: { x: number; y: number },
  lastClientPosition: { x: number; y: number } | null,
) {
  const scale = window.devicePixelRatio || 1;
  if (scale === 1 || !lastClientPosition) {
    return getDragPosition(position);
  }
  const logicalDistance = Math.hypot(
    position.x - lastClientPosition.x,
    position.y - lastClientPosition.y,
  );
  const scaled = { x: position.x / scale, y: position.y / scale };
  const scaledDistance = Math.hypot(
    scaled.x - lastClientPosition.x,
    scaled.y - lastClientPosition.y,
  );
  return scaledDistance < logicalDistance ? scaled : position;
}

type UseComposerImageDropArgs = {
  disabled: boolean;
  onAttachImages?: (paths: string[]) => void;
};

export function useComposerImageDrop({
  disabled,
  onAttachImages,
}: UseComposerImageDropArgs) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropTargetRef = useRef<HTMLDivElement | null>(null);
  const lastClientPositionRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    if (disabled) {
      return undefined;
    }
    unlisten = subscribeWindowDragDrop((event) => {
      if (!dropTargetRef.current) {
        return;
      }
      if (event.payload.type === "leave") {
        setIsDragOver(false);
        return;
      }
      const position = normalizeDragPosition(
        event.payload.position,
        lastClientPositionRef.current,
      );
      const rect = dropTargetRef.current.getBoundingClientRect();
      const isInside =
        position.x >= rect.left &&
        position.x <= rect.right &&
        position.y >= rect.top &&
        position.y <= rect.bottom;
      if (event.payload.type === "over" || event.payload.type === "enter") {
        setIsDragOver(isInside);
        return;
      }
      if (event.payload.type === "drop") {
        setIsDragOver(false);
        if (!isInside) {
          return;
        }
        const attachmentPaths = (event.payload.paths ?? [])
          .map((path) => path.trim())
          .filter(Boolean)
          .filter(isSupportedAttachmentPath);
        if (attachmentPaths.length > 0) {
          onAttachImages?.(attachmentPaths);
        }
      }
    });
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [disabled, onAttachImages]);

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    if (isDragFileTransfer(event.dataTransfer?.types)) {
      lastClientPositionRef.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    handleDragOver(event);
  };

  const handleDragLeave = () => {
    if (isDragOver) {
      setIsDragOver(false);
      lastClientPositionRef.current = null;
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setIsDragOver(false);
    lastClientPositionRef.current = null;
    const files = Array.from(event.dataTransfer?.files ?? []);
    const items = Array.from(event.dataTransfer?.items ?? []);
    const itemFiles = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const attachmentPaths = getSupportedAttachmentPaths([...files, ...itemFiles]);
    if (attachmentPaths.length > 0) {
      onAttachImages?.(attachmentPaths);
      return;
    }
    const fileImages = [...files, ...itemFiles].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (fileImages.length === 0) {
      return;
    }
    const dataUrls = await readFilesAsDataUrls(fileImages);
    if (dataUrls.length > 0) {
      onAttachImages?.(dataUrls);
    }
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      return;
    }
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }
    const files = Array.from(clipboardData.files ?? []);
    const items = Array.from(clipboardData.items ?? []);
    const itemFiles = items
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const attachmentPaths = getSupportedAttachmentPaths([...files, ...itemFiles]);
    if (attachmentPaths.length > 0) {
      event.preventDefault();
      onAttachImages?.(attachmentPaths);
      return;
    }

    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length > 0) {
      event.preventDefault();
      const imageFiles = imageItems
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!imageFiles.length) {
        return;
      }
      const dataUrls = await readFilesAsDataUrls(imageFiles);
      if (dataUrls.length > 0) {
        onAttachImages?.(dataUrls);
      }
      return;
    }

    if (hasTextualClipboardData(clipboardData)) {
      return;
    }

    event.preventDefault();
    const nativeAttachmentPaths = await readNativeClipboardAttachmentPaths();
    if (nativeAttachmentPaths.length > 0) {
      onAttachImages?.(nativeAttachmentPaths);
    }
  };

  return {
    dropTargetRef,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
  };
}
