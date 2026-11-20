import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { previewExistingLibrary, type ExistingLibraryPreview } from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

/** A separate read-only action: changing the current repository still uses its existing flow. */
export function LibraryPreviewPanel() {
  const { t } = useTranslation();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExistingLibraryPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  const inspect = async () => {
    const selected = path.trim();
    if (!selected || busy) return;
    const request = ++generation.current;
    setBusy(true); setResult(null); setError(null);
    try {
      const preview = await previewExistingLibrary(selected);
      if (request === generation.current) setResult(preview);
    } catch (error) {
      if (request === generation.current) setError(getErrorMessage(error, t("libraryPreview.failed")));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const choose = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setPath(selected); setResult(null); setError(null);
      }
    } catch (error) { setError(getErrorMessage(error, t("libraryPreview.failed"))); }
  };
  return (
    <div className="px-5 py-4">
      <h3 className="text-[14px] font-semibold text-primary">{t("libraryPreview.title")}</h3>
      <p className="mt-0.5 text-[12px] text-muted">{t("libraryPreview.description")}</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void inspect(); }}>
        <label className="min-w-0 flex-1 text-[12px] text-secondary">
          {t("libraryPreview.folder")}
          <input value={path} disabled={busy} onChange={(e) => { setPath(e.target.value); setResult(null); setError(null); }}
            className="mt-1 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-[13px] text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void choose()}
          className="rounded-lg border border-border-subtle px-3 py-2 text-[12px] text-secondary disabled:opacity-50">
          {t("settings.selectFolder")}
        </button>
        <button type="submit" disabled={busy || !path.trim()}
          className="rounded-lg border border-accent-border bg-accent-bg px-3 py-2 text-[12px] text-accent disabled:opacity-50">
          {t(busy ? "libraryPreview.loading" : "libraryPreview.inspect")}
        </button>
      </form>
      <div aria-live="polite" aria-busy={busy} className="mt-2 text-[12px] text-secondary">
        {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
        {result && <>
          <p>{t("libraryPreview.summary", { skills: result.skill_count, connections: result.connection_count })}</p>
          <p className="mt-1 break-all font-mono text-muted">{result.skills_path}</p>
          <p className="mt-1 text-muted">{t("libraryPreview.connectionScope")}</p>
          {result.unreadable_paths.length > 0 && <p role="alert" className="mt-1 text-amber-600 dark:text-amber-400">
            {t("libraryPreview.incomplete", { count: result.unreadable_paths.length })}
          </p>}
          <details className="mt-2">
            <summary className="cursor-pointer">{t("libraryPreview.details")}</summary>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
              {result.skills.map((skill) => <li key={skill.central_path}>
                <p className="break-words font-medium">{skill.name} · {t("libraryPreview.links", { count: skill.connections.length })}</p>
                <p className="break-all font-mono text-muted">{skill.central_path}</p>
                {skill.connections.map((connection) => <p key={connection} className="break-all font-mono text-muted">↳ {connection}</p>)}
              </li>)}
            </ul>
          </details>
          {(result.excluded_paths.length > 0 || result.unreadable_paths.length > 0) && <details className="mt-2">
            <summary className="cursor-pointer">{t("libraryPreview.exclusions")}</summary>
            <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-muted">
              {[...new Set([...result.excluded_paths, ...result.unreadable_paths])].map((entry) => <li key={entry} className="break-all">{entry}</li>)}
            </ul>
          </details>}
        </>}
      </div>
    </div>
  );
}
