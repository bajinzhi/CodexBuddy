// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileEditorCard } from "./FileEditorCard";

const classNames = {
  container: "container",
  header: "header",
  title: "title",
  actions: "actions",
  meta: "meta",
  iconButton: "icon-button",
  error: "error",
  textarea: "textarea",
  help: "help",
};

describe("FileEditorCard", () => {
  it("keeps file context in action aria labels", () => {
    render(
      <FileEditorCard
        title="AGENTS.md"
        value=""
        refreshLabel="Refresh"
        saveLabel="Save"
        onChange={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
        classNames={classNames}
      />,
    );

    expect(screen.getByRole("button", { name: "Refresh AGENTS.md" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save AGENTS.md" })).toBeTruthy();
  });
});
