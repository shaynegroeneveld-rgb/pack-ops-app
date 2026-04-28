import { create } from "zustand";

import { APP_ROUTES } from "@/app/router/routes";

export interface UiStoreState {
  isCommandBarOpen: boolean;
  activeRoute: string;
  selectedWorkbenchJobId: string | null;
  selectedQuoteId: string | null;
  setCommandBarOpen: (next: boolean) => void;
  setActiveRoute: (route: string) => void;
  setSelectedWorkbenchJobId: (jobId: string | null) => void;
  setSelectedQuoteId: (quoteId: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  isCommandBarOpen: false,
  activeRoute: APP_ROUTES.workbench,
  selectedWorkbenchJobId: null,
  selectedQuoteId: null,
  setCommandBarOpen: (next) => set({ isCommandBarOpen: next }),
  setActiveRoute: (route) => set({ activeRoute: route }),
  setSelectedWorkbenchJobId: (jobId) => set({ selectedWorkbenchJobId: jobId }),
  setSelectedQuoteId: (quoteId) => set({ selectedQuoteId: quoteId }),
}));
