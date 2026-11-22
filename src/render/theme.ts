// One look per route: each room of the house has its own sky, wall, and desk.
export interface Theme {
  name: string;
  skyTop: string;
  skyMid: string;
  skyLow: string;
  skyGlow: string;
  /** Far wall and its lit cells. */
  wall: string;
  wallLit: string;
  wallDark: string;
  /** Mid-layer silhouettes. */
  far: string;
  haze: string;
  /** Desk: deep body, face band, stripes, and the paper top. */
  body: string;
  face: string;
  stripe: string;
  top: string;
  /** Far-wall pattern. */
  backdrop: 'pigeonholes' | 'cabinets' | 'maps' | 'rafters';
  /** Desk face pattern. */
  facePattern: 'stripes' | 'baize' | 'contours' | 'planks';
  moon: boolean;
}

export const THEMES: Theme[] = [
  {
    name: 'The Writing Desk',
    skyTop: '#151a4a',
    skyMid: '#2c2f7a',
    skyLow: '#6a3f8f',
    skyGlow: '#d4688a',
    wall: '#252a66',
    wallLit: '#2e347a',
    wallDark: '#1d2156',
    far: '#3b2f78',
    haze: '106,63,143',
    body: '#a9503a',
    face: '#ef9a5b',
    stripe: '#d9773f',
    top: '#fff1cf',
    backdrop: 'pigeonholes',
    facePattern: 'stripes',
    moon: true,
  },
  {
    name: 'The Sorting Room',
    skyTop: '#0f2a2c',
    skyMid: '#164246',
    skyLow: '#2c6658',
    skyGlow: '#c9a25a',
    wall: '#1b3d3b',
    wallLit: '#235049',
    wallDark: '#122c2a',
    far: '#24544c',
    haze: '44,102,88',
    body: '#1f5e3f',
    face: '#3f9a5e',
    stripe: '#2f7f4a',
    top: '#f6e7c4',
    backdrop: 'cabinets',
    facePattern: 'baize',
    moon: false,
  },
  {
    name: 'The Map Table',
    skyTop: '#101a3d',
    skyMid: '#1c3270',
    skyLow: '#2f5aa0',
    skyGlow: '#7fc4d8',
    wall: '#1b2a5c',
    wallLit: '#23386f',
    wallDark: '#14204a',
    far: '#26407c',
    haze: '47,90,160',
    body: '#2a4f9a',
    face: '#5a8fd6',
    stripe: '#3f74bf',
    top: '#f3ead2',
    backdrop: 'maps',
    facePattern: 'contours',
    moon: true,
  },
  {
    name: 'The Attic',
    skyTop: '#1a1030',
    skyMid: '#33204f',
    skyLow: '#5a3a6e',
    skyGlow: '#e0a0b8',
    wall: '#2e1f45',
    wallLit: '#3a2858',
    wallDark: '#24183a',
    far: '#46305e',
    haze: '90,58,110',
    body: '#5d3b56',
    face: '#9a6a8a',
    stripe: '#7f5372',
    top: '#efe0e8',
    backdrop: 'rafters',
    facePattern: 'planks',
    moon: true,
  },
];

export function themeFor(i: number): Theme {
  return THEMES[((i % THEMES.length) + THEMES.length) % THEMES.length];
}
