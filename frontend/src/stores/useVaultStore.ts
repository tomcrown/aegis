import { create } from "zustand";
import type { VaultShare, VaultState } from "@/types";

interface VaultStore {
  vaultState: VaultState | null;
  setVaultState: (s: VaultState) => void;
  userShare: VaultShare | null;
  setUserShare: (s: VaultShare) => void;
}

export const useVaultStore = create<VaultStore>((set) => ({
  vaultState: null,
  setVaultState: (vaultState) => set({ vaultState }),
  userShare: null,
  setUserShare: (userShare) => set({ userShare }),
}));
