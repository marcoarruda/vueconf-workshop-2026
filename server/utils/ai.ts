import { GoogleGenAI } from "@google/genai";

const config = useRuntimeConfig();

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export default ai;
