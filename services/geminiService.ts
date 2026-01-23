import { GoogleGenAI } from "@google/genai";

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

  // Step 1: Recognize and translate text (pre-processing using Gemini 3 Flash Preview)
  let detectedText = "";
  try {
    const ocrTextPrompt =
      targetLanguage === "Chinese" || targetLanguage === "中文"
        ? `识别这页漫画中的日文文本，并翻译成中文。输出格式：[位置] 原文 -> 译文${promptContext ? `\n\n可参考的上下文：\n${promptContext}` : ''}`
        : `Identify all text in this manga page and provide the translation in ${targetLanguage}. Format: "[Position] Original -> Translation"${promptContext ? `\n\nContext you can rely on:\n${promptContext}` : ''}`;
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
  
  // Custom prompt for Chinese as requested, otherwise a descriptive English prompt.
  let prompt = `Translate all text in this manga page to ${targetLanguage}. 
  Keep the original artwork, character designs, and background exactly the same. 
  Replace the text inside the speech bubbles, captions, and SFX with natural ${targetLanguage} translation. 
  Maintain the typography style and font feel of the original manga. 
  Return only the updated image.`;

  if (detectedText) {
    prompt += `\n\nReference Translations:\n${detectedText}`;
  }

  // Specific prompt requested for Chinese target
  if (targetLanguage === "Chinese" || targetLanguage === "中文") {
    prompt = "把图中的日文翻译为中文，不要改变其他内容以及字体。";
    if (detectedText) {
      prompt += `\n\n参考译文:\n${detectedText}`;
    }
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

  let prompt = `Translate all text in this manga page to ${targetLanguage}.
  Keep the original artwork, character designs, and background exactly the same.
  Replace the text inside the speech bubbles, captions, and SFX with natural ${targetLanguage} translation.
  Maintain the typography style and font feel of the original manga.
  Return only the updated image.`;

  if (referenceText) {
    prompt += `\n\nReference Translations:\n${referenceText}`;
  }

  if (targetLanguage === "Chinese" || targetLanguage === "中文") {
    prompt = "把图中的日文翻译为中文，不要改变其他内容以及字体。";
    if (referenceText) {
      prompt += `\n\n参考译文:\n${referenceText}`;
    }
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
