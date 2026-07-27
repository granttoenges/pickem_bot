export type ThemePreference = "system" | "light" | "dark";

export const themeStorageKey = "pickem.theme";

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  const stored = window.localStorage.getItem(themeStorageKey);
  return isThemePreference(stored) ? stored : "system";
}

export function storeThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(themeStorageKey, preference);
  applyThemePreference(preference);
}

export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }
  const prefersDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", preference === "dark" || (preference === "system" && prefersDark));
}

export function watchSystemTheme(preference: ThemePreference, onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    if (preference === "system") {
      applyThemePreference("system");
      onChange();
    }
  };
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}
