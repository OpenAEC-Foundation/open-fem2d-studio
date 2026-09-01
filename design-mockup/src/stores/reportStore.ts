import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type {
  ReportData,
  Section,
  ContentBlock,
  TemplateInfo,
  TenantInfo,
  BrandConfig,
} from '../types/report';
import { createBlankReport } from '../types/report';
import type { ReportInput } from '../lib/types/steel/ReportInput';
import { useCheckStore } from './checkStore';
import { isSteelCheckResult } from '../lib/checkTypes';
import { isTauriApp, DESKTOP_ONLY_MSG } from '../lib/tauri';
import { getSetting } from '../store';

export type ReportPageSize = 'A4' | 'A3';
export type ReportOrientation = 'portrait' | 'landscape';

/** Section toggles — each maps to an optional block in the generated PDF. */
export interface ReportSectionToggles {
  cover: boolean;
  colofon: boolean;
  toc: boolean;
  introduction: boolean;
  content: boolean;
  appendices: boolean;
  backcover: boolean;
}

export const ALL_SECTIONS_ON: ReportSectionToggles = {
  cover: true,
  colofon: true,
  toc: true,
  introduction: true,
  content: true,
  appendices: true,
  backcover: true,
};

/** Which Rust backend to use for PDF generation. */
export type ReportEngine =
  | 'local'   // Template-bundled minimal engine (src-tauri/src/pdf/)
  | 'openaec'; // openaec-core engine (production-grade, from openaec-reports workspace)

interface ReportState {
  // Current report
  report: ReportData;
  activeSectionIndex: number | null;
  activeBlockIndex: number | null;

  // Display / output settings
  pageSize: ReportPageSize;
  orientation: ReportOrientation;
  sectionToggles: ReportSectionToggles;
  engine: ReportEngine;

  // Tenant & template
  tenant: string;
  tenants: TenantInfo[];
  templates: TemplateInfo[];
  brand: BrandConfig | null;

  // PDF preview
  pdfBytes: Uint8Array | null;
  pdfBlobUrl: string | null;
  generatedAt: number | null;
  isGenerating: boolean;
  error: string | null;

  // Actions — Report
  setReport: (report: ReportData) => void;
  updateMetadata: (fields: Partial<ReportData>) => void;
  addSection: (section: Section) => void;
  updateSection: (index: number, section: Partial<Section>) => void;
  removeSection: (index: number) => void;
  addBlock: (sectionIndex: number, block: ContentBlock) => void;
  updateBlock: (sectionIndex: number, blockIndex: number, block: ContentBlock) => void;
  removeBlock: (sectionIndex: number, blockIndex: number) => void;
  setActiveSection: (index: number | null) => void;
  setActiveBlock: (index: number | null) => void;

  // Actions — Page & toggles
  setPageSize: (size: ReportPageSize) => void;
  setOrientation: (orientation: ReportOrientation) => void;
  setSectionToggle: (key: keyof ReportSectionToggles, value: boolean) => void;
  resetSectionToggles: () => void;
  setEngine: (engine: ReportEngine) => void;

  // Actions — Tenant
  setTenant: (tenant: string) => void;
  loadTenants: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  loadBrand: () => Promise<void>;

  // Actions — PDF
  generatePdf: () => Promise<void>;
  savePdf: (path: string) => Promise<void>;
  clearPdf: () => void;
}

export const useReportStore = create<ReportState>((set, get) => ({
  report: createBlankReport(),
  activeSectionIndex: null,
  activeBlockIndex: null,
  pageSize: 'A4',
  orientation: 'portrait',
  sectionToggles: { ...ALL_SECTIONS_ON },
  engine: 'openaec',
  tenant: 'openaec_foundation',
  tenants: [],
  templates: [],
  brand: null,
  pdfBytes: null,
  pdfBlobUrl: null,
  generatedAt: null,
  isGenerating: false,
  error: null,

  setReport: (report) => set({ report }),

  updateMetadata: (fields) =>
    set((state) => ({
      report: { ...state.report, ...fields },
    })),

  addSection: (section) =>
    set((state) => ({
      report: {
        ...state.report,
        sections: [...state.report.sections, section],
      },
    })),

  updateSection: (index, updates) =>
    set((state) => {
      const sections = [...state.report.sections];
      sections[index] = { ...sections[index]!, ...updates };
      return { report: { ...state.report, sections } };
    }),

  removeSection: (index) =>
    set((state) => ({
      report: {
        ...state.report,
        sections: state.report.sections.filter((_, i) => i !== index),
      },
    })),

  addBlock: (sectionIndex, block) =>
    set((state) => {
      const sections = [...state.report.sections];
      const section = { ...sections[sectionIndex]! };
      section.blocks = [...section.blocks, block];
      sections[sectionIndex] = section;
      return { report: { ...state.report, sections } };
    }),

  updateBlock: (sectionIndex, blockIndex, block) =>
    set((state) => {
      const sections = [...state.report.sections];
      const section = { ...sections[sectionIndex]! };
      section.blocks = [...section.blocks];
      section.blocks[blockIndex] = block;
      sections[sectionIndex] = section;
      return { report: { ...state.report, sections } };
    }),

  removeBlock: (sectionIndex, blockIndex) =>
    set((state) => {
      const sections = [...state.report.sections];
      const section = { ...sections[sectionIndex]! };
      section.blocks = section.blocks.filter((_, i) => i !== blockIndex);
      sections[sectionIndex] = section;
      return { report: { ...state.report, sections } };
    }),

  setActiveSection: (index) => set({ activeSectionIndex: index }),
  setActiveBlock: (index) => set({ activeBlockIndex: index }),

  setPageSize: (size) =>
    set((state) => ({
      pageSize: size,
      report: { ...state.report, format: size },
    })),

  setOrientation: (orientation) =>
    set((state) => ({
      orientation,
      report: {
        ...state.report,
        orientation: orientation === 'portrait' ? 'Portrait' : 'Landscape',
      },
    })),

  setSectionToggle: (key, value) =>
    set((state) => ({
      sectionToggles: { ...state.sectionToggles, [key]: value },
    })),

  resetSectionToggles: () => set({ sectionToggles: { ...ALL_SECTIONS_ON } }),

  setEngine: (engine) => set({ engine }),

  setTenant: (tenant) => {
    set({ tenant });
    get().loadTemplates();
    get().loadBrand();
  },

  // De tenant/template/brand-commands hoorden bij de standalone mockup-shell
  // (design-mockup/src-tauri). De app draait nu tegen de root-backend
  // (src-tauri/src/lib.rs), die deze commands niet heeft — stil overslaan
  // zodat de Rapport-tab er geen foutmeldingen door toont.
  loadTenants: async () => {
    set({ tenants: [] });
  },

  loadTemplates: async () => {
    set({ templates: [] });
  },

  loadBrand: async () => {
    set({ brand: null });
  },

  generatePdf: async () => {
    set({ isGenerating: true, error: null });
    try {
      if (!isTauriApp()) {
        throw new Error(DESKTOP_ONLY_MSG);
      }

      // PDF-route: het staaltoetsingsrapport uit de Rust report-crate
      // (generate_steel_report_pdf). Die dekt nu alleen staal (EN 1993);
      // houtresultaten (EN 1995) worden gefilterd met melding.
      const { results } = useCheckStore.getState();
      const steelResults = results.filter(isSteelCheckResult);
      const timberCount = results.length - steelResults.length;

      if (results.length === 0) {
        throw new Error(
          'Geen toetsingsresultaten. Voer eerst de normtoetsing uit (tabblad Toetsing) — het PDF-rapport bevat de EN 1993-afleidingen per staaf.',
        );
      }
      if (steelResults.length === 0) {
        throw new Error(
          'Alleen houtresultaten aanwezig — het PDF-rapport dekt momenteel uitsluitend staal (EN 1993). Een houtrapport (EN 1995) bestaat nog niet.',
        );
      }
      if (timberCount > 0) {
        const { notifyInfo } = await import('../io/notify');
        notifyInfo(
          'Houtresultaten niet in PDF',
          `${timberCount} houtresultaat/-resultaten (EN 1995) zijn niet opgenomen — het PDF-rapport dekt nu alleen staal (EN 1993).`,
        );
      }

      const projectInfo = await getSetting('projectInfo', {
        name: '', projectNumber: '', engineer: '', company: '', date: '',
      } as { name: string; projectNumber: string; engineer: string; company: string; date: string });

      const { report, pdfBlobUrl: oldUrl } = get();
      const input: ReportInput = {
        project_name: report.project || projectInfo.name || 'Naamloos project',
        project_number: report.project_number || projectInfo.projectNumber || '',
        engineer: report.author || projectInfo.engineer || '',
        company: projectInfo.company || '',
        date: report.date || projectInfo.date || new Date().toISOString().slice(0, 10),
        steel_check_results: steelResults,
      };

      const bytes = await invoke<number[]>('generate_steel_report_pdf', { input });
      const byteArray = new Uint8Array(bytes);

      if (oldUrl) URL.revokeObjectURL(oldUrl);

      const blob = new Blob([byteArray as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      set({
        pdfBytes: byteArray,
        pdfBlobUrl: url,
        generatedAt: Date.now(),
        isGenerating: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isGenerating: false });
    }
  },

  savePdf: async (path: string) => {
    set({ isGenerating: true, error: null });
    try {
      // Hergebruik de laatst gegenereerde bytes; genereer anders eerst.
      let bytes = get().pdfBytes;
      if (!bytes) {
        await get().generatePdf();
        bytes = get().pdfBytes;
        const err = get().error;
        if (err) throw new Error(err);
      }
      if (!bytes) throw new Error('Geen PDF beschikbaar om op te slaan.');

      try {
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(path, bytes);
        const { notifySuccess } = await import('../io/notify');
        notifySuccess('PDF opgeslagen', path);
      } catch {
        // fs-permissie voor binaire writes kan ontbreken → val terug op een
        // browser-download zodat de gebruiker de PDF alsnog krijgt.
        const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = path.split(/[\\/]/).pop() || 'rapport.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        const { notifyWarning } = await import('../io/notify');
        notifyWarning(
          'Direct opslaan niet mogelijk',
          'De PDF is als download aangeboden in plaats van op het gekozen pad geschreven.',
        );
      }
      set({ isGenerating: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isGenerating: false });
    }
  },

  clearPdf: () => {
    const { pdfBlobUrl } = get();
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    set({ pdfBytes: null, pdfBlobUrl: null, generatedAt: null });
  },
}));
