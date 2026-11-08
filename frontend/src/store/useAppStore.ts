/** Global application state store.
 *
 * All page-critical state is stored here so that navigating between
 * pages does NOT lose selections, form values, or generation results.
 * Components read from the store on mount and write back on change.
 *
 * Data cache layer: API responses are cached with TTL + version counters.
 * Invalidation: when one page mutates data, it bumps version counters
 * for related caches, causing other pages to refetch on next mount.
 */

import { create } from 'zustand';
import type { AppSettings, DevLetter, PreviewSegment } from '../types';

// ── Letter Generator page state ──────────────────────────────
export interface LetterGenState {
  selectedProfileId: number | undefined;
  selectedCompanyId: number | undefined;
  selectedEmployeeId: number | undefined;
  currentStep: number;
  templateContent: string;
  systemPrompt: string;
  generatedContent: string;
  generating: boolean;
  generateError: string;
  previewSegments: PreviewSegment[];
  letterHistory: DevLetter[];
  historyLoading: boolean;
  activeTab: 'generate' | 'templates' | 'profiles';
  /** Per-employee per-step draft content: "employeeId-step" → generated content */
  employeeDrafts: Record<string, string>;
  /** Per-employee current step: employeeId → step */
  employeeSteps: Record<number, number>;
}

// ── People page state ────────────────────────────────────────
export interface PeoplePageState {
  searchText: string;
  positionFilter: string | undefined;
  countryFilter: string | undefined;
  /** 按所属企业的主营产品/业务筛选（产品 id 列表，命中任意一个即算） */
  productFilter: number[];
  showFavoritesOnly: boolean;
  contactStatusFilter: string | undefined;
  currentPage: number;
  pageSize: number;
  /** 员工表格的列宽（用户拖拽调整后记住） */
  colWidths: Record<string, number>;
}

// ── Companies page state ─────────────────────────────────────
export interface CompaniesPageState {
  searchText: string;
  industryFilter: string | undefined;
  /** 按主营产品/业务筛选（产品 id 列表，命中任意一个即算） */
  productFilter: number[];
  showFavoritesOnly: boolean;
  currentPage: number;
  pageSize: number;
  /** 企业表格的列宽（用户拖拽调整后记住） */
  colWidths: Record<string, number>;
  /** 企业详情抽屉里员工表格的列宽（用户拖拽调整后记住） */
  employeeColWidths: Record<string, number>;
}

// ── Follow-ups page state ────────────────────────────────────
export interface FollowUpsPageState {
  searchText: string;
  statusFilter: string | undefined;
}

// ── Data cache entry ─────────────────────────────────────────
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ── Cache keys ───────────────────────────────────────────────
export type CacheKey = 'employees' | 'companies' | 'followUps' | 'dashboard' | 'letterTemplates' | 'senderProfiles';

// ── Invalidation flags (version counters) ────────────────────
export interface InvalidationFlags {
  employees: number;
  companies: number;
  followUps: number;
  dashboard: number;
  letterTemplates: number;
  senderProfiles: number;
}

// ── Root state ───────────────────────────────────────────────
interface AppState {
  // Global selections (shared across pages)
  selectedCountry: string | null;

  // UI
  sidebarCollapsed: boolean;
  emailDeduceLoading: boolean;
  emailVerifyLoading: boolean;
  aiGenerateLoading: boolean;

  // Settings (cached from API)
  settings: AppSettings | null;

  // Letter Generator page
  letterGen: LetterGenState;

  // People page
  peoplePage: PeoplePageState;

  // Companies page
  companiesPage: CompaniesPageState;

  // Follow-ups page
  followUpsPage: FollowUpsPageState;

  // Data cache
  _cache: Record<string, CacheEntry<unknown>>;
  _invalidation: InvalidationFlags;

  // Actions — global
  setSelectedCountry: (country: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setEmailDeduceLoading: (loading: boolean) => void;
  setEmailVerifyLoading: (loading: boolean) => void;
  setAiGenerateLoading: (loading: boolean) => void;
  setSettings: (settings: AppSettings) => void;
  loadSettings: () => Promise<void>;

  // Actions — letter generator
  setLetterGen: (partial: Partial<LetterGenState>) => void;
  resetLetterGen: () => void;

  // Actions — people page
  setPeoplePage: (partial: Partial<PeoplePageState>) => void;

  // Actions — companies page
  setCompaniesPage: (partial: Partial<CompaniesPageState>) => void;

  // Actions — follow-ups page
  setFollowUpsPage: (partial: Partial<FollowUpsPageState>) => void;

  // Actions — data cache
  setCacheData: <T>(key: string, data: T) => void;
  getCacheData: <T>(key: string, ttlMs?: number) => T | null;

  // Actions — invalidation
  invalidate: (keys: CacheKey[]) => void;
  getInvalidationVersion: (key: CacheKey) => number;
}

const defaultLetterGen: LetterGenState = {
  selectedProfileId: undefined,
  selectedCompanyId: undefined,
  selectedEmployeeId: undefined,
  currentStep: 1,
  templateContent: '',
  systemPrompt: '',
  generatedContent: '',
  generating: false,
  generateError: '',
  previewSegments: [],
  letterHistory: [],
  historyLoading: false,
  activeTab: 'generate',
  employeeDrafts: {},
  employeeSteps: {},
};

const defaultPeoplePage: PeoplePageState = {
  searchText: '',
  positionFilter: undefined,
  countryFilter: undefined,
  productFilter: [],
  showFavoritesOnly: false,
  contactStatusFilter: undefined,
  currentPage: 1,
  pageSize: 20,
  colWidths: {},
};

const defaultCompaniesPage: CompaniesPageState = {
  searchText: '',
  industryFilter: undefined,
  productFilter: [],
  showFavoritesOnly: false,
  currentPage: 1,
  pageSize: 20,
  colWidths: {},
  employeeColWidths: {},
};

const defaultFollowUpsPage: FollowUpsPageState = {
  searchText: '',
  statusFilter: undefined,
};

const defaultInvalidation: InvalidationFlags = {
  employees: 0,
  companies: 0,
  followUps: 0,
  dashboard: 0,
  letterTemplates: 0,
  senderProfiles: 0,
};

export const useAppStore = create<AppState>((set, get) => ({
  // Global
  selectedCountry: null,
  sidebarCollapsed: false,
  emailDeduceLoading: false,
  emailVerifyLoading: false,
  aiGenerateLoading: false,
  settings: null,

  // Page states
  letterGen: defaultLetterGen,
  peoplePage: defaultPeoplePage,
  companiesPage: defaultCompaniesPage,
  followUpsPage: defaultFollowUpsPage,

  // Data cache & invalidation
  _cache: {},
  _invalidation: defaultInvalidation,

  // Global actions
  setSelectedCountry: (country) => set({ selectedCountry: country }),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setEmailDeduceLoading: (loading) => set({ emailDeduceLoading: loading }),
  setEmailVerifyLoading: (loading) => set({ emailVerifyLoading: loading }),
  setAiGenerateLoading: (loading) => set({ aiGenerateLoading: loading }),
  setSettings: (settings) => set({ settings }),
  loadSettings: async () => {
    try {
      const api = (await import('../api/client')).default;
      const res = await api.get('/settings/');
      set({ settings: res.data });
    } catch { /* best effort */ }
  },

  // Letter gen actions
  setLetterGen: (partial) =>
    set((state) => ({ letterGen: { ...state.letterGen, ...partial } })),
  resetLetterGen: () => set({ letterGen: defaultLetterGen }),

  // People page actions
  setPeoplePage: (partial) =>
    set((state) => ({ peoplePage: { ...state.peoplePage, ...partial } })),

  // Companies page actions
  setCompaniesPage: (partial) =>
    set((state) => ({ companiesPage: { ...state.companiesPage, ...partial } })),

  // Follow-ups page actions
  setFollowUpsPage: (partial) =>
    set((state) => ({ followUpsPage: { ...state.followUpsPage, ...partial } })),

  // Data cache actions
  setCacheData: (key, data) =>
    set((state) => ({
      _cache: { ...state._cache, [key]: { data, timestamp: Date.now() } },
    })),

  getCacheData: (key, ttlMs = 120_000) => {
    const entry = get()._cache[key] as CacheEntry<unknown> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) return null;
    return entry.data as any;
  },

  // Invalidation actions
  invalidate: (keys) =>
    set((state) => {
      const newFlags = { ...state._invalidation };
      for (const k of keys) {
        newFlags[k] = (newFlags[k] || 0) + 1;
      }
      return { _invalidation: newFlags };
    }),

  getInvalidationVersion: (key) => get()._invalidation[key],
}));
