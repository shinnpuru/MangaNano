import { GoogleGenAI } from "@google/genai";

/**
 * Translates a manga image using Gemini 3 Pro Image (new nano banana).
 */
export const translateMangaImage = async (
  base64Data: string,
  mimeType: string,
  targetLanguage: string,
  apiKey: string
): Promise<string> => {
  // Use the provided apiKey from the UI/localStorage
  const ai = new GoogleGenAI({ apiKey });
  
  // Custom prompt for Chinese as requested, otherwise a descriptive English prompt.
  let prompt = `Translate all text in this manga page to ${targetLanguage}. 
  Keep the original artwork, character designs, and background exactly the same. 
  Replace the text inside the speech bubbles, captions, and SFX with natural ${targetLanguage} translation. 
  Maintain the typography style and font feel of the original manga. 
  Return only the updated image.`;

  // Specific prompt requested for Chinese target
  if (targetLanguage === "Chinese" || targetLanguage === "中文") {
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
        return `data:${mimeType};base64,${part.inlineData.data}`;
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
