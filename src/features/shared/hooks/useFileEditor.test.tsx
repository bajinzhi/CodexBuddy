// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFileEditor, type FileEditorResponse } from "./useFileEditor";

describe("useFileEditor", () => {
  it("does not refresh again when only error titles change", async () => {
    const read = vi.fn(async (): Promise<FileEditorResponse> => ({
      exists: true,
      content: "initial",
      truncated: false,
    }));
    const write = vi.fn(async (_content: string) => {});

    const { result, rerender } = renderHook(
      ({ readErrorTitle, writeErrorTitle }: { readErrorTitle: string; writeErrorTitle: string }) =>
        useFileEditor({
          key: "editor-key",
          read,
          write,
          readErrorTitle,
          writeErrorTitle,
        }),
      {
        initialProps: {
          readErrorTitle: "Read failed",
          writeErrorTitle: "Write failed",
        },
      },
    );

    await waitFor(() => {
      expect(result.current.content).toBe("initial");
    });

    act(() => {
      result.current.setContent("draft");
    });

    rerender({
      readErrorTitle: "读取失败",
      writeErrorTitle: "写入失败",
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.content).toBe("draft");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
