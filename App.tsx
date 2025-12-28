import React, { useState, useEffect, useMemo } from 'react';
import { MangaImage, UILanguage } from './types';
import { translateMangaImage, fileToBase64 } from './services/geminiService';

declare const JSZip: any;
declare const window: any;

const LANGUAGES = ["Chinese", "English", "Spanish", "French", "Japanese"];

const TRANSLATIONS = {
  zh: {
    title: "MangaNano 漫画翻译",
    subtitle: "由 Gemini 3 Pro Image 驱动",
    selectKey: "配置 API 密钥",
    changeKey: "更换密钥",
    keyDescription: "请输入您的 Google Gemini API 密钥以开始使用。您的密钥将保存在本地浏览器中。",
    inputKeyPlaceholder: "在此输入 API Key (AIza...)",
    saveKey: "保存并开始使用",
    billingLink: "获取 API 密钥",
    targetLang: "目标语言",
    startBtn: "开始批量翻译",
    translating: "翻译中...",
    downloadZip: "打包下载 ZIP",
    clearAll: "清空队列",
    addPages: "添加漫画页面",
    dragDrop: "拖拽图片到此处或点击上传",
    batchProgress: "实时进度",
    processed: "已处理",
    emptyQueue: "暂无待处理图片",
    emptyDesc: "上传您的漫画图片，AI 将自动识别文字并替换为目标语言。",
    apiKeyError: "API 密钥失效或未找到。请点击下方按钮重新配置。",
    failed: "翻译失败",
    uiLang: "界面语言",
    total: "总计",
    keyNotSet: "需要 API 密钥"
  },
  en: {
    title: "MangaNano Translator",
    subtitle: "Powered by Gemini 3 Pro Image",
    selectKey: "Configure API Key",
    changeKey: "Change Key",
    keyDescription: "Please enter your Google Gemini API Key to get started. Your key is stored locally in your browser.",
    inputKeyPlaceholder: "Enter API Key here (AIza...)",
    saveKey: "Save & Get Started",
    billingLink: "Get API Key",
    targetLang: "Target Language",
    startBtn: "Start Batch Translation",
    translating: "Translating...",
    downloadZip: "Download ZIP",
    clearAll: "Clear All",
    addPages: "Add Manga Pages",
    dragDrop: "Drag & drop images here or click to upload",
    batchProgress: "Batch Progress",
    processed: "Processed",
    emptyQueue: "Queue is Empty",
    emptyDesc: "Upload your manga pages and the AI will handle the translation automatically.",
    apiKeyError: "API Key invalid or not found. Please re-configure below.",
    failed: "Translation Failed",
    uiLang: "UI Language",
    total: "Total",
    keyNotSet: "API Key Required"
  }
};

const App: React.FC = () => {
  const [images, setImages] = useState<MangaImage[]>([]);
  const [targetLanguage, setTargetLanguage] = useState<string>("Chinese");
  const [uiLang, setUiLang] = useState<UILanguage>("zh");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');
  const [isProcessing, setIsProcessing] = useState(false);

  const t = TRANSLATIONS[uiLang];

  // Check for existing API key selection on mount
  useEffect(() => {
    const checkKey = async () => {
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) {
        setHasKey(true);
      } else if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        setHasKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setHasKey(true);
    }
  };

  const handleSelectKey = () => {
    setHasKey(false);
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
    images.forEach(img => {
      URL.revokeObjectURL(img.previewUrl);
      if (img.translatedUrl) URL.revokeObjectURL(img.translatedUrl);
    });
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
        const resultUrl = await translateMangaImage(data, mimeType, targetLanguage, apiKey);
        
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
    link.download = `translated_manga_${targetLanguage.toLowerCase()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    const total = images.length;
    const completed = images.filter(i => i.status === 'completed').length;
    const errors = images.filter(i => i.status === 'error').length;
    return { total, completed, errors };
  }, [images]);

  // key prompt dialog ui
  if (hasKey === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="bg-white rounded-[40px] p-12 max-w-lg w-full shadow-2xl text-center space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-indigo-600 text-white rounded-[32px] flex items-center justify-center mx-auto shadow-2xl shadow-indigo-200 rotate-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">{t.keyNotSet}</h1>
            <p className="text-slate-500 font-medium text-lg leading-relaxed">{t.keyDescription}</p>
          </div>
          <div className="pt-6 space-y-4">
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t.inputKeyPlaceholder}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-medium text-slate-700 text-center"
            />
            <button 
              onClick={handleSaveKey}
              className="w-full py-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-black text-xl shadow-xl shadow-indigo-100 transition-all active:scale-[0.97]"
            >
              {t.saveKey}
            </button>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-600 text-sm font-black hover:underline block uppercase tracking-widest opacity-60">
              {t.billingLink}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-24 font-sans text-slate-900 antialiased">
      <header className="bg-white/80 backdrop-blur-2xl border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-5">
            <div className="w-12 h-12 bg-indigo-600 rounded-[18px] flex items-center justify-center shadow-lg shadow-indigo-100 transform -rotate-3">
              <span className="text-white font-black text-2xl">N</span>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">{t.title}</h1>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mt-1.5">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={handleSelectKey}
              className="hidden md:flex items-center space-x-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span>{t.changeKey}</span>
            </button>
            <button 
              onClick={() => setUiLang(uiLang === 'zh' ? 'en' : 'zh')}
              className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-all shadow-sm group"
              title={t.uiLang}
            >
              <span className="text-xs font-black group-active:scale-90 transition-transform">{uiLang === 'zh' ? 'EN' : 'ZH'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          <div className="lg:col-span-4 xl:col-span-3 space-y-8">
            <div className="bg-white p-8 rounded-[48px] shadow-sm border border-slate-200/60 space-y-10">
              <div className="space-y-5">
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] pl-1">{t.targetLang}</label>
                <div className="relative group">
                  <select 
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={isProcessing}
                    className="w-full pl-6 pr-12 py-5 bg-slate-50 border border-slate-200 rounded-[24px] focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-black text-slate-700 appearance-none disabled:opacity-50 text-lg"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang}>{lang}</option>
                    ))}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="space-y-5 pt-4 border-t border-slate-100">
                <button
                  onClick={processImages}
                  disabled={images.length === 0 || isProcessing}
                  className={`w-full py-6 px-4 rounded-[32px] font-black text-xl text-white transition-all flex items-center justify-center space-x-4 shadow-2xl ${
                    isProcessing || images.length === 0 
                      ? 'bg-slate-200 shadow-none cursor-not-allowed text-slate-400' 
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100 active:scale-[0.95]'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-6 h-6 border-[4px] border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{t.translating}</span>
                    </>
                  ) : (
                    <span>{t.startBtn}</span>
                  )}
                </button>

                {stats.completed > 0 && !isProcessing && (
                  <button
                    onClick={downloadAllAsZip}
                    className="w-full py-6 px-4 rounded-[32px] font-black text-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-all flex items-center justify-center space-x-3 shadow-sm active:scale-[0.95]"
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
                    className="w-full py-4 text-slate-400 hover:text-red-500 font-black text-xs uppercase tracking-[0.2em] transition-colors"
                  >
                    {t.clearAll}
                  </button>
                )}
              </div>
            </div>

            {images.length > 0 && (
              <div className="bg-slate-900 p-8 rounded-[48px] shadow-2xl text-white space-y-8 border-t-4 border-indigo-500">
                <h3 className="text-[11px] font-black opacity-40 uppercase tracking-[0.3em]">{t.batchProgress}</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1.5">
                      <p className="text-4xl font-black">{stats.completed}</p>
                      <p className="text-[11px] font-black opacity-50 uppercase tracking-widest">{t.processed}</p>
                    </div>
                    <div className="text-right space-y-1.5">
                      <p className="text-4xl font-black text-indigo-400">{stats.total}</p>
                      <p className="text-[11px] font-black opacity-50 uppercase tracking-widest">{t.total}</p>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden p-1">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-700 ease-out rounded-full shadow-[0_0_20px_rgba(99,102,241,0.6)]" 
                      style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-12">
            {/* Massive Upload Zone */}
            <div className="relative border-[6px] border-dashed border-slate-200 bg-white rounded-[64px] p-24 text-center hover:border-indigo-400 hover:bg-indigo-50/10 transition-all group overflow-hidden shadow-2xl shadow-slate-200/50">
              <input 
                type="file" 
                multiple 
                accept="image/*"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="space-y-10">
                <div className="w-32 h-32 bg-white text-indigo-600 rounded-[48px] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-500 shadow-2xl border border-slate-100 group-hover:rotate-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="space-y-3">
                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{t.addPages}</h3>
                  <p className="text-slate-400 font-bold text-xl">{t.dragDrop}</p>
                </div>
              </div>
            </div>

            {images.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                {images.map((img) => (
                  <div key={img.id} className="bg-white rounded-[48px] border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-2xl hover:-translate-y-3 transition-all group relative border-b-[10px] border-slate-100">
                    <div className="aspect-[3/4] bg-slate-50 relative overflow-hidden">
                      <img 
                        src={img.translatedUrl || img.previewUrl} 
                        alt={img.file.name} 
                        className={`w-full h-full object-cover transition-all duration-1000 ${img.status === 'processing' ? 'blur-2xl grayscale scale-125 opacity-30' : ''}`}
                      />
                      
                      {img.status === 'processing' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6">
                          <div className="w-20 h-20 border-[6px] border-indigo-600/10 border-t-indigo-600 rounded-full animate-spin shadow-2xl"></div>
                          <span className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.4em] animate-pulse">{t.translating}</span>
                        </div>
                      )}

                      {img.status === 'completed' && (
                        <div className="absolute top-8 right-8 bg-green-500 text-white rounded-[24px] p-4 shadow-2xl animate-in zoom-in spin-in-6 duration-700">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}

                      {img.status === 'error' && (
                        <div className="absolute inset-0 bg-red-50/95 flex flex-col items-center justify-center p-10 text-center animate-in fade-in duration-500">
                          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-[32px] flex items-center justify-center mb-8 shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-red-900 text-base font-black leading-tight tracking-tight uppercase mb-8">{img.error || t.failed}</p>
                          <button onClick={() => removeImage(img.id)} className="px-8 py-4 bg-white text-red-600 rounded-2xl text-[11px] font-black shadow-xl border border-red-100 active:scale-95 transition-all uppercase tracking-widest">REMOVE</button>
                        </div>
                      )}

                      {/* Hover Overlay */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent p-10 opacity-0 group-hover:opacity-100 transition-all translate-y-10 group-hover:translate-y-0 duration-500 flex justify-between items-center">
                        <div className="space-y-1.5">
                          <p className="text-white text-sm font-black truncate max-w-[160px] tracking-tight">{img.file.name}</p>
                          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">{(img.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        {!isProcessing && img.status !== 'processing' && (
                          <button onClick={() => removeImage(img.id)} className="w-12 h-12 bg-white/10 hover:bg-red-500 text-white rounded-[18px] transition-all backdrop-blur-2xl flex items-center justify-center border border-white/5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-40 flex flex-col items-center text-slate-200 space-y-10 animate-in fade-in duration-1000">
                <div className="relative">
                  <div className="absolute -inset-16 bg-indigo-100 rounded-full blur-[100px] opacity-30 animate-pulse"></div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-40 w-40 relative text-slate-200/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.3} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-center space-y-3">
                  <p className="text-3xl font-black text-slate-300 tracking-tighter">{t.emptyQueue}</p>
                  <p className="text-lg font-bold text-slate-400 max-w-sm mx-auto">{t.emptyDesc}</p>
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
