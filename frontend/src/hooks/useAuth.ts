// src/hooks/useAuth.ts
import { useQuery } from "@tanstack/react-query"

import { apiRequest } from "@/services/api_client"

type UserPublic = {
  email?: string
  name?: string
  full_name?: string
  is_superuser?: boolean
}

// Radix's OAuth2 proxy guarantees the user is authenticated before the app
// loads, so there is never an "unauthenticated" state to handle in the SPA.
export const isLoggedIn = () => true

const useAuth = () => {
  const { data: user } = useQuery<UserPublic>({
    queryKey: ["currentUser"],
    queryFn: () => apiRequest<UserPublic>("/api/v1/utils/me"),
    staleTime: Number.POSITIVE_INFINITY,
  })

  return {
    user: user ?? null,
    loginMutation: { isPending: false, mutate: () => {} },
    signUpMutation: { isPending: false, mutate: () => {} },
    // Radix owns the session; logging out means hitting the proxy sign-out URL.
    logout: () => {
      window.location.href = "/oauth2/sign_out"
    },
  }
}

export default useAuth
