// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryPreviewPanel } from "./LibraryPreviewPanel";
import { cleanup, mount } from "../test-utils/mount";
import { previewExistingLibrary } from "../lib/tauri";
import { open } from "@tauri-apps/plugin-dialog";

vi.mock("../lib/tauri", () => ({ previewExistingLibrary: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: Record<string, unknown>) => key === "libraryPreview.summary"
    ? `${options?.skills} entities / ${options?.connections} links` : key,
}) }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const preview = { root_path: "/library", skills_path: "/library/skills", skill_count: 1, connection_count: 2,
  skills: [{ name: "example", central_path: "/library/skills/example", connections: ["/client-a/example", "/client-b/example"] }],
  excluded_paths: [] as string[], unreadable_paths: [] as string[],
};
async function select(node: HTMLElement) {
  vi.mocked(open).mockResolvedValue("/library");
  await act(async () => { node.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
}
async function submit(node: HTMLElement) {
  await act(async () => { node.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
describe("existing library preview", () => {
  it("does not scan before a non-empty path is chosen", async () => {
    const node = mount(<LibraryPreviewPanel />);
    expect(node.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await submit(node);
    expect(previewExistingLibrary).not.toHaveBeenCalled();
  });
  it("separates entity and connection counts and shows the actual paths", async () => {
    vi.mocked(previewExistingLibrary).mockResolvedValue(preview);
    const node = mount(<LibraryPreviewPanel />);await select(node);await submit(node);
    expect(previewExistingLibrary).toHaveBeenCalledExactlyOnceWith("/library");
    expect(node.textContent).toContain("1 entities / 2 links");
    expect(node.textContent).toContain("/client-b/example");
    expect(node.querySelectorAll('input')).toHaveLength(1);
  });
  it("keeps a cancelled folder selection from starting a scan", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const node = mount(<LibraryPreviewPanel />);
    await act(async () => { node.querySelector<HTMLButtonElement>('button[type="button"]')!.click(); });
    expect(previewExistingLibrary).not.toHaveBeenCalled();
  });
  it("shows backend failure and allows retry without stale success", async () => {
    vi.mocked(previewExistingLibrary).mockRejectedValueOnce(new Error("Folder not readable"));
    const node = mount(<LibraryPreviewPanel />);await select(node);await submit(node);
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("Folder not readable");
    vi.mocked(previewExistingLibrary).mockResolvedValue(preview);await submit(node);
    expect(node.querySelector('[role="alert"]')).toBeNull();
    expect(node.textContent).toContain("1 entities / 2 links");
  });
  it("disables another scan while a request is pending and reports partial scans", async () => {
    let finish!: (value: typeof preview) => void;
    vi.mocked(previewExistingLibrary).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const node = mount(<LibraryPreviewPanel />);await select(node);await submit(node);
    expect(node.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await submit(node);expect(previewExistingLibrary).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ...preview, unreadable_paths: ["/broken"] }));
    expect(node.querySelector('[role="alert"]')?.textContent).toContain("libraryPreview.incomplete");
    expect(node.textContent).toContain("/broken");
  });
});
