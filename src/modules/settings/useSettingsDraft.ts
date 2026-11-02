import { useEffect, useState } from "react";
import { useSaveSettings, useSystemSettings } from "../../api/settings";
import type { SettingsSection, SystemSettings } from "../../api/types";

/**
 * A settings section's form: a copy of the saved values to edit, whether anything changed, and saving.
 * Leaving with unsaved changes asks first (the browser's own prompt on reload or close).
 */
export function useSettingsDraft<S extends SettingsSection>(section: S) {
  const { data, isPending, isError, refetch } = useSystemSettings();
  const save = useSaveSettings(section);
  const saved = data?.[section] ?? null;
  const [draft, setDraft] = useState<SystemSettings[S] | null>(null);
  const current = draft ?? saved;
  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof SystemSettings[S]>(key: K, value: SystemSettings[S][K]) => setDraft((before) => ({ ...(before ?? saved!), [key]: value }));
  return {
    values: current,
    set,
    replace: (values: SystemSettings[S]) => setDraft(values),
    dirty,
    discard: () => {
      save.reset();
      setDraft(null);
    },
    save,
    changed: data?.changed[section] ?? null,
    isPending,
    isError,
    refetch,
    onSaved: () => setDraft(null),
  };
}

