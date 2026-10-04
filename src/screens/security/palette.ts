/**
 * Fixed Material 3 palettes taken from the supplied reference screens so the
 * security sheets match their look exactly (independent of the app's theme).
 */
export const M3Dark = {
  surface: '#141218',
  surfaceContainer: '#211F26',
  surfaceContainerHigh: '#2B2930',
  surfaceVariant: '#49454F',
  onSurface: '#E6E1E9',
  onSurfaceVariant: '#CAC4D0',
  primary: '#D0BCFF',
  onPrimary: '#381E72',
  outline: '#938F99',
} as const;

export const M3Danger = {
  danger: '#FFB4AB',
  dangerDeep: '#FF5449',
  dangerContainer: '#93000A',
  onDangerContainer: '#FFDAD6',
} as const;

/** The reference primary-button fill (used by both screens). */
export const PRIMARY_BTN_BG = 'linear-gradient(180deg, #E4D6FF 0%, #B69DF8 100%)';
export const PRIMARY_BTN_FG = '#1C1B1F';
