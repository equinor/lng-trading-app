import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  getMidTermCurvePrices,
  getSavedCustomCurves,
} from "@/features/mid_term_curves/api"

export const midTermCurveKeys = {
  prices: ["mid_term_curves", "prices"] as const,
  customCurves: ["mid_term_curves", "custom-curves"] as const,
}

export function useCurvePrices() {
  return useQuery({
    queryKey: midTermCurveKeys.prices,
    queryFn: () => getMidTermCurvePrices(),
    staleTime: 15 * 60_000,
  })
}

/** Reloads the source prices on the server, not just in the browser. */
export function useRefreshCurvePrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getMidTermCurvePrices(true),
    onSuccess: (prices) =>
      queryClient.setQueryData(midTermCurveKeys.prices, prices),
  })
}

export function useSavedCurves() {
  return useQuery({
    queryKey: midTermCurveKeys.customCurves,
    queryFn: getSavedCustomCurves,
    staleTime: 30_000,
  })
}
