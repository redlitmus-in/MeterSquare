/**
 * Real-time Update Store
 *
 * This store tracks when data changes via real-time subscriptions.
 * Pages that use direct API calls (not React Query) can listen to this store
 * to know when to refetch their data.
 *
 * Usage in components:
 * ```typescript
 * const boqUpdateTimestamp = useRealtimeUpdateStore(state => state.boqUpdateTimestamp);
 *
 * useEffect(() => {
 *   loadBOQs(); // Reload data when timestamp changes
 * }, [boqUpdateTimestamp]);
 * ```
 */

import { create } from 'zustand';

interface RealtimeUpdateStore {
  // Timestamps for different data types
  boqUpdateTimestamp: number;
  boqDetailsUpdateTimestamp: number;
  changeRequestUpdateTimestamp: number;
  purchaseUpdateTimestamp: number;
  taskUpdateTimestamp: number;
  projectUpdateTimestamp: number;

  // Last update payload for debugging
  lastBOQUpdate: any | null;
  lastChangeRequestUpdate: any | null;

  // Actions to trigger updates
  triggerBOQUpdate: (payload?: any) => void;
  triggerBOQDetailsUpdate: (payload?: any) => void;
  triggerChangeRequestUpdate: (payload?: any) => void;
  triggerPurchaseUpdate: (payload?: any) => void;
  triggerTaskUpdate: (payload?: any) => void;
  triggerProjectUpdate: (payload?: any) => void;

  // Reset all timestamps
  resetAll: () => void;
}

export const useRealtimeUpdateStore = create<RealtimeUpdateStore>((set) => ({
  // Initial timestamps
  boqUpdateTimestamp: Date.now(),
  boqDetailsUpdateTimestamp: Date.now(),
  changeRequestUpdateTimestamp: Date.now(),
  purchaseUpdateTimestamp: Date.now(),
  taskUpdateTimestamp: Date.now(),
  projectUpdateTimestamp: Date.now(),

  lastBOQUpdate: null,
  lastChangeRequestUpdate: null,

  // Trigger BOQ update
  triggerBOQUpdate: (payload) => {
    set({
      boqUpdateTimestamp: Date.now(),
      lastBOQUpdate: payload
    });
  },

  // Trigger BOQ details update
  triggerBOQDetailsUpdate: (payload) => {
    set({
      boqDetailsUpdateTimestamp: Date.now()
    });
  },

  // Trigger change request update
  triggerChangeRequestUpdate: (payload) => {
    set({
      changeRequestUpdateTimestamp: Date.now(),
      lastChangeRequestUpdate: payload
    });
  },

  // Trigger purchase update
  triggerPurchaseUpdate: (payload) => {
    set({
      purchaseUpdateTimestamp: Date.now()
    });
  },

  // Trigger task update
  triggerTaskUpdate: (payload) => {
    set({
      taskUpdateTimestamp: Date.now()
    });
  },

  // Trigger project update
  triggerProjectUpdate: (payload) => {
    set({
      projectUpdateTimestamp: Date.now()
    });
  },

  // Reset all timestamps
  resetAll: () => {
    const now = Date.now();
    set({
      boqUpdateTimestamp: now,
      boqDetailsUpdateTimestamp: now,
      changeRequestUpdateTimestamp: now,
      purchaseUpdateTimestamp: now,
      taskUpdateTimestamp: now,
      projectUpdateTimestamp: now,
      lastBOQUpdate: null,
      lastChangeRequestUpdate: null,
    });
  },
}));
