import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

type UiState = {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  theme: Theme;
  /** Sede seleccionada para filtrar paneles y reportes ('' = todas las sedes) */
  branchId: string;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  setBranchId: (branchId: string) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      sidebarCollapsed: false,
      commandOpen: false,
      theme: 'system',
      branchId: '',
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCommandOpen: (open) => set({ commandOpen: open }),
      setTheme: (theme) => set({ theme }),
      setBranchId: (branchId) => set({ branchId }),
    }),
    {
      name: 'ui-storage',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme, branchId: s.branchId }),
    },
  ),
);
