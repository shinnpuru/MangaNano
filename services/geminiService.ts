import { GoogleGenAI } from "@google/genai";

type LanguageKey = "Chinese" | "English" | "Spanish" | "French" | "Japanese";

// Language-specific prompt configurations
const PROMPT_CONFIG: Record<LanguageKey, {
  ocr: (context: string) => string;
  generate: string;
  referencePrefix: string;
}> = {
  Chinese: {
    ocr: (context: string) =>
      `识别这页漫画中的日文文本，并翻译成中文。输出格式：[位置] 原文 -> 译文${context ? `\n\n可参考的上下文：\n${context}` : ''}`,
    generate: "把图中的日文翻译为中文，不要改变其他内容以及字体。",
    referencePrefix: "参考译文:",
  },
  English: {
    ocr: (context: string) =>
      `Identify all Japanese text in this manga page and translate it to English. Format: "[Position] Original -> Translation"${context ? `\n\nContext to consider:\n${context}` : ''}`,
    generate: "Translate all Japanese text in this image to English. Do not change anything else or the font style.",
    referencePrefix: "Reference translations:",
  },
  Spanish: {
    ocr: (context: string) =>
      `Identifica todo el texto japonés en esta página de manga y tradúcelo al español. Formato: "[Posición] Original -> Traducción"${context ? `\n\nContexto a considerar:\n${context}` : ''}`,
    generate: "Traduce todo el texto japonés de esta imagen al español. No cambies nada más ni el estilo de fuente.",
    referencePrefix: "Traducciones de referencia:",
  },
  French: {
    ocr: (context: string) =>
      `Identifiez tout le texte japonais dans cette page de manga et traduisez-le en français. Format : "[Position] Original -> Traduction"${context ? `\n\nContexte à considérer :\n${context}` : ''}`,
    generate: "Traduisez tout le texte japonais de cette image en français. Ne changez rien d'autre ni le style de police.",
    referencePrefix: "Traductions de référence :",
  },
  Japanese: {
    ocr: (context: string) =>
      `この漫画のページにある英語または中国語のテキストを日本語に翻訳してください。フォーマット: "[位置] 原文 -> 訳文"${context ? `\n\n参考にできる文脈:\n${context}` : ''}`,
    generate: "画像内の英語または中国語のテキストを日本語に翻訳してください。他の内容やフォントスタイルは変更しないでください。",
    referencePrefix: "参考訳文:",
  },
};

const getLanguageConfig = (targetLanguage: string) => {
  return PROMPT_CONFIG[targetLanguage as LanguageKey] || PROMPT_CONFIG.English;
};

/**
 * Translates a manga image using Gemini 3 Pro Image (new nano banana).
 */
export const translateMangaImage = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string,
  apiKey: string,
  globalPrompt?: string
): Promise<{ imageUrl: string; ocrText: string }> => {
  // Use the provided apiKey from the UI/localStorage
  const ai = new GoogleGenAI({ apiKey });

  const promptContext = globalPrompt?.trim();
  const langConfig = getLanguageConfig(targetLanguage);

  // Step 1: Recognize and translate text (pre-processing using Gemini 3 Flash Preview)
  let detectedText = "";
  try {
    const ocrTextPrompt = langConfig.ocr(promptContext || "");
    const ocrResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: ocrTextPrompt,
          },
        ],
      },
    });

    if (ocrResponse.candidates?.[0]?.content?.parts) {
      for (const part of ocrResponse.candidates[0].content.parts) {
        if (part.text) detectedText += part.text;
      }
    }
  } catch (ocrError) {
    console.warn("OCR/Translation step failed, proceeding with direct generation.", ocrError);
  }

  // Build the generation prompt using language-specific config
  let prompt = langConfig.generate;
  if (detectedText) {
    prompt += `\n\n${langConfig.referencePrefix}\n${detectedText}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4",
          imageSize: "1K"
        }
      }
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No response generated from the model.");
    }

    // Iterate through parts to find the image part
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return { imageUrl: `data:${mimeType};base64,${part.inlineData.data}`, ocrText: detectedText };
      }
    }

    throw new Error("The model did not return an image part.");
  } catch (error: any) {
    console.error("Gemini Translation Error:", error);
    // If the request fails with "Requested entity was not found", it indicates a key issue.
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_ERROR");
    }
    throw new Error(error.message || "Failed to translate image.");
  }
};

/**
 * Regenerate a translated image using user-edited OCR/reference text.
 */
export const regenerateMangaImage = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string,
  apiKey: string,
  referenceText: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });

  const langConfig = getLanguageConfig(targetLanguage);

  // Build the generation prompt using language-specific config
  let prompt = langConfig.generate;
  if (referenceText) {
    prompt += `\n\n${langConfig.referencePrefix}\n${referenceText}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4",
          imageSize: "1K",
        },
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No response generated from the model.");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("The model did not return an image part.");
  } catch (error: any) {
    console.error("Gemini Regeneration Error:", error);
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_ERROR");
    }
    throw new Error(error.message || "Failed to regenerate image.");
  }
};

export const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve({ data: base64Data, mimeType: file.type });
    };
    reader.onerror = (error) => reject(error);
  });
};
