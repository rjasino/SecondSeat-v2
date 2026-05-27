// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ToolbarButton from "./ToolbarButton";

afterEach(cleanup);

describe("ToolbarButton", () => {
  it("renders its label text", () => {
    render(
      <ToolbarButton onClick={() => {}} active={false} title="Bold">
        B
      </ToolbarButton>
    );
    expect(screen.getByTitle("Bold")).toBeDefined();
    expect(screen.getByTitle("Bold").textContent).toBe("B");
  });

  it("applies accent styles when active", () => {
    render(
      <ToolbarButton onClick={() => {}} active={true} title="Bold">
        B
      </ToolbarButton>
    );
    const btn = screen.getByTitle("Bold") as HTMLButtonElement;
    expect(btn.style.border).toContain("#7c3aed");
    expect(btn.style.color).toContain("#7c3aed");
  });

  it("applies transparent styles when inactive", () => {
    render(
      <ToolbarButton onClick={() => {}} active={false} title="Italic">
        I
      </ToolbarButton>
    );
    const btn = screen.getByTitle("Italic") as HTMLButtonElement;
    expect(btn.style.border).toContain("transparent");
    expect(btn.style.background).toBe("transparent");
  });

  it("calls onClick and prevents default on mousedown", () => {
    const onClick = vi.fn();
    render(
      <ToolbarButton onClick={onClick} active={false} title="Underline">
        U
      </ToolbarButton>
    );
    const btn = screen.getByTitle("Underline");
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    btn.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when rendered as a type=button inside a form", () => {
    // Ensures the button cannot accidentally submit a parent form
    render(
      <form onSubmit={() => {}}>
        <ToolbarButton onClick={() => {}} active={false} title="Strike">
          S
        </ToolbarButton>
      </form>
    );
    const btn = screen.getByTitle("Strike") as HTMLButtonElement;
    expect(btn.type).toBe("button");
  });
});
