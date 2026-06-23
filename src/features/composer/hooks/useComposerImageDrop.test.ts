/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComposerImageDrop } from "./useComposerImageDrop";

const readClipboardFilePathsMock = vi.hoisted(() => vi.fn());

let mockOnDragDropEvent:
  | ((event: {
      payload: {
        type: "enter" | "over" | "leave" | "drop";
        position: { x: number; y: number };
        paths?: string[];
      };
    }) => void)
  | null = null;

vi.mock("../../../services/dragDrop", () => ({
  subscribeWindowDragDrop: (handler: typeof mockOnDragDropEvent) => {
    mockOnDragDropEvent = handler;
    return () => {};
  },
}));

vi.mock("../../../services/tauri", () => ({
  readClipboardFilePaths: readClipboardFilePathsMock,
}));

type HookResult = ReturnType<typeof useComposerImageDrop>;

type RenderedHook = {
  result: HookResult;
  unmount: () => void;
};

function renderImageDropHook(options: { disabled: boolean; onAttachImages?: (paths: string[]) => void }): RenderedHook {
  let result: HookResult | undefined;

  function Test() {
    result = useComposerImageDrop(options);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(Test));
  });

  return {
    get result() {
      if (!result) {
        throw new Error("Hook not rendered");
      }
      return result;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function setMockFileReader(
  getResult: (file: File) => string | ArrayBuffer | null = (file) =>
    `data:${file.type};base64,MOCK`,
) {
  const OriginalFileReader = window.FileReader;
  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;
    onerror: ((ev: ProgressEvent<FileReader>) => unknown) | null = null;

    readAsDataURL(file: File) {
      this.result = getResult(file);
      this.onload?.({} as ProgressEvent<FileReader>);
    }
  }
  window.FileReader = MockFileReader as typeof FileReader;
  return () => {
    window.FileReader = OriginalFileReader;
  };
}

describe("useComposerImageDrop", () => {
  beforeEach(() => {
    mockOnDragDropEvent = null;
    readClipboardFilePathsMock.mockReset();
    readClipboardFilePathsMock.mockResolvedValue([]);
  });

  it("tracks drag over state for file transfers", () => {
    const hook = renderImageDropHook({ disabled: false });
    const preventDefault = vi.fn();

    act(() => {
      hook.result.handleDragOver({
        dataTransfer: { types: ["Files"] },
        preventDefault,
      } as unknown as React.DragEvent<HTMLElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(hook.result.isDragOver).toBe(true);

    act(() => {
      hook.result.handleDragLeave();
    });

    expect(hook.result.isDragOver).toBe(false);

    hook.unmount();
  });

  it("uses file paths on drop when available", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });

    const file = new File(["data"], "photo.png", { type: "image/png" });
    (file as File & { path?: string }).path = "/tmp/photo.png";

    await act(async () => {
      await hook.result.handleDrop({
        dataTransfer: { files: [file], items: [] },
        preventDefault: vi.fn(),
      } as unknown as React.DragEvent<HTMLElement>);
    });

    expect(onAttachImages).toHaveBeenCalledWith(["/tmp/photo.png"]);

    hook.unmount();
  });

  it("reads image data URLs when paths are missing", async () => {
    const restoreFileReader = setMockFileReader();
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });

    await act(async () => {
      await hook.result.handleDrop({
        dataTransfer: { files: [file], items: [] },
        preventDefault: vi.fn(),
      } as unknown as React.DragEvent<HTMLElement>);
    });

    expect(onAttachImages).toHaveBeenCalledWith([
      "data:image/jpeg;base64,MOCK",
    ]);

    hook.unmount();
    restoreFileReader();
  });

  it("handles pasted image items", async () => {
    const restoreFileReader = setMockFileReader();
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });
    const preventDefault = vi.fn();

    const file = new File(["data"], "paste.png", { type: "image/png" });
    const item = {
      type: "image/png",
      getAsFile: () => file,
    };

    await act(async () => {
      await hook.result.handlePaste({
        clipboardData: { items: [item] },
        preventDefault,
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(onAttachImages).toHaveBeenCalledWith([
      "data:image/png;base64,MOCK",
    ]);

    hook.unmount();
    restoreFileReader();
  });

  it("ignores pasted image data URLs with empty base64 payloads", async () => {
    const restoreFileReader = setMockFileReader((file) => `data:${file.type};base64,`);
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });
    const preventDefault = vi.fn();

    const file = new File([""], "paste.png", { type: "image/png" });
    const item = {
      type: "image/png",
      getAsFile: () => file,
    };

    await act(async () => {
      await hook.result.handlePaste({
        clipboardData: { items: [item] },
        preventDefault,
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(onAttachImages).not.toHaveBeenCalled();

    hook.unmount();
    restoreFileReader();
  });

  it("uses file paths on paste when available", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });
    const preventDefault = vi.fn();

    const document = new File(["data"], "spec.pdf", { type: "application/pdf" });
    (document as File & { path?: string }).path = "/tmp/spec.pdf";
    const unsupported = new File(["data"], "archive.zip", {
      type: "application/zip",
    });
    (unsupported as File & { path?: string }).path = "/tmp/archive.zip";
    const item = {
      kind: "file",
      type: "application/pdf",
      getAsFile: () => document,
    };

    await act(async () => {
      await hook.result.handlePaste({
        clipboardData: {
          files: [document, unsupported],
          items: [item],
          types: ["Files"],
        },
        preventDefault,
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(onAttachImages).toHaveBeenCalledWith(["/tmp/spec.pdf"]);
    expect(readClipboardFilePathsMock).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("falls back to native clipboard file paths when web clipboard has no text", async () => {
    readClipboardFilePathsMock.mockResolvedValue([
      "/tmp/spec.pdf",
      "/tmp/shortcut.gdoc",
      "/tmp/photo.png",
    ]);
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });
    const preventDefault = vi.fn();

    await act(async () => {
      await hook.result.handlePaste({
        clipboardData: {
          files: [],
          items: [],
          types: [],
          getData: () => "",
        },
        preventDefault,
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(readClipboardFilePathsMock).toHaveBeenCalledTimes(1);
    expect(onAttachImages).toHaveBeenCalledWith(["/tmp/spec.pdf", "/tmp/photo.png"]);

    hook.unmount();
  });

  it("leaves text paste alone instead of reading the native clipboard", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });
    const preventDefault = vi.fn();

    await act(async () => {
      await hook.result.handlePaste({
        clipboardData: {
          files: [],
          items: [],
          types: ["text/plain"],
          getData: () => "hello",
        },
        preventDefault,
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(readClipboardFilePathsMock).not.toHaveBeenCalled();
    expect(onAttachImages).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("filters tauri drag-drop paths and respects drop target", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });

    const target = document.createElement("div");
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100 } as DOMRect);
    hook.result.dropTargetRef.current = target;

    Object.defineProperty(window, "devicePixelRatio", {
      value: 2,
      configurable: true,
    });

    await act(async () => {
      await Promise.resolve();
    });

    if (!mockOnDragDropEvent) {
      throw new Error("Drag drop handler not registered");
    }

    act(() => {
      mockOnDragDropEvent?.({
        payload: {
          type: "over",
          position: { x: 40, y: 40 },
          paths: [],
        },
      });
    });

    expect(hook.result.isDragOver).toBe(true);

    act(() => {
      mockOnDragDropEvent?.({
        payload: {
          type: "drop",
          position: { x: 40, y: 40 },
          paths: [" /tmp/photo.png ", "/tmp/archive.zip"],
        },
      });
    });

    expect(onAttachImages).toHaveBeenCalledWith(["/tmp/photo.png"]);

    hook.unmount();
  });

  it("accepts heic paths from tauri drag-drop", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });

    const target = document.createElement("div");
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100 } as DOMRect);
    hook.result.dropTargetRef.current = target;

    await act(async () => {
      await Promise.resolve();
    });

    if (!mockOnDragDropEvent) {
      throw new Error("Drag drop handler not registered");
    }

    act(() => {
      mockOnDragDropEvent?.({
        payload: {
          type: "drop",
          position: { x: 40, y: 40 },
          paths: ["/tmp/screenshot.heic"],
        },
      });
    });

    expect(onAttachImages).toHaveBeenCalledWith(["/tmp/screenshot.heic"]);

    hook.unmount();
  });

  it("accepts supported document paths from tauri drag-drop", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: false, onAttachImages });

    const target = document.createElement("div");
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 100 } as DOMRect);
    hook.result.dropTargetRef.current = target;

    await act(async () => {
      await Promise.resolve();
    });

    if (!mockOnDragDropEvent) {
      throw new Error("Drag drop handler not registered");
    }

    act(() => {
      mockOnDragDropEvent?.({
        payload: {
          type: "drop",
          position: { x: 40, y: 40 },
          paths: ["/tmp/spec.pdf", "/tmp/shortcut.gdoc"],
        },
      });
    });

    expect(onAttachImages).toHaveBeenCalledWith(["/tmp/spec.pdf"]);

    hook.unmount();
  });

  it("ignores drag/drop and paste when disabled", async () => {
    const onAttachImages = vi.fn();
    const hook = renderImageDropHook({ disabled: true, onAttachImages });
    const preventDefault = vi.fn();

    act(() => {
      hook.result.handleDragOver({
        dataTransfer: { types: ["Files"] },
        preventDefault,
      } as unknown as React.DragEvent<HTMLElement>);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(hook.result.isDragOver).toBe(false);

    await act(async () => {
      await hook.result.handleDrop({
        dataTransfer: { files: [], items: [] },
        preventDefault: vi.fn(),
      } as unknown as React.DragEvent<HTMLElement>);
    });
    expect(onAttachImages).not.toHaveBeenCalled();

    await act(async () => {
      await hook.result.handlePaste({
        clipboardData: { items: [] },
        preventDefault,
      } as unknown as React.ClipboardEvent<HTMLTextAreaElement>);
    });
    expect(onAttachImages).not.toHaveBeenCalled();

    hook.unmount();
  });
});
