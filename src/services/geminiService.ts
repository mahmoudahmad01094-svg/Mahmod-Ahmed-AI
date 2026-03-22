import { GoogleGenAI, Modality, GenerateContentResponse, Chat } from "@google/genai";
import { MODELS } from "../constants";
import { storage, ref, uploadString, uploadBytes, getDownloadURL, auth } from "../firebase";

const getApiKey = (isPaidModel = false) => {
  if (isPaidModel) {
    return (process.env as any).API_KEY || process.env.GEMINI_API_KEY;
  }
  return process.env.GEMINI_API_KEY;
};

export const generateBlogContent = async (prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const response = await ai.models.generateContent({
    model: MODELS.FLASH,
    contents: `أنت كاتب محترف. قم بكتابة مقال مدونة بناءً على هذا الموضوع: ${prompt}. استخدم تنسيق Markdown.`,
    // Removed googleSearch by default to avoid 403 on free keys
  });
  return response.text;
};

export const getFastResponse = async (prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const response = await ai.models.generateContent({
    model: MODELS.FLASH_LITE,
    contents: prompt,
  });
  return response.text;
};

export const getSearchGroundedResponse = async (prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  try {
    const response = await ai.models.generateContent({
      model: MODELS.FLASH,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    return {
      text: response.text,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
    };
  } catch (error: any) {
    console.warn('Search grounding failed, falling back to normal chat:', error);
    // Fallback if search tool is not permitted
    const response = await ai.models.generateContent({
      model: MODELS.FLASH,
      contents: prompt,
    });
    return {
      text: response.text,
      sources: [],
    };
  }
};

export const getMapsGroundedResponse = async (prompt: string, location?: { latitude: number; longitude: number }) => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const response = await ai.models.generateContent({
    model: MODELS.MAPS,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: location ? {
          latLng: {
            latitude: location.latitude,
            longitude: location.longitude,
          }
        } : undefined
      }
    },
  });
  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
  };
};

export const createChat = (systemInstruction?: string): Chat => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  return ai.chats.create({
    model: MODELS.FLASH, // Using Flash as default to avoid 403 on free keys
    config: {
      systemInstruction: systemInstruction || "أنت مساعد ذكي لمدونة تقنية. ساعد المستخدمين في كتابة المقالات والبحث عن المعلومات.",
    },
  });
};

export const generateImage = async (prompt: string) => {
  const apiKey = getApiKey(true);
  if (!apiKey) throw new Error("مفتاح API لإنشاء الصور غير متوفر. يرجى إضافته في الإعدادات.");
  
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: MODELS.IMAGE,
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64Data = part.inlineData.data;
      const uid = auth.currentUser?.uid || 'anonymous';
      const storageRef = ref(storage, `users/${uid}/images/${Date.now()}.png`);
      await uploadString(storageRef, base64Data, 'base64');
      return await getDownloadURL(storageRef);
    }
  }
  throw new Error("لم يتم توليد صورة.");
};

export const generateFreeImage = async (prompt: string) => {
  const apiKey = getApiKey(false); // Use default environment key
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: MODELS.IMAGE,
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      const base64Data = part.inlineData.data;
      const uid = auth.currentUser?.uid || 'anonymous';
      const storageRef = ref(storage, `users/${uid}/images/${Date.now()}.png`);
      await uploadString(storageRef, base64Data, 'base64');
      return await getDownloadURL(storageRef);
    }
  }
  throw new Error("لم يتم توليد صورة مجانية. قد يتطلب هذا النموذج مفتاح API مدفوع.");
};

export const generateVideo = async (prompt: string) => {
  const apiKey = getApiKey(true);
  if (!apiKey) throw new Error("مفتاح API لإنشاء الفيديو غير متوفر. يرجى إضافته في الإعدادات.");
  
  const ai = new GoogleGenAI({ apiKey });

  let operation = await ai.models.generateVideos({
    model: MODELS.VIDEO,
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("لم يتم توليد فيديو.");

  const response = await fetch(downloadLink, {
    method: 'GET',
    headers: {
      'x-goog-api-key': apiKey!,
    },
  });

  const blob = await response.blob();
  const uid = auth.currentUser?.uid || 'anonymous';
  const storageRef = ref(storage, `users/${uid}/videos/${Date.now()}.mp4`);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
};
