import { createContext, useContext, useState, type ReactNode } from "react";

// Feature flags for the UI. `showUpcomingModules` decides whether features from later
// releases (Modules 3 & 4, see Release in navigation.ts) are usable or shown as
// "Coming soon". It is switched from the demo controls during client presentations.
const STORAGE_KEY = "tamu-show-upcoming-modules";

interface FeatureFlags {
  showUpcomingModules: boolean;
  setShowUpcomingModules: (enabled: boolean) => void;
}

const FeatureFlagsContext = createContext<FeatureFlags>({
  showUpcomingModules: false,
  setShowUpcomingModules: () => {},
});

function readStoredFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [showUpcomingModules, setFlag] = useState(readStoredFlag);

  const setShowUpcomingModules = (enabled: boolean) => {
    setFlag(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // Storage blocked: the setting lasts for this visit only.
    }
  };

  return (
    <FeatureFlagsContext.Provider value={{ showUpcomingModules, setShowUpcomingModules }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export const useFeatureFlags = () => useContext(FeatureFlagsContext);
