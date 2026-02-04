
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

export class GeminiClient {
    private static instance: GeminiClient;
    private model: GenerativeModel;

    private constructor(apiKey: string) {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Use gemini-1.5-flash for speed and free tier availability
        this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    public static getInstance(): GeminiClient | null {
        if (!GeminiClient.instance) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.warn("GEMINI_API_KEY is not set globally.");
                return null;
            }
            GeminiClient.instance = new GeminiClient(apiKey);
        }
        return GeminiClient.instance;
    }

    /**
     * Generates a JSON response ensuring valid JSON output.
     * Useful for replacing OpenAI's strict JSON mode.
     */
    public async generateJSON<T>(prompt: string, systemInstruction?: string): Promise<T> {
        try {
            const fullPrompt = `${systemInstruction ? 'System: ' + systemInstruction + '\n\n' : ''}${prompt}\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown formatting like \`\`\`json.`;

            const result = await this.model.generateContent(fullPrompt);
            const response = await result.response;
            let text = response.text();

            // cleanup markdown if Gemini adds it despite instructions
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(text) as T;
        } catch (error) {
            console.error("Gemini JSON Generation Error:", error);
            throw error;
        }
    }

    public async generateText(prompt: string): Promise<string> {
        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error("Gemini Text Generation Error:", error);
            throw error;
        }
    }
}
