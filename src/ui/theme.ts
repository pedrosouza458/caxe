export const themes = {
  dark: {
    mode: "dark",
    bg: "#090D0B",
    surface: "#151B17",
    surface2: "#1D2620",
    border: "#303C33",
    text: "#F4F7F1",
    muted: "#9BAA9C",
    lime: "#CDFF57",
    limeText: "#CDFF57",
    limeDark: "#2A4222",
    coral: "#FF7770",
    onAccent: "#090D0B",
  },
  light: {
    mode: "light",
    bg: "#F7F9F4",
    surface: "#FFFFFF",
    surface2: "#EAF0E7",
    border: "#DAE2D9",
    text: "#1B2B22",
    muted: "#58685C",
    lime: "#CDFF57",
    limeText: "#45621B",
    limeDark: "#E5F1CC",
    coral: "#B53939",
    onAccent: "#101E15",
  },
} as const;
export type Theme = typeof themes.dark | typeof themes.light;
const palette = {
  lime: ["#CDFF57", "#45621B"],
  coral: ["#FF9992", "#AD3336"],
  blue: ["#91BDEF", "#2E6098"],
  lilac: ["#C2ACEC", "#6C459D"],
  sand: ["#E2C48F", "#775916"],
  mint: ["#8BD6B1", "#246947"],
  rose: ["#EBA9CD", "#8B416B"],
  slate: ["#B3C6CB", "#466169"],
  orange: ["#E0A168", "#954E17"],
  teal: ["#88CEDD", "#237184"],
  olive: ["#C6CC91", "#6A711E"],
  plum: ["#CCAED0", "#7B517F"],
};
export function categoryColor(name: string | null | undefined, theme: Theme) {
  return (palette[name as keyof typeof palette] ?? palette.slate)[
    theme.mode === "dark" ? 0 : 1
  ];
}
