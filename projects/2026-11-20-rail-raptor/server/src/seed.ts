import type { Footpath, Stop } from "./raptor.js";

/** Illustrative demo data inspired by UK intercity lines. NOT a real timetable. */
export const SEED_STOPS: Stop[] = [
  { id: "EUS", name: "London Euston", lat: 51.5282, lon: -0.1337 },
  { id: "KGX", name: "London King's Cross", lat: 51.5309, lon: -0.1233 },
  { id: "STP", name: "London St Pancras", lat: 51.5322, lon: -0.1263 },
  { id: "PAD", name: "London Paddington", lat: 51.5154, lon: -0.1755 },
  { id: "MKC", name: "Milton Keynes Central", lat: 52.0345, lon: -0.7745 },
  { id: "BHM", name: "Birmingham New Street", lat: 52.4778, lon: -1.8985 },
  { id: "CRE", name: "Crewe", lat: 53.0889, lon: -2.4328 },
  { id: "MAN", name: "Manchester Piccadilly", lat: 53.4774, lon: -2.2309 },
  { id: "PBO", name: "Peterborough", lat: 52.5747, lon: -0.2503 },
  { id: "DON", name: "Doncaster", lat: 53.5290, lon: -1.1394 },
  { id: "YRK", name: "York", lat: 53.9580, lon: -1.0931 },
  { id: "NCL", name: "Newcastle", lat: 54.9683, lon: -1.6174 },
  { id: "LDS", name: "Leeds", lat: 53.7948, lon: -1.5477 },
  { id: "SHF", name: "Sheffield", lat: 53.3781, lon: -1.4620 },
  { id: "DBY", name: "Derby", lat: 52.9166, lon: -1.4631 },
  { id: "RDG", name: "Reading", lat: 51.4585, lon: -0.9718 },
  { id: "OXF", name: "Oxford", lat: 51.7535, lon: -1.2700 },
  { id: "SWI", name: "Swindon", lat: 51.5657, lon: -1.7858 },
  { id: "BRI", name: "Bristol Temple Meads", lat: 51.4492, lon: -2.5813 },
  { id: "CDF", name: "Cardiff Central", lat: 51.4756, lon: -3.1790 },
];

export interface SeedRoute {
  id: string; name: string; operator: string;
  /** [stopId, minutes after first departure] */
  pattern: [string, number][];
  firstDep: number; lastDep: number; headway: number;
}

const r = (id: string, name: string, operator: string, firstDep: number, lastDep: number, headway: number, pattern: [string, number][]): SeedRoute =>
  ({ id, name, operator, firstDep, lastDep, headway, pattern });

export const SEED_ROUTES: SeedRoute[] = [
  r("wcml-fast", "West Coast Express", "Northern Lines", 6 * 60, 21 * 60, 60, [["EUS", 0], ["MKC", 30], ["CRE", 90], ["MAN", 125]]),
  r("eus-bhm", "Euston - Birmingham", "Midland Rail", 6 * 60 + 15, 22 * 60, 30, [["EUS", 0], ["MKC", 30], ["BHM", 82]]),
  r("bhm-man", "Birmingham - Manchester", "Midland Rail", 6 * 60 + 30, 21 * 60, 60, [["BHM", 0], ["CRE", 45], ["MAN", 80]]),
  r("ecml", "East Coast Express", "Eastern Lines", 6 * 60, 20 * 60, 60, [["KGX", 0], ["PBO", 45], ["DON", 90], ["YRK", 120], ["NCL", 190]]),
  r("kgx-lds", "King's Cross - Leeds", "Eastern Lines", 6 * 60 + 30, 21 * 60 + 30, 60, [["KGX", 0], ["PBO", 45], ["DON", 90], ["LDS", 135]]),
  r("xc", "Cross Country", "Crossland", 6 * 60 + 10, 19 * 60 + 10, 60, [["BHM", 0], ["DBY", 35], ["SHF", 70], ["LDS", 115], ["YRK", 145]]),
  r("man-lds", "Transpennine", "Pennine Rail", 6 * 60, 22 * 60, 30, [["MAN", 0], ["LDS", 50]]),
  r("midland", "Midland Main Line", "Midland Rail", 6 * 60 + 40, 20 * 60 + 40, 60, [["STP", 0], ["DBY", 85], ["SHF", 125]]),
  r("don-shf", "Doncaster - Sheffield", "Pennine Rail", 6 * 60 + 5, 22 * 60, 60, [["DON", 0], ["SHF", 30]]),
  r("gwml", "Great Western", "Western Rail", 6 * 60, 21 * 60, 60, [["PAD", 0], ["RDG", 25], ["SWI", 55], ["BRI", 100], ["CDF", 150]]),
  r("pad-oxf", "Paddington - Oxford", "Western Rail", 6 * 60 + 20, 22 * 60, 60, [["PAD", 0], ["RDG", 25], ["OXF", 55]]),
  r("bri-bhm", "Bristol - Birmingham", "Crossland", 6 * 60 + 45, 20 * 60 + 45, 60, [["BRI", 0], ["BHM", 85]]),
  r("oxf-bhm", "Oxford - Birmingham", "Crossland", 7 * 60, 19 * 60, 120, [["OXF", 0], ["BHM", 70]]),
];

const walk = (a: string, b: string, minutes: number): Footpath[] => [
  { from: a, to: b, minutes }, { from: b, to: a, minutes },
];
export const SEED_FOOTPATHS: Footpath[] = [
  ...walk("KGX", "STP", 4), ...walk("KGX", "EUS", 10), ...walk("STP", "EUS", 8), ...walk("PAD", "EUS", 30),
];
