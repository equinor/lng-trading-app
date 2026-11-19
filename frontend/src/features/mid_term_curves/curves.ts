import type { CurvePrices } from "@/features/mid_term_curves/api"

type NumericKey = Exclude<keyof CurvePrices, "start_date">
type CurveValue = (row: CurvePrices) => number | null

export type Curve = {
  id: string
  label: string
  /** How the curve is produced, shown as a tooltip. */
  formula: string
  color: string
  value: CurveValue
  /** Shown as whole dollars instead of a price. */
  currency?: boolean
}

export type SectionId =
  | "ice"
  | "epa"
  | "epa-oil"
  | "oil-switching"
  | "custom"
  | "chartering"
  | "freight"
  | "arbitrage"

export type CurveSection = { id: SectionId; label: string; curves: Curve[] }

const NOT_PROVIDED = "Blank; value not provided yet."

// [price field, label, formula]
type Column = readonly [NumericKey, string, string]

function fromColumns(
  columns: readonly Column[],
  colors: readonly string[],
  idOf: (key: NumericKey) => string = (key) => key,
): Curve[] {
  return columns.map(([key, label, formula], index) => ({
    id: idOf(key),
    label,
    formula,
    color: colors[index % colors.length],
    value: (row) => row[key],
  }))
}

const difference =
  (first: NumericKey, second: NumericKey): CurveValue =>
  (row) =>
    row[first] !== null && row[second] !== null
      ? (row[first] as number) - (row[second] as number)
      : null

const ICE_COLUMNS: Column[] = [
  ["jkm", "JKM [ICE]", "Source price for the JKM ICE curve."],
  ["ttf", "TTF [ICE]", "Source price for the TTF ICE curve."],
  ["hh", "HH [ICE]", "Source price for the HH ICE curve."],
  ["brent", "BRENT [ICE]", "Source price for the Brent ICE curve."],
]
const EPA_COLUMNS: Column[] = [
  [
    "epa_jkm",
    "JKM [EPA]",
    "Quarterly EPA Asia LNG price, repeated for each month.",
  ],
  ["epa_ttf", "TTF [EPA]", "Quarterly EPA TTF price, repeated for each month."],
  [
    "epa_hh",
    "HH [EPA]",
    "Quarterly EPA US Henry Hub price, repeated for each month.",
  ],
  [
    "epa_nbp",
    "NBP [EPA]",
    "Quarterly EPA UK NBP price, repeated for each month.",
  ],
]
const EPA_OIL_COLUMNS: Column[] = [
  ["epa_brent_base", "Brent [EPA] Base", "EPA Brent base case, USD nominal."],
  ["epa_brent_high", "Brent [EPA] High", "EPA Brent high case, USD nominal."],
  ["epa_brent_low", "Brent [EPA] Low", "EPA Brent low case, USD nominal."],
]
const OIL_SWITCHING_COLUMNS: Column[] = [
  ["crude_17_2", "17.2% Crude", "Brent [EPA] Base * 17.2%."],
  ["crude_15_5", "15.5% Crude", "Brent [EPA] Base * 15.5%."],
  ["crude_14", "14% Crude", "Brent [EPA] Base * 14%."],
  ["crude_12_5", "12.5% Crude", "Brent [EPA] Base * 12.5%."],
  ["crude_10", "10% Crude", "Brent [EPA] Base * 10%."],
]
const GAS_SWITCHING_COLUMNS: Column[] = [
  [
    "euro_coalswitching",
    "Euro Coal Switching",
    "Blank; no formula has been provided.",
  ],
  [
    "china_central_asia",
    "China Central Asia",
    "(6.7% * Brent [EPA] Base) + 1.96",
  ],
  [
    "china_power_of_siberia",
    "China Power Of Siberia",
    "(3.15 / 36.6) * Brent [EPA] Base",
  ],
  [
    "woodmac_asia_mid_term",
    "Woodmac Asia Mid-term",
    "12.5% * Brent [EPA] Base",
  ],
  [
    "us_marginal_des_asia_100",
    "US Marginal (DES Asia: 100%)",
    "115% * HH [EPA] + US -> JKTC (100% contribution)",
  ],
  [
    "us_marginal_des_asia_50",
    "US Marginal (DES Asia: 50%)",
    "115% * HH [EPA] + US -> JKTC (50% contribution)",
  ],
  [
    "us_marginal_des_asia_sunk",
    "US Marginal (DES Asia: Sunk)",
    "115% * HH [EPA] + US -> JKTC (0% contribution)",
  ],
]

// Voyage days per route; the backend applies the same numbers.
const FREIGHT_ROUTES = [
  { key: "us_to_jktc", label: "US -> JKTC", days: 88 },
  { key: "us_to_nwe", label: "US -> NWE", days: 32 },
  { key: "me_to_jktc", label: "ME -> JKTC", days: 40 },
  { key: "me_to_nwe", label: "ME -> NWE", days: 38 },
] as const
const FREIGHT_COLUMNS: Column[] = FREIGHT_ROUTES.flatMap(
  ({ key, label, days }) => {
    const hire = `${days} * $85,000 / 3,800,000`
    const fuel = `${days} * HH [EPA] * 0.09% * 1.15`
    return [
      [`${key}_100`, `${label} (100% contribution)`, `(${hire}) + (${fuel})`],
      [
        `${key}_50`,
        `${label} (50% contribution)`,
        `50% * (${hire}) + (${fuel})`,
      ],
      [`${key}_0`, `${label} (0% contribution)`, fuel],
    ] as const satisfies readonly Column[]
  },
)

const SPARK_LABELS = ["Atlantic (Spark)", "Pacific (Spark)"]

/** Sections in the order they are offered for selection. */
export const CURVE_SECTIONS: CurveSection[] = [
  {
    id: "ice",
    label: "ICE curves",
    curves: fromColumns(
      ICE_COLUMNS,
      ["#007079", "#00a3e0", "#e4002b", "#ffb81c"],
      (key) => `ice_${key}`,
    ),
  },
  {
    id: "epa",
    label: "EPA gas curves",
    curves: fromColumns(EPA_COLUMNS, [
      "#005b8f",
      "#00a3e0",
      "#e4002b",
      "#ffb81c",
    ]),
  },
  {
    id: "epa-oil",
    label: "EPA oil curves",
    curves: fromColumns(EPA_OIL_COLUMNS, ["#005b8f", "#e4002b", "#00a3e0"]),
  },
  {
    id: "oil-switching",
    label: "Oil switching",
    curves: fromColumns(OIL_SWITCHING_COLUMNS, [
      "#007079",
      "#00a3e0",
      "#e4002b",
      "#ffb81c",
      "#005b8f",
    ]),
  },
  {
    id: "custom",
    label: "Gas switching",
    curves: fromColumns(GAS_SWITCHING_COLUMNS, [
      "#007079",
      "#00a3e0",
      "#e4002b",
      "#ffb81c",
      "#005b8f",
      "#7b61a8",
      "#667085",
    ]),
  },
  {
    id: "chartering",
    label: "Chartering",
    curves: [
      {
        id: "spot_chartering_gea",
        label: "Long run marginal cost",
        formula: "Fixed input: $86,000.",
        color: "#007079",
        value: (row) => row.spot_chartering_gea,
        currency: true,
      },
      ...SPARK_LABELS.map((label, index) => ({
        id: `spark_${index}`,
        label,
        formula: NOT_PROVIDED,
        color: index === 0 ? "#00a3e0" : "#e4002b",
        value: () => null,
      })),
    ],
  },
  {
    id: "freight",
    label: "Freight",
    curves: fromColumns(FREIGHT_COLUMNS, [
      "#007079",
      "#00a3e0",
      "#e4002b",
      "#ffb81c",
      "#005b8f",
      "#7b61a8",
    ]),
  },
  {
    id: "arbitrage",
    label: "JKM vs. NWE Des.",
    curves: [
      {
        id: "arbitrage_0",
        label: "Arb Open",
        formula:
          "US -> JKTC (100% contribution) - US -> NWE (100% contribution)",
        color: "#007079",
        value: difference("us_to_jktc_100", "us_to_nwe_100"),
      },
      {
        id: "arbitrage_1",
        label: "Arb Partial (50% contribution)",
        formula: "US -> JKTC (50% contribution) - US -> NWE (50% contribution)",
        color: "#00a3e0",
        value: difference("us_to_jktc_50", "us_to_nwe_50"),
      },
      {
        id: "arbitrage_2",
        label: "Arb Close",
        formula:
          "ME -> JKTC (100% contribution) - ME -> NWE (100% contribution)",
        color: "#e4002b",
        value: difference("me_to_jktc_100", "me_to_nwe_100"),
      },
    ],
  },
]

/** Sections in the order they appear in the Available curves table and its export. */
export const TABLE_SECTION_ORDER: SectionId[] = [
  "ice",
  "epa",
  "epa-oil",
  "oil-switching",
  "custom",
  "arbitrage",
  "chartering",
  "freight",
]

export const CURVE_BY_ID: ReadonlyMap<string, Curve> = new Map(
  CURVE_SECTIONS.flatMap((section) =>
    section.curves.map((curve) => [curve.id, curve] as const),
  ),
)
