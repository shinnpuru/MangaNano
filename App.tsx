
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
    changeKey: "更换 Key",
    keyDescription: "使用此应用需要您选择一个付费的 Google Cloud 项目 API Key。",
    billingLink: "查看计费文档",
    targetLang: "目标语言",
    startBtn: "开始翻译",
    translating: "翻译中...",
    downloadZip: "下载 ZIP 压缩包",
    clearAll: "清除所有",
    addPages: "添加漫画页面",
    dragDrop: "拖拽或点击上传图片 (PNG, JPG)",
    batchProgress: "任务进度",
    processed: "已完成",
    emptyQueue: "队列为空",
    emptyDesc: "上传一些漫画页面，AI 将为您处理剩下的工作。",
    apiKeyError: "API Key 无效或未找到。请尝试重新选择。",
    failed: "翻译失败",
    uiLang: "UI 语言",
    total: "总计",
    cancel: "取消"
  },
  en: {
    title: "MangaNano Translator",
    subtitle: "Powered by Gemini 3 Pro Image",
    selectKey: "Select API Key",
    changeKey: "Change Key",
    keyDescription: "To use this app, you must select an API Key from a paid Google Cloud project.",
    billingLink: "View Billing Docs",
    targetLang: "Target Language",
    startBtn: "Start Translation",
    translating: "Translating...",
    downloadZip: "Download ZIP",
    clearAll: "Clear All",
    addPages: "Add Manga Pages",
    dragDrop: "Drag & drop or click to upload (PNG, JPG)",
    batchProgress: "Batch Progress",
    processed: "Processed",
    emptyQueue: "Queue is Empty",
    emptyDesc: "Add some pages and our AI will handle the rest.",
    apiKeyError: "API Key invalid or not found. Please try selecting again.",
    failed: "Translation Failed",
    uiLang: "UI Language",
    total: "Total",
    cancel: "Cancel"
  }
};

const App: React.FC = () => {
  const [images, setImages] = useState<MangaImage[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<string>("Chinese");
  const [uiLang, setUiLang] = useState<UILanguage>("zh");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const t = TRANSLATIONS[uiLang];

  // Initial check for API key.
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Fallback for non-aistudio environments (likely will fail calls later if process.env.API_KEY is missing).
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success after triggering to mitigate race condition.
      setHasKey(true);
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
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
  };

  const processImages = async () => {
    if (images.length === 0 || isProcessing) return;
    setIsProcessing(true);

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
          // Reset key state if selection was invalid.
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
  };

  const downloadAllAsZip = async () => {
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
  };

  const stats = useMemo(() => {
    const total = images.length;
    const completed = images.filter(i => i.status === 'completed').length;
    const errors = images.filter(i => i.status === 'error').length;
    return { total, completed, errors };
  }, [images]);

  // Mandatory Key Selection Screen.
  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-[40px] p-10 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-indigo-600 text-white rounded-[32px] flex items-center justify-center mx-auto shadow-xl shadow-indigo-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{t.selectKey}</h1>
            <p className="text-slate-500 font-medium text-sm leading-relaxed">{t.keyDescription}</p>
          </div>
          <div className="space-y-4 pt-4">
            <button 
              onClick={handleSelectKey}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-100 transition-all active:scale-[0.97]"
            >
              {t.selectKey}
            </button>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-indigo-600 text-xs font-black hover:underline block uppercase tracking-widest">
              {t.billingLink}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans text-slate-900">
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 rotate-3">
              <span className="text-white font-black text-2xl">M</span>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">{t.title}</h1>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={handleSelectKey}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            >
              {t.changeKey}
            </button>
            <button 
              onClick={() => setUiLang(uiLang === 'zh' ? 'en' : 'zh')}
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
              title={t.uiLang}
            >
              <span className="text-xs font-black">{uiLang === 'zh' ? 'EN' : 'ZH'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          <div className="lg:col-span-3 space-y-8">
            {/* Sidebar Controls */}
            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-200/60 space-y-8">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] pl-1">{t.targetLang}</label>
                <div className="relative group">
                  <select 
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={isProcessing}
                    className="w-full pl-5 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-[20px] focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700 appearance-none disabled:opacity-50"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <button
                  onClick={processImages}
                  disabled={images.length === 0 || isProcessing}
                  className={`w-full py-5 px-4 rounded-[24px] font-black text-white transition-all flex items-center justify-center space-x-3 shadow-xl ${
                    isProcessing || images.length === 0 
                      ? 'bg-slate-200 shadow-none cursor-not-allowed text-slate-400' 
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 active:scale-[0.96]'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-[3px] border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t.translating}</span>
                    </>
                  ) : (
                    <span>{t.startBtn}</span>
                  )}
                </button>

                {stats.completed > 0 && !isProcessing && (
                  <button
                    onClick={downloadAllAsZip}
                    className="w-full py-5 px-4 rounded-[24px] font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-all flex items-center justify-center space-x-3 shadow-md active:scale-[0.96]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>{t.downloadZip}</span>
                  </button>
                )}

                {images.length > 0 && !isProcessing && (
                  <button
                    onClick={clearAll}
                    className="w-full py-3 text-slate-400 hover:text-red-500 font-bold text-xs uppercase tracking-widest transition-colors"
                  >
                    {t.clearAll}
                  </button>
                )}
              </div>
            </div>

            {/* Progress Stats Card */}
            {images.length > 0 && (
              <div className="bg-slate-900 p-8 rounded-[40px] shadow-2xl text-white space-y-6">
                <h3 className="text-[10px] font-black opacity-40 uppercase tracking-[0.25em]">{t.batchProgress}</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-3xl font-black">{stats.completed}</p>
                      <p className="text-[10px] font-bold opacity-60 uppercase">{t.processed}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-3xl font-black text-indigo-400">{stats.total}</p>
                      <p className="text-[10px] font-bold opacity-60 uppercase">{t.total}</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]" 
                      style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-9 space-y-10">
            {/* Upload Zone */}
            <div className="relative border-[4px] border-dashed border-slate-200/80 bg-white rounded-[48px] p-20 text-center hover:border-indigo-300 hover:bg-indigo-50/20 transition-all group overflow-hidden shadow-inner">
              <input 
                type="file" 
                multiple 
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="space-y-8">
                <div className="w-28 h-28 bg-white text-indigo-600 rounded-[40px] flex items-center justify-center mx-auto group-hover:scale-105 transition-transform duration-500 shadow-xl border border-slate-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">{t.addPages}</h3>
                  <p className="text-slate-400 font-bold text-lg">{t.dragDrop}</p>
                </div>
              </div>
            </div>

            {/* Grid display for uploaded manga pages */}
            {images.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
                {images.map((img) => (
                  <div key={img.id} className="bg-white rounded-[40px] border border-slate-200/60 overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all group relative border-b-[8px]">
                    <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden">
                      <img 
                        src={img.translatedUrl || img.previewUrl} 
                        alt={img.file.name} 
                        className={`w-full h-full object-cover transition-all duration-1000 ${img.status === 'processing' ? 'blur-xl grayscale scale-110 opacity-40' : ''}`}
                      />
                      
                      {img.status === 'processing' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                          <div className="w-16 h-16 border-[4px] border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin shadow-2xl"></div>
                          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest animate-pulse">{t.translating}</span>
                        </div>
                      )}

                      {img.status === 'completed' && (
                        <div className="absolute top-6 right-6 bg-green-500 text-white rounded-2xl p-3 shadow-2xl animate-in zoom-in spin-in-12 duration-500">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}

                      {img.status === 'error' && (
                        <div className="absolute inset-0 bg-red-50/95 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-[24px] flex items-center justify-center mb-6 shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-red-900 text-sm font-black leading-tight tracking-tight uppercase mb-6">{img.error || t.failed}</p>
                          <button onClick={() => removeImage(img.id)} className="px-6 py-3 bg-white text-red-600 rounded-2xl text-xs font-black shadow-lg border border-red-100 active:scale-95 transition-all">REMOVE</button>
                        </div>
                      )}

                      {/* Image Details on Hover */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent p-8 opacity-0 group-hover:opacity-100 transition-all translate-y-6 group-hover:translate-y-0 duration-500 flex justify-between items-center">
                        <div className="space-y-1">
                          <p className="text-white text-xs font-black truncate max-w-[140px]">{img.file.name}</p>
                          <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest">{(img.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        {!isProcessing && img.status !== 'processing' && (
                          <button onClick={() => removeImage(img.id)} className="w-10 h-10 bg-white/10 hover:bg-red-500 text-white rounded-xl transition-all backdrop-blur-xl flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <div className="py-32 flex flex-col items-center text-slate-200 space-y-8 animate-in fade-in duration-700">
                <div className="relative">
                  <div className="absolute -inset-10 bg-indigo-100 rounded-full blur-[80px] opacity-20"></div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-32 w-32 relative text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-2xl font-black text-slate-300 tracking-tight">{t.emptyQueue}</p>
                  <p className="text-sm font-bold text-slate-400 max-w-xs">{t.emptyDesc}</p>
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
