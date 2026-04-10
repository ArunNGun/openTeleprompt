import { create } from 'zustand'

export const useAppStore = create((set, get) => ({
  view: 'idle', // 'idle' | 'edit' | 'read'
  setView: (view) => set({ view }),

  config: {
    mode: 'notch',
    scrollSpeed: 1,
    fontSize: 16,
    opacity: 1,
    threshold: 0.018,
    autoScroll: false,
    micDeviceId: 'default',
    theme: 'dark',
  },
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  scripts: [],
  currentScriptIndex: -1,
  setScripts: (scripts) => set({ scripts }),
  setCurrentScriptIndex: (i) => set({ currentScriptIndex: i }),

  scriptText: '',
  setScriptText: (text) => set({ scriptText: text }),
  scriptDoc: null,  // Tiptap JSON doc
  setScriptDoc: (doc) => set({ scriptDoc: doc }),

  isPaused: false,
  isHoverPaused: false,
  isSpeaking: false,
  isRunning: false,
  setIsPaused: (v) => set({ isPaused: v }),
  setIsHoverPaused: (v) => set({ isHoverPaused: v }),
  setIsSpeaking: (v) => set({ isSpeaking: v }),
  setIsRunning: (v) => set({ isRunning: v }),

  speedIndex: 3,
  setSpeedIndex: (i) => set({ speedIndex: i }),
}))
