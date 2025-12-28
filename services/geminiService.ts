
import { GoogleGenAI } from "@google/genai";

/**
 * Translates a manga image using Gemini 3 Pro Image.
 * The API key is obtained from process.env.API_KEY which is managed via the aistudio selection flow.
 */
export const translateMangaImage = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string
): Promise<string> => {
  // Create a new instance right before the call to ensure the latest selected key is used.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Custom prompt for Chinese as requested, otherwise a descriptive English prompt.
  let prompt = `Translate all text in this manga page to ${targetLanguage}. 
  Keep the original artwork, character designs, and background exactly the same. 
  Replace the text inside the speech bubbles, captions, and SFX with natural ${targetLanguage} translation. 
  Maintain the typography style and font feel of the original manga. 
  Return only the updated image.`;

  if (targetLanguage === "Chinese" || targetLanguage === "中文") {
    // Exact prompt requested by user for Chinese translation.
    prompt = "把图中的日文翻译为中文，不要改变其他内容以及字体。";
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
          aspectRatio: "3:4", // Standard manga page ratio.
          imageSize: "1K"     // High quality 1K resolution.
        }
      }
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No response generated from the model.");
    }

    // Iterate through parts to find the image part as per SDK usage rules.
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }

    throw new Error("The model did not return an image part.");
  } catch (error: any) {
    console.error("Gemini Translation Error:", error);
    // If the error indicates an invalid or missing key, we report it so the UI can reset the selection.
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_ERROR");
    }
    throw new Error(error.message || "Failed to translate image.");
  }
};

/**
 * Utility to convert File objects to base64 strings.
 */
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
