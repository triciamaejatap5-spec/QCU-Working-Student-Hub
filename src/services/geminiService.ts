import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateSummary(lessonTitle: string, content: string, length: string = 'short', audience: string = 'university') {
  try {
    let wordCount = 'under 100 words';
    if (length === 'medium') wordCount = 'around 200 words';
    if (length === 'long') wordCount = 'around 400 words';

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Summarize this lesson for a working student commuting. Keep it ${length} (${wordCount}). Target audience: ${audience} level. Lesson: ${lessonTitle}. Content: ${content}`,
    });
    return response.text;
  } catch (error) {
    console.error("Error generating summary:", error);
    return "Could not generate summary at this time.";
  }
}

export async function generateQuiz(lessonTitle: string, content: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate 3 multiple choice questions for a quiz about ${lessonTitle} based on the following content: ${content}. Return as JSON array of objects with 'question', 'options' (array of 4), 'correctIndex' (0-3), and 'explanation' (a brief explanation of why the answer is correct).`,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error generating quiz:", error);
    return [];
  }
}

export async function generateFlashcards(lessonTitle: string, content: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Extract 5 to 10 key terms and their definitions from the following educational content about ${lessonTitle}. Return the result as a JSON array of objects, where each object has a 'term' string and a 'definition' string. Content: ${content}`,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error generating flashcards:", error);
    return [];
  }
}

export async function defineWord(word: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide a concise definition and one example sentence for the word or concept: "${word}". Format as JSON with 'definition' and 'example' fields.`,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error defining word:", error);
    return { definition: "Definition unavailable.", example: "" };
  }
}

export async function chatWithTutor(messages: {role: string, text: string}[], context: string) {
  try {
    const history = messages.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a helpful study tutor for a working student. Use this context if relevant: ${context}.\n\nConversation history:\n${history}\n\nTutor:`,
    });
    return response.text;
  } catch (error) {
    console.error("Error in AI tutor chat:", error);
    return "I'm having trouble connecting right now. Let's try again in a moment!";
  }
}

export async function generateSpeech(text: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    return null;
  }
}
