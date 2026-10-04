// Material 3 Token System for Gitofy

export interface M3ColorScheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;

  background: string;
  onBackground: string;

  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;

  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  outline: string;
  outlineVariant: string;

  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;

  // Semantic diff colors
  diffAdded: string;
  diffAddedContainer: string;
  diffModified: string;
  diffModifiedContainer: string;
  diffDeleted: string;
  diffDeletedContainer: string;
  diffUnchanged: string;
}


/** NXT UI — reference-inspired light palette (lavender / ice / violet / pink). */
export const nxtTheme: M3ColorScheme = {
  primary: '#8B4DE2',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E9D8FF',
  onPrimaryContainer: '#2C0A4A',
  secondary: '#6554B4',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E6DEFF',
  onSecondaryContainer: '#21164A',
  tertiary: '#C95B9D',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFD9EC',
  onTertiaryContainer: '#3A0928',
  error: '#C52A3A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD9',
  onErrorContainer: '#410006',
  background: '#EEEFFC',
  onBackground: '#171827',
  surface: '#F8F9FF',
  onSurface: '#171827',
  surfaceVariant: '#E8E9F6',
  onSurfaceVariant: '#5D6070',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F5F6FD',
  surfaceContainer: '#EEF0F9',
  surfaceContainerHigh: '#E9EAF5',
  surfaceContainerHighest: '#E1E3F0',
  outline: '#8C8E9D',
  outlineVariant: '#D7D8E5',
  inverseSurface: '#2E2F3B',
  inverseOnSurface: '#F2F2FA',
  inversePrimary: '#D5B8FF',
  diffAdded: '#16864A',
  diffAddedContainer: '#D7F6E1',
  diffModified: '#9A6700',
  diffModifiedContainer: '#FFF1C7',
  diffDeleted: '#CF3340',
  diffDeletedContainer: '#FFE8E8',
  diffUnchanged: '#666A78',
};

export const lightThemes: Record<string, M3ColorScheme> = {
  pink: {
    primary: '#9B4062',
    onPrimary: '#ffffff',
    primaryContainer: '#FFD9E2',
    onPrimaryContainer: '#3E001D',

    secondary: '#74565F',
    onSecondary: '#ffffff',
    secondaryContainer: '#FFD9E2',
    onSecondaryContainer: '#2B151C',

    tertiary: '#7C5635',
    onTertiary: '#ffffff',
    tertiaryContainer: '#FFDCC1',
    onTertiaryContainer: '#2E1500',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    background: '#FCF8F8',
    onBackground: '#201A1B',

    surface: '#FCF8F8',
    onSurface: '#201A1B',
    surfaceVariant: '#F2DDE1',
    onSurfaceVariant: '#514347',

    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#F8F2F3',
    surfaceContainer: '#F2ECED',
    surfaceContainerHigh: '#ECE6E7',
    surfaceContainerHighest: '#E6E0E1',

    outline: '#837377',
    outlineVariant: '#D5C2C6',

    inverseSurface: '#362F30',
    inverseOnSurface: '#FAEEEF',
    inversePrimary: '#FFB0C8',

    diffAdded: '#13803f',
    diffAddedContainer: '#d1f4db',
    diffModified: '#9a6700',
    diffModifiedContainer: '#fff3c4',
    diffDeleted: '#cf222e',
    diffDeletedContainer: '#ffebe9',
    diffUnchanged: '#57606a',
  },
  emerald: {
    primary: '#006a60',
    onPrimary: '#ffffff',
    primaryContainer: '#74f8e5',
    onPrimaryContainer: '#00201c',

    secondary: '#4a635f',
    onSecondary: '#ffffff',
    secondaryContainer: '#cce8e2',
    onSecondaryContainer: '#05201c',

    tertiary: '#456179',
    onTertiary: '#ffffff',
    tertiaryContainer: '#cce5ff',
    onTertiaryContainer: '#001e31',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    background: '#f4fbf8',
    onBackground: '#161d1b',

    surface: '#f4fbf8',
    onSurface: '#161d1b',
    surfaceVariant: '#dae5e1',
    onSurfaceVariant: '#3f4946',

    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#eef5f2',
    surfaceContainer: '#e8efec',
    surfaceContainerHigh: '#e2eae6',
    surfaceContainerHighest: '#dce4e0',

    outline: '#6f7976',
    outlineVariant: '#bec9c5',

    inverseSurface: '#2b3230',
    inverseOnSurface: '#ecf2ef',
    inversePrimary: '#53dbc9',

    diffAdded: '#13803f',
    diffAddedContainer: '#d1f4db',
    diffModified: '#9a6700',
    diffModifiedContainer: '#fff3c4',
    diffDeleted: '#cf222e',
    diffDeletedContainer: '#ffebe9',
    diffUnchanged: '#57606a',
  },
  indigo: {
    primary: '#3b5ba9',
    onPrimary: '#ffffff',
    primaryContainer: '#dae2ff',
    onPrimaryContainer: '#001847',

    secondary: '#585e71',
    onSecondary: '#ffffff',
    secondaryContainer: '#dce2f9',
    onSecondaryContainer: '#151b2c',

    tertiary: '#725573',
    onTertiary: '#ffffff',
    tertiaryContainer: '#fcd7fb',
    onTertiaryContainer: '#2a132c',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    background: '#faf8ff',
    onBackground: '#1a1b20',

    surface: '#faf8ff',
    onSurface: '#1a1b20',
    surfaceVariant: '#e1e2ec',
    onSurfaceVariant: '#44474f',

    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f4f3fa',
    surfaceContainer: '#eeedf4',
    surfaceContainerHigh: '#e8e7ef',
    surfaceContainerHighest: '#e2e1e9',

    outline: '#757780',
    outlineVariant: '#c5c6d0',

    inverseSurface: '#2f3036',
    inverseOnSurface: '#f1f0f7',
    inversePrimary: '#b1c5ff',

    diffAdded: '#13803f',
    diffAddedContainer: '#d1f4db',
    diffModified: '#9a6700',
    diffModifiedContainer: '#fff3c4',
    diffDeleted: '#cf222e',
    diffDeletedContainer: '#ffebe9',
    diffUnchanged: '#57606a',
  },
  violet: {
    primary: '#6b4ea2',
    onPrimary: '#ffffff',
    primaryContainer: '#eddcff',
    onPrimaryContainer: '#260058',

    secondary: '#625b71',
    onSecondary: '#ffffff',
    secondaryContainer: '#e8def8',
    onSecondaryContainer: '#1e192b',

    tertiary: '#7d5260',
    onTertiary: '#ffffff',
    tertiaryContainer: '#ffd8e4',
    onTertiaryContainer: '#31111d',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    background: '#fef7ff',
    onBackground: '#1d1a22',

    surface: '#fef7ff',
    onSurface: '#1d1a22',
    surfaceVariant: '#e7e0eb',
    onSurfaceVariant: '#49454e',

    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f8f1fa',
    surfaceContainer: '#f2ebf4',
    surfaceContainerHigh: '#ece5ee',
    surfaceContainerHighest: '#e6dfe8',

    outline: '#7a757f',
    outlineVariant: '#cac4cf',

    inverseSurface: '#322f37',
    inverseOnSurface: '#f5eff7',
    inversePrimary: '#d5baff',

    diffAdded: '#13803f',
    diffAddedContainer: '#d1f4db',
    diffModified: '#9a6700',
    diffModifiedContainer: '#fff3c4',
    diffDeleted: '#cf222e',
    diffDeletedContainer: '#ffebe9',
    diffUnchanged: '#57606a',
  },
  crimson: {
    primary: '#9c2a38',
    onPrimary: '#ffffff',
    primaryContainer: '#ffd9dc',
    onPrimaryContainer: '#40000d',

    secondary: '#755659',
    onSecondary: '#ffffff',
    secondaryContainer: '#ffdadc',
    onSecondaryContainer: '#2c1518',

    tertiary: '#765930',
    onTertiary: '#ffffff',
    tertiaryContainer: '#ffddb6',
    onTertiaryContainer: '#2a1800',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    background: '#fff8f7',
    onBackground: '#221919',

    surface: '#fff8f7',
    onSurface: '#221919',
    surfaceVariant: '#f3ddde',
    onSurfaceVariant: '#524344',

    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#fcf1f1',
    surfaceContainer: '#f6ebeb',
    surfaceContainerHigh: '#f0e5e5',
    surfaceContainerHighest: '#eadeea',

    outline: '#847374',
    outlineVariant: '#d6c2c3',

    inverseSurface: '#382e2f',
    inverseOnSurface: '#faeeee',
    inversePrimary: '#ffb3ba',

    diffAdded: '#13803f',
    diffAddedContainer: '#d1f4db',
    diffModified: '#9a6700',
    diffModifiedContainer: '#fff3c4',
    diffDeleted: '#cf222e',
    diffDeletedContainer: '#ffebe9',
    diffUnchanged: '#57606a',
  },
  cyan: {
    primary: '#00677f',
    onPrimary: '#ffffff',
    primaryContainer: '#b7ecff',
    onPrimaryContainer: '#001f28',

    secondary: '#4c626b',
    onSecondary: '#ffffff',
    secondaryContainer: '#cfe6f1',
    onSecondaryContainer: '#071e26',

    tertiary: '#5b5b7e',
    onTertiary: '#ffffff',
    tertiaryContainer: '#e1e0ff',
    onTertiaryContainer: '#171837',

    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#410002',

    background: '#fbfcfe',
    onBackground: '#191c1d',

    surface: '#fbfcfe',
    onSurface: '#191c1d',
    surfaceVariant: '#dce4e8',
    onSurfaceVariant: '#40484c',

    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f1f4f6',
    surfaceContainer: '#ebf0f2',
    surfaceContainerHigh: '#e5eaec',
    surfaceContainerHighest: '#e0e5e7',

    outline: '#70787c',
    outlineVariant: '#c0c8cc',

    inverseSurface: '#2e3132',
    inverseOnSurface: '#eff1f3',
    inversePrimary: '#5cd5fb',

    diffAdded: '#13803f',
    diffAddedContainer: '#d1f4db',
    diffModified: '#9a6700',
    diffModifiedContainer: '#fff3c4',
    diffDeleted: '#cf222e',
    diffDeletedContainer: '#ffebe9',
    diffUnchanged: '#57606a',
  },
};

export const darkThemes: Record<string, M3ColorScheme> = {
  pink: {
    primary: '#FFB0C8',
    onPrimary: '#5E1133',
    primaryContainer: '#7C294A',
    onPrimaryContainer: '#FFD9E2',

    secondary: '#E2BDC6',
    onSecondary: '#422931',
    secondaryContainer: '#5B3F48',
    onSecondaryContainer: '#FFD9E2',

    tertiary: '#EFBD94',
    onTertiary: '#48290B',
    tertiaryContainer: '#623F1F',
    onTertiaryContainer: '#FFDCC1',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    background: '#181113',
    onBackground: '#EFE0E2',

    surface: '#181113',
    onSurface: '#EFE0E2',
    surfaceVariant: '#514347',
    onSurfaceVariant: '#D5C2C6',

    surfaceContainerLowest: '#120C0E',
    surfaceContainerLow: '#20191B',
    surfaceContainer: '#251D20',
    surfaceContainerHigh: '#2F282A',
    surfaceContainerHighest: '#3A3235',

    outline: '#9E8C90',
    outlineVariant: '#514347',

    inverseSurface: '#EFE0E2',
    inverseOnSurface: '#201A1B',
    inversePrimary: '#9B4062',

    diffAdded: '#3fb950',
    diffAddedContainer: '#0f381c',
    diffModified: '#d29922',
    diffModifiedContainer: '#3d2e00',
    diffDeleted: '#f85149',
    diffDeletedContainer: '#490202',
    diffUnchanged: '#8b949e',
  },
  emerald: {
    primary: '#53dbc9',
    onPrimary: '#003731',
    primaryContainer: '#005048',
    onPrimaryContainer: '#74f8e5',

    secondary: '#b1ccc6',
    onSecondary: '#1c3531',
    secondaryContainer: '#334b47',
    onSecondaryContainer: '#cce8e2',

    tertiary: '#adcae6',
    onTertiary: '#153349',
    tertiaryContainer: '#2d4a60',
    onTertiaryContainer: '#cce5ff',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    background: '#0e1513',
    onBackground: '#dce4e0',

    surface: '#0e1513',
    onSurface: '#dce4e0',
    surfaceVariant: '#3f4946',
    onSurfaceVariant: '#bec9c5',

    surfaceContainerLowest: '#09100e',
    surfaceContainerLow: '#161d1b',
    surfaceContainer: '#1a2120',
    surfaceContainerHigh: '#252c2a',
    surfaceContainerHighest: '#303735',

    outline: '#89938f',
    outlineVariant: '#3f4946',

    inverseSurface: '#dce4e0',
    inverseOnSurface: '#161d1b',
    inversePrimary: '#006a60',

    diffAdded: '#3fb950',
    diffAddedContainer: '#0f381c',
    diffModified: '#d29922',
    diffModifiedContainer: '#3d2e00',
    diffDeleted: '#f85149',
    diffDeletedContainer: '#490202',
    diffUnchanged: '#8b949e',
  },
  indigo: {
    primary: '#b1c5ff',
    onPrimary: '#002c71',
    primaryContainer: '#1f438f',
    onPrimaryContainer: '#dae2ff',

    secondary: '#c0c6dd',
    onSecondary: '#2a3042',
    secondaryContainer: '#404659',
    onSecondaryContainer: '#dce2f9',

    tertiary: '#dfbbde',
    onTertiary: '#412742',
    tertiaryContainer: '#593d5a',
    onTertiaryContainer: '#fcd7fb',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    background: '#121318',
    onBackground: '#e2e1e9',

    surface: '#121318',
    onSurface: '#e2e1e9',
    surfaceVariant: '#44474f',
    onSurfaceVariant: '#c5c6d0',

    surfaceContainerLowest: '#0d0e13',
    surfaceContainerLow: '#1a1b20',
    surfaceContainer: '#1e1f25',
    surfaceContainerHigh: '#292a30',
    surfaceContainerHighest: '#33343b',

    outline: '#8e9099',
    outlineVariant: '#44474f',

    inverseSurface: '#e2e1e9',
    inverseOnSurface: '#1a1b20',
    inversePrimary: '#3b5ba9',

    diffAdded: '#3fb950',
    diffAddedContainer: '#0f381c',
    diffModified: '#d29922',
    diffModifiedContainer: '#3d2e00',
    diffDeleted: '#f85149',
    diffDeletedContainer: '#490202',
    diffUnchanged: '#8b949e',
  },
  violet: {
    primary: '#d5baff',
    onPrimary: '#3b1d70',
    primaryContainer: '#523588',
    onPrimaryContainer: '#eddcff',

    secondary: '#ccc2dc',
    onSecondary: '#332d41',
    secondaryContainer: '#4a4458',
    onSecondaryContainer: '#e8def8',

    tertiary: '#efb8c8',
    onTertiary: '#492532',
    tertiaryContainer: '#633b48',
    onTertiaryContainer: '#ffd8e4',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    background: '#151218',
    onBackground: '#e7e0e8',

    surface: '#151218',
    onSurface: '#e7e0e8',
    surfaceVariant: '#49454e',
    onSurfaceVariant: '#cac4cf',

    surfaceContainerLowest: '#0f0d13',
    surfaceContainerLow: '#1d1a20',
    surfaceContainer: '#211e24',
    surfaceContainerHigh: '#2c292f',
    surfaceContainerHighest: '#37333a',

    outline: '#948f99',
    outlineVariant: '#49454e',

    inverseSurface: '#e7e0e8',
    inverseOnSurface: '#1d1a22',
    inversePrimary: '#6b4ea2',

    diffAdded: '#3fb950',
    diffAddedContainer: '#0f381c',
    diffModified: '#d29922',
    diffModifiedContainer: '#3d2e00',
    diffDeleted: '#f85149',
    diffDeletedContainer: '#490202',
    diffUnchanged: '#8b949e',
  },
  crimson: {
    primary: '#ffb3ba',
    onPrimary: '#5f1223',
    primaryContainer: '#7d1e2d',
    onPrimaryContainer: '#ffd9dc',

    secondary: '#e5bdc0',
    onSecondary: '#42292c',
    secondaryContainer: '#5b3f42',
    onSecondaryContainer: '#ffdadc',

    tertiary: '#e6bf90',
    onTertiary: '#422c08',
    tertiaryContainer: '#5c421b',
    onTertiaryContainer: '#ffddb6',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    background: '#1a1112',
    onBackground: '#f0dedf',

    surface: '#1a1112',
    onSurface: '#f0dedf',
    surfaceVariant: '#524344',
    onSurfaceVariant: '#d6c2c3',

    surfaceContainerLowest: '#140c0d',
    surfaceContainerLow: '#22191a',
    surfaceContainer: '#271d1e',
    surfaceContainerHigh: '#322728',
    surfaceContainerHighest: '#3d3233',

    outline: '#9f8c8d',
    outlineVariant: '#524344',

    inverseSurface: '#f0dedf',
    inverseOnSurface: '#221919',
    inversePrimary: '#9c2a38',

    diffAdded: '#3fb950',
    diffAddedContainer: '#0f381c',
    diffModified: '#d29922',
    diffModifiedContainer: '#3d2e00',
    diffDeleted: '#f85149',
    diffDeletedContainer: '#490202',
    diffUnchanged: '#8b949e',
  },
  cyan: {
    primary: '#5cd5fb',
    onPrimary: '#003543',
    primaryContainer: '#004e60',
    onPrimaryContainer: '#b7ecff',

    secondary: '#b3cad5',
    onSecondary: '#1e333c',
    secondaryContainer: '#354a53',
    onSecondaryContainer: '#cfe6f1',

    tertiary: '#c4c3ea',
    onTertiary: '#2d2d4d',
    tertiaryContainer: '#434365',
    onTertiaryContainer: '#e1e0ff',

    error: '#ffb4ab',
    onError: '#690005',
    errorContainer: '#93000a',
    onErrorContainer: '#ffdad6',

    background: '#101416',
    onBackground: '#e0e3e5',

    surface: '#101416',
    onSurface: '#e0e3e5',
    surfaceVariant: '#40484c',
    onSurfaceVariant: '#c0c8cc',

    surfaceContainerLowest: '#0b0f11',
    surfaceContainerLow: '#181d1f',
    surfaceContainer: '#1c2123',
    surfaceContainerHigh: '#272b2d',
    surfaceContainerHighest: '#313638',

    outline: '#8a9296',
    outlineVariant: '#40484c',

    inverseSurface: '#e0e3e5',
    inverseOnSurface: '#191c1d',
    inversePrimary: '#00677f',

    diffAdded: '#3fb950',
    diffAddedContainer: '#0f381c',
    diffModified: '#d29922',
    diffModifiedContainer: '#3d2e00',
    diffDeleted: '#f85149',
    diffDeletedContainer: '#490202',
    diffUnchanged: '#8b949e',
  },
};

export interface GitofySettings {
  // Theme & Appearance
  /** NXT is the new default visual system; Light exposes the M3 palette controls. */
  uiMode: 'nxt' | 'light';
  themeMode: 'light' | 'dark' | 'system';
  palette: 'pink' | 'emerald' | 'indigo' | 'violet' | 'crimson' | 'cyan';
  fontScale: number;
  cornerRadius: number;
  uiDensity: 'compact' | 'normal' | 'relaxed';
  
  // Navigation & FAB
  autoHideNav: boolean;
  navBounce: boolean;
  fabPosition: 'right' | 'center';
  scrollThreshold: number;

  // Git & Upload
  autoInitReadme: boolean;
  defaultBranch: string;
  defaultVisibility: 'private' | 'public';
  stripRootFolder: boolean;
  autoTriggerWorkflows: boolean;
  deleteRemoteOnly: boolean;
  maxConcurrentUploads: number;

  // Language & Accessibility
  language: 'en' | 'bn';
  reduceMotion: boolean;
  haptics: boolean;
  confirmDestructive: boolean;

  // Live GitHub Actions
  liveRunsPolling: 'battery' | 'balanced' | 'max';
  liveRunsLogFontSize: number;
  liveRunsWrap: boolean;
  liveRunsTimestamps: boolean;
  liveRunsAutoFollow: boolean;
  liveRunsDebugLines: boolean;
  liveRunsCacheDays: number;
  instantMode: boolean;
  
  // Auth
  personalAccessToken: string;
  githubUsername: string;
  avatarUrl: string;
  isDemoMode: boolean;

  // Auth & security (PRD v2.0 §7.6, §12)
  appLockMode: 'off' | 'always' | '1m' | '5m';
  flagSecure: boolean;
  enableWebFlow: boolean;
  diagnosticsOptIn: boolean;
}

export const defaultSettings: GitofySettings = {
  uiMode: 'nxt',
  themeMode: 'light',
  palette: 'pink',
  fontScale: 1.0,
  cornerRadius: 16,
  uiDensity: 'normal',

  autoHideNav: true,
  navBounce: true,
  fabPosition: 'right',
  scrollThreshold: 20,

  autoInitReadme: true,
  defaultBranch: 'main',
  defaultVisibility: 'private',
  stripRootFolder: true,
  autoTriggerWorkflows: false,
  deleteRemoteOnly: false,
  maxConcurrentUploads: 4,

  language: 'en', // Default English as requested!
  reduceMotion: false,
  haptics: true,
  confirmDestructive: true,

  liveRunsPolling: 'balanced',
  liveRunsLogFontSize: 11,
  liveRunsWrap: false,
  liveRunsTimestamps: false,
  liveRunsAutoFollow: true,
  liveRunsDebugLines: false,
  liveRunsCacheDays: 7,
  instantMode: false,

  personalAccessToken: '',
  githubUsername: '',
  avatarUrl: '',
  isDemoMode: false,

  appLockMode: 'off',
  flagSecure: false,
  enableWebFlow: false,
  diagnosticsOptIn: true,
};
