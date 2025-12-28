
import React, { useState, useEffect, useMemo } from 'react';
import { MangaImage, ProcessingStatus, UILanguage } from './types';
import { translateMangaImage, fileToBase64 } from './services/geminiService';

declare const JSZip: any;
declare const window: any;

const LANGUAGES = ["Chinese", "English", "Spanish", "French", "Japanese"];

const TRANSLATIONS = {
  zh: {
    title: "MangaNano 漫画翻译",
    subtitle: "由 Gemini 3 Pro Image 驱动",
    selectKey: "选择 API Key",
    keyDescription: "使用此应用需要您选择一个付费的 Google Cloud 项目 API Key。",
    billingLink: "查看计费文档",
    targetLang: "目标语言",
    startBtn: "开始翻译",
    translating: "翻译中...",
    downloadZip: "下载 ZIP 压缩包",
    clearAll: "清除所有图片",
    addPages: "添加漫画页面",
    dragDrop: "拖拽或点击上传图片 (PNG, JPG)",
    batchProgress: "批量进度",
    processed: "已处理",
    emptyQueue: "队列为空",
    emptyDesc: "上传一些漫画页面，AI 将为您处理剩下的工作。",
    apiKeyError: "API Key 无效或未找到。请尝试重新选择。",
    failed: "翻译失败",
    uiLang: "UI 语言",
  },
  en: {
    title: "MangaNano Translator",
    subtitle: "Powered by Gemini 3 Pro Image",
    selectKey: "Select API Key",
    keyDescription: "To use this app, you must select an API Key from a paid Google Cloud project.",
    billingLink: "View Billing Docs",
    targetLang: "Target Language",
    startBtn: "Start Translation",
    translating: "Translating...",
    downloadZip: "Download ZIP",
    clearAll: "Clear All Images",
    addPages: "Add Manga Pages",
    dragDrop: "Drag & drop or click to upload (PNG, JPG)",
    batchProgress: "Batch Progress",
    processed: "Processed",
    emptyQueue: "Queue is Empty",
    emptyDesc: "Add some pages and our AI will handle the rest.",
    apiKeyError: "API Key invalid or not found. Please try selecting again.",
    failed: "Translation Failed",
    uiLang: "UI Language",
  }
};

const App: React.FC = () => {
  const [images, setImages] = useState<MangaImage[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<string>("Chinese");
  const [uiLang, setUiLang] = useState<UILanguage>("zh");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = TRANSLATIONS[uiLang];

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    if (window.aistudio?.hasSelectedApiKey) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    } else {
      // Development/fallback environment
      setHasKey(true);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Proceed assuming success per race condition mitigation guidelines
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map((file: File) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'idle' as const
    }));
    setImages(prev => [...prev, ...newFiles]);
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    if (images.some(img => img.translatedUrl)) {
      images.forEach(img => img.translatedUrl && URL.revokeObjectURL(img.translatedUrl));
    }
    setImages([]);
    setStatus(ProcessingStatus.IDLE);
  };

  const processImages = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setStatus(ProcessingStatus.TRANSLATING);

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.status === 'completed') continue;

      setImages(prev => prev.map(item => 
        item.id === img.id ? { ...item, status: 'processing' } : item
      ));

      try {
        const { data, mimeType } = await fileToBase64(img.file);
        const resultUrl = await translateMangaImage(data, mimeType, targetLanguage);
        
        setImages(prev => prev.map(item => 
          item.id === img.id ? { ...item, status: 'completed', translatedUrl: resultUrl } : item
        ));
      } catch (error: any) {
        if (error.message === "API_KEY_ERROR") {
          setHasKey(false);
          setIsProcessing(false);
          return;
        }
        setImages(prev => prev.map(item => 
          item.id === img.id ? { ...item, status: 'error', error: error.message } : item
        ));
      }
    }

    setIsProcessing(false);
    setStatus(ProcessingStatus.DONE);
  };

  const downloadAllAsZip = async () => {
    setStatus(ProcessingStatus.ZIPPING);
    const zip = new JSZip();
    const completedImages = images.filter(img => img.translatedUrl);
    
    for (const img of completedImages) {
      if (!img.translatedUrl) continue;
      const base64Data = img.translatedUrl.split(',')[1];
      const extension = img.file.name.split('.').pop() || 'png';
      zip.file(`translated_${img.file.name.split('.')[0]}.${extension}`, base64Data, { base64: true });
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manganano_${targetLanguage.toLowerCase()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatus(ProcessingStatus.DONE);
  };

  const stats = useMemo(() => {
    const total = images.length;
    const completed = images.filter(i => i.status === 'completed').length;
    const errors = images.filter(i => i.status === 'error').length;
    return { total, completed, errors };
  }, [images]);

  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t.selectKey}</h1>
          <p className="text-slate-600 text-sm leading-relaxed">{t.keyDescription}</p>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-600 text-xs font-bold hover:underline block">
            {t.billingLink}
          </a>
          <button 
            onClick={handleSelectKey}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95"
          >
            {t.selectKey}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <span className="text-white font-black text-xl">M</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">{t.title}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setUiLang(uiLang === 'zh' ? 'en' : 'zh')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {uiLang === 'zh' ? 'English' : '中文'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t.targetLang}</label>
                <select 
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  disabled={isProcessing}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700 disabled:opacity-50"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                <button
                  onClick={processImages}
                  disabled={images.length === 0 || isProcessing}
                  className={`w-full py-4 px-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center space-x-3 ${
                    isProcessing || images.length === 0 
                      ? 'bg-slate-200 cursor-not-allowed text-slate-400' 
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-[0.98]'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t.translating}</span>
                    </>
                  ) : (
                    <span>{t.startBtn}</span>
                  )}
                </button>

                {stats.completed > 0 && (
                  <button
                    onClick={downloadAllAsZip}
                    className="w-full py-4 px-4 rounded-2xl font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-all flex items-center justify-center space-x-2 shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>{t.downloadZip}</span>
                  </button>
                )}
              </div>
            </div>

            {images.length > 0 && (
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.batchProgress}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-slate-500">{t.processed}</span>
                    <span className="text-indigo-600">{stats.completed} / {stats.total}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full transition-all duration-700 ease-out rounded-full" 
                      style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-9 space-y-8">
            <div className="relative border-4 border-dashed border-slate-200 bg-white rounded-[40px] p-16 text-center hover:border-indigo-300 transition-all group overflow-hidden">
              <input 
                type="file" 
                multiple 
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="space-y-6">
                <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[32px] flex items-center justify-center mx-auto group-hover:scale-105 transition-transform duration-500 shadow-inner">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{t.addPages}</h3>
                  <p className="text-slate-400 font-medium mt-1">{t.dragDrop}</p>
                </div>
              </div>
            </div>

            {images.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {images.map((img) => (
                  <div key={img.id} className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative">
                    <div className="aspect-[3/4] bg-slate-50 relative overflow-hidden">
                      <img 
                        src={img.translatedUrl || img.previewUrl} 
                        alt={img.file.name} 
                        className={`w-full h-full object-cover transition-all duration-700 ${img.status === 'processing' ? 'blur-md opacity-50' : ''}`}
                      />
                      
                      {img.status === 'processing' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin"></div>
                        </div>
                      )}

                      {img.status === 'completed' && (
                        <div className="absolute top-4 right-4 bg-green-500 text-white rounded-full p-2 shadow-xl animate-in zoom-in duration-300">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}

                      {img.status === 'error' && (
                        <div className="absolute inset-0 bg-red-50/90 flex flex-col items-center justify-center p-6 text-center">
                          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-red-900 text-sm font-bold leading-tight">{img.error || t.failed}</p>
                          <button onClick={() => removeImage(img.id)} className="mt-4 px-4 py-2 bg-white text-red-600 rounded-xl text-xs font-black shadow-sm border border-red-100">REMOVE</button>
                        </div>
                      )}

                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0 flex justify-between items-center">
                        <span className="text-white text-xs font-bold truncate pr-4">{img.file.name}</span>
                        {!isProcessing && img.status !== 'processing' && (
                          <button onClick={() => removeImage(img.id)} className="p-2 bg-white/20 hover:bg-red-500 text-white rounded-xl transition-all backdrop-blur-md">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-24 flex flex-col items-center text-slate-300 space-y-6">
                <div className="relative">
                  <div className="absolute -inset-4 bg-indigo-50 rounded-full blur-2xl opacity-50"></div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-slate-400">{t.emptyQueue}</p>
                  <p className="text-sm font-bold text-slate-400 mt-2 max-w-xs">{t.emptyDesc}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
