// src/hooks/useAuth.ts
type UserPublic = {
  email?: string
  full_name?: string
  is_superuser?: boolean
}

export const isLoggedIn = () => true

const useAuth = () => {
  return {
    user: null as UserPublic | null,
    loginMutation: { isPending: false, mutate: () => {} },
    signUpMutation: { isPending: false, mutate: () => {} },
    logout: () => {},
  }
}

export default useAuth
