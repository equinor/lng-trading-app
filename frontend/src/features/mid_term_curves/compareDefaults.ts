/** What the Compare curves tab shows before the user changes anything, and what "Reset" restores. */

export type ShadeMode = "off" | "history" | "forward"

export type CompareChartOptions = {
  showTodayLine: boolean
  showYearStartLines: boolean
  shadeMode: ShadeMode
  // Axis limits are kept as typed; blank means automatic.
  yMin: string
  yMax: string
  yStep: string
}

export const DEFAULT_CHART_OPTIONS: CompareChartOptions = {
  showTodayLine: true,
  showYearStartLines: true,
  shadeMode: "history",
  yMin: "",
  yMax: "",
  yStep: "",
}

export const DEFAULT_CURVE_IDS = [
  "epa_jkm",
  "epa_ttf",
  "epa_hh",
  "us_marginal_des_asia_100",
  "us_marginal_des_asia_50",
  "us_marginal_des_asia_sunk",
]

/** Colour of a saved custom curve until the user picks another. */
export const CUSTOM_CURVE_DEFAULT_COLOR = "#ff1243"

export const DEFAULT_CURVE_COLORS: Record<string, string> = {
  crude_17_2: "#000000",
  crude_15_5: "#666666",
  crude_14: "#888888",
  crude_12_5: "#aaaaaa",
  crude_10: "#cccccc",
  ice_jkm: "#007f63",
  ice_hh: "#f79b18",
  ice_ttf: "#36b37e",
  ice_brent: "#000000",
  epa_jkm: "#ff1243",
  epa_ttf: "#ffc2cc",
  epa_nbp: "#ffd34d",
  epa_hh: "#ffb81c",
  us_to_jktc_100: "#369fd0",
  us_to_jktc_50: "#369fd0",
  us_to_jktc_0: "#369fd0",
  us_to_nwe_100: "#369fd0",
  us_to_nwe_50: "#369fd0",
  us_to_nwe_0: "#369fd0",
  me_to_jktc_100: "#369fd0",
  me_to_jktc_50: "#369fd0",
  me_to_jktc_0: "#369fd0",
  me_to_nwe_100: "#369fd0",
  me_to_nwe_50: "#369fd0",
  me_to_nwe_0: "#369fd0",
  spot_chartering_gea: "#36b37e",
  spark_0: "#36b37e",
  spark_1: "#36b37e",
  arbitrage_0: "#ffd34d",
  arbitrage_1: "#ffd34d",
  arbitrage_2: "#ffd34d",
  euro_coalswitching: "#7b61a8",
  china_central_asia: "#7b61a8",
  china_power_of_siberia: "#7b61a8",
  woodmac_asia_mid_term: "#7b61a8",
  us_marginal_des_asia_100: "#fff4cc",
  us_marginal_des_asia_50: "#ffe69a",
  us_marginal_des_asia_sunk: "#ffd34d",
}
