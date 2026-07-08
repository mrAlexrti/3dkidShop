// Реестр шрифтовых тем. Все семейства поддерживают украинскую кириллицу (Google Fonts).
// Активная тема хранится в SiteContent['site_font'] и выбирается в админке.
// Загружается динамически через <link> в корневом layout (см. app/layout.tsx),
// поэтому грузится только выбранная тема, а не все сразу.

export type FontThemeId =
  | "fredoka-nunito"
  | "comfortaa-rubik"
  | "unbounded-manrope"
  | "rubik"
  | "onest";

export type FontTheme = {
  label: string;
  // query-часть для https://fonts.googleapis.com/css2?<google>&display=swap
  google: string;
  display: string; // CSS font stack для заголовков (font-display)
  body: string; // CSS font stack для основного текста (font-sans)
};

export const FONT_THEMES: Record<FontThemeId, FontTheme> = {
  "fredoka-nunito": {
    label: "Fredoka + Nunito",
    google: "family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800",
    display: "'Fredoka', 'Nunito', system-ui, sans-serif",
    body: "'Nunito', system-ui, sans-serif",
  },
  "comfortaa-rubik": {
    label: "Comfortaa + Rubik",
    google: "family=Comfortaa:wght@400;500;600;700&family=Rubik:wght@400;500;600;700",
    display: "'Comfortaa', 'Rubik', system-ui, sans-serif",
    body: "'Rubik', system-ui, sans-serif",
  },
  "unbounded-manrope": {
    label: "Unbounded + Manrope",
    google: "family=Unbounded:wght@400;600;700;800&family=Manrope:wght@400;500;600;700",
    display: "'Unbounded', 'Manrope', system-ui, sans-serif",
    body: "'Manrope', system-ui, sans-serif",
  },
  rubik: {
    label: "Rubik",
    google: "family=Rubik:wght@400;500;600;700;800",
    display: "'Rubik', system-ui, sans-serif",
    body: "'Rubik', system-ui, sans-serif",
  },
  onest: {
    label: "Onest",
    google: "family=Onest:wght@400;500;600;700;800",
    display: "'Onest', system-ui, sans-serif",
    body: "'Onest', system-ui, sans-serif",
  },
};

export const DEFAULT_FONT_THEME: FontThemeId = "fredoka-nunito";

export function isFontThemeId(value: string | null | undefined): value is FontThemeId {
  return !!value && value in FONT_THEMES;
}

export function resolveFontTheme(value: string | null | undefined): FontThemeId {
  return isFontThemeId(value) ? value : DEFAULT_FONT_THEME;
}

export function googleFontsHref(themeId: FontThemeId): string {
  return `https://fonts.googleapis.com/css2?${FONT_THEMES[themeId].google}&display=swap`;
}
