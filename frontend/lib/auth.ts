/**
 * PACO Authentication Store
 *
 * Zustand store for managing authentication state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, User } from "./api";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.login(email, password);
          const { token, user } = response;

          // Set token for future API calls
          api.setToken(token.access_token);

          set({
            user,
            token: token.access_token,
            isLoading: false,
          });
        } catch (err: any) {
          set({
            error: err.detail || "Login failed",
            isLoading: false,
          });
          throw err;
        }
      },

      register: async (email: string, password: string, name: string) => {
        set({ isLoading: true, error: null });

        try {
          const response = await api.register(email, password, name);
          const { token, user } = response;

          // Set token for future API calls
          api.setToken(token.access_token);

          set({
            user,
            token: token.access_token,
            isLoading: false,
          });
        } catch (err: any) {
          set({
            error: err.detail || "Registration failed",
            isLoading: false,
          });
          throw err;
        }
      },

      logout: () => {
        api.setToken(null);
        set({ user: null, token: null, error: null });
      },

      refreshUser: async () => {
        const { token } = get();

        if (!token) return;

        try {
          api.setToken(token);
          const user = await api.getCurrentUser();
          set({ user });
        } catch (err) {
          // Token invalid, logout
          get().logout();
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "paco-auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        // Restore token to API client on rehydration
        if (state?.token) {
          api.setToken(state.token);
        }
      },
    }
  )
);

// Helper hook for checking roles
export function useHasRole(allowedRoles: string[]) {
  const { user } = useAuth();
  return user && allowedRoles.includes(user.role);
}

export function useIsAdmin() {
  return useHasRole(["admin"]);
}

export function useIsOperator() {
  return useHasRole(["admin", "operator"]);
}
