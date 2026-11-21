// Matchbox-print palette. Ink and buff paper carry hierarchy; honey is
// reserved for live fire and delivered light.
export const C = {
  ink: '#182638',
  inkDeep: '#0d1724',
  inkSoft: '#22364d',
  petrol: '#355568',
  petrolDeep: '#26404f',
  teal: '#79A69D',
  tealDeep: '#5a877f',
  paper: '#F3DEAE',
  paperShade: '#dcc28c',
  paperDeep: '#b89a63',
  vermilion: '#D85D44',
  vermilionDeep: '#a9412f',
  honey: '#FFD16C',
  honeyHot: '#fff1c4',
  brass: '#c9a457',
  brassDeep: '#8a6d33',
  brassGlint: '#fff3cf',
  rubber: '#1d2330',
  wood: '#4a3a33',
  woodDeep: '#33282a',
  blue: '#3e7bd6',
  chalk: '#f6f0e2',
} as const;

export const FONT_STAMP = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const FONT_TEXT = '"Source Sans 3", "Segoe UI", sans-serif';

/** Shared text sizes (logical px). */
export const TYPE = {
  hint: 18,
  body: 16,
  count: 14,
  tag: 15,
  stamp: 22,
  title: 30,
} as const;

/** Shared edge inset (logical px). */
export const INSET = 18;
