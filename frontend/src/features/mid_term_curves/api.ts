import { apiRequest } from "@/services/api_client"

export type CurvePrices = {
  start_date: string
  jkm: number | null
  ttf: number | null
  hh: number | null
  brent: number | null
  epa_jkm: number | null
  epa_ttf: number | null
  epa_hh: number | null
  epa_nbp: number | null
  crude_17_2: number | null
  crude_15_5: number | null
  crude_14: number | null
  crude_12_5: number | null
  crude_10: number | null
  euro_coalswitching: number | null
  china_central_asia: number | null
  china_power_of_siberia: number | null
  spot_chartering_gea: number
  us_to_jktc_100: number | null
  us_to_jktc_50: number | null
  us_to_jktc_0: number | null
  us_to_nwe_100: number | null
  us_to_nwe_50: number | null
  us_to_nwe_0: number | null
  me_to_jktc_100: number | null
  me_to_jktc_50: number | null
  me_to_jktc_0: number | null
  me_to_nwe_100: number | null
  me_to_nwe_50: number | null
  me_to_nwe_0: number | null
  woodmac_asia_mid_term: number | null
  us_marginal_des_asia_100: number | null
  us_marginal_des_asia_50: number | null
  us_marginal_des_asia_sunk: number | null
}

export type CustomCurveMonth = {
  month: string
  fundamental_rationale: string
  curve_1_id: string | null
  curve_2_id: string | null
}

export type SavedCustomCurveMonth = CustomCurveMonth & {
  curve_id: string
  curve_name: string
  created_by: string
  created_at: string
  modified_at: string
}

export type SaveCustomCurveBody = {
  curve_name: string
  months: CustomCurveMonth[]
}

export function getMidTermCurvePrices(): Promise<CurvePrices[]> {
  return apiRequest<CurvePrices[]>("/api/v1/curve-builder/prices")
}

export function getSavedCustomCurves(): Promise<SavedCustomCurveMonth[]> {
  return apiRequest<SavedCustomCurveMonth[]>("/api/v1/curve-builder/custom-curves")
}

export function createCustomCurve(
  body: SaveCustomCurveBody,
): Promise<{ curve_id: string }> {
  return apiRequest<{ curve_id: string }>("/api/v1/curve-builder/custom-curves", {
    method: "POST",
    body,
  })
}

export function updateCustomCurve(
  curveId: string,
  body: SaveCustomCurveBody,
): Promise<{ curve_id: string }> {
  return apiRequest<{ curve_id: string }>(
    `/api/v1/curve-builder/custom-curves/${encodeURIComponent(curveId)}`,
    { method: "PATCH", body },
  )
}

export function deleteCustomCurve(curveId: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/curve-builder/custom-curves/${encodeURIComponent(curveId)}`,
    { method: "DELETE" },
  )
}