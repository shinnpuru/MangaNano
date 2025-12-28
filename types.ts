
export interface MangaImage {
  id: string;
  file: File;
  previewUrl: string;
  translatedUrl?: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface TranslationSettings {
  targetLanguage: string;
  preserveStyle: boolean;
  model: 'gemini-3-pro-image-preview';
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  TRANSLATING = 'TRANSLATING',
  ZIPPING = 'ZIPPING',
  DONE = 'DONE'
}

export type UILanguage = 'zh' | 'en';
