import { iconNames, colorNames } from "./model.ts";
import type { Preferences } from "./model.ts";
export function iconDescriptor(
  mode: Preferences["iconMode"],
  institution: string,
  category: { icon?: string | null; color?: string | null } | null,
  availableLogos: readonly string[],
  assetFailed = false,
) {
  if (mode === "institution")
    return availableLogos.includes(institution.toLowerCase()) && !assetFailed
      ? { type: "logo" as const, key: institution.toLowerCase() }
      : {
          type: "initials" as const,
          text:
            institution
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase() || "?",
        };
  return {
    type: "category" as const,
    icon: iconNames.find((i) => i === category?.icon) ?? "other",
    color: colorNames.find((c) => c === category?.color) ?? "slate",
  };
}
