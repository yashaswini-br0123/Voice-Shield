import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (apiKey && apiKey.trim() !== "") {
    try {
        genAI = new GoogleGenerativeAI(apiKey);
        console.log("Gemini AI Client initialized successfully.");
    } catch (e) {
        console.error("Failed to initialize Gemini AI Client:", e.message);
    }
} else {
    console.log("No GEMINI_API_KEY found. VoiceShield will run in Graceful Fallback (Mock Gemini) mode.");
}

/**
 * Generates a plain-language explanation of the model prediction.
 * Grounded strictly in the analysis metadata.
 */
export async function generateExplanation(result, language = "en") {
    const isSynthetic = result.classification === "synthetic";
    const prob = isSynthetic ? result.synthetic_probability : result.real_probability;
    const name = result.model_name;
    const version = result.model_version;
    const time = result.processing_time_ms;
    const confidence = result.confidence;
    const risk = result.risk_level;

    const basePrompt = `
    You are the VoiceShield cybersecurity explainable AI assistant.
    Explain the following model prediction of a voice sample scan to a system administrator.
    
    Prediction metadata:
    - Classification: ${result.classification}
    - Synthetic Voice Probability: ${result.synthetic_probability * 100}%
    - Real Voice Probability: ${result.real_probability * 100}%
    - Classification Confidence: ${confidence * 100}%
    - Risk Tier: ${risk}
    - Model Name: ${name}
    - Model Version: ${version}
    - Processing Time: ${time} ms
    
    Rules for response:
    1. Always state that this is a "model prediction" and not absolute truth. Use probabilistic language.
    2. Ground your explanation ONLY in the provided numerical data (probabilities, confidence, and processing time). Do NOT fabricate any acoustic analysis facts (e.g. do not invent pitch, frequencies, spectral anomalies, or noise levels unless they are specifically in the data, which they are not).
    3. Keep it brief, professional, and clear.
    4. Provide the response in the language specified: ${language === "hi" ? "Hindi" : language === "kn" ? "Kannada" : "English"}.
    `;

    if (!genAI) {
        return getFallbackExplanation(result, language);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const res = await model.generateContent(basePrompt);
        return res.response.text();
    } catch (e) {
        console.error("Gemini explanation generation failed, returning fallback:", e.message);
        return getFallbackExplanation(result, language);
    }
}

/**
 * Provides responses for the floating voice chatbot assistant.
 */
export async function chatAssistant(userMessage, systemContext, history = [], language = "en") {
    const systemInstruction = `
    You are the VoiceShield Security Assistant, an integrated AI guide for the VoiceShield platform.
    The current application state / active scan context is:
    ${JSON.stringify(systemContext)}
    
    Rules:
    1. Reiterate that VoiceShield relies on machine-learning classification models, and all scan outcomes are probabilistic predictions, not absolute proof of fraud or identity.
    2. If asked about the current analysis, explain it using ONLY the active scan context. Do not invent details.
    3. Offer advice on how to use the dashboard, upload scans, register voice prints, or handle security alerts.
    4. Under no circumstances should you claim to independently verify or analyze voice authenticity. You only report and explain the model's outputs.
    5. Be concise and conversational, suitable for text-to-speech reading.
    6. Respond in the user's input language (${language === "hi" ? "Hindi" : language === "kn" ? "Kannada" : "English"}).
    `;

    if (!genAI) {
        return getFallbackAssistantResponse(userMessage, systemContext, language);
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // Structure the history for Gemini API
        const contents = [
            { role: 'user', parts: [{ text: systemInstruction }] },
            { role: 'model', parts: [{ text: "Understood. I will act as the VoiceShield Assistant and adhere strictly to these safety rules." }] }
        ];

        // Append historical interactions
        for (const turn of history) {
            contents.push({
                role: turn.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: turn.text }]
            });
        }

        // Add latest query
        contents.push({ role: 'user', parts: [{ text: userMessage }] });

        const res = await model.generateContent({ contents });
        return res.response.text();
    } catch (e) {
        console.error("Gemini assistant conversation failed, returning fallback:", e.message);
        return getFallbackAssistantResponse(userMessage, systemContext, language);
    }
}

function getFallbackExplanation(result, language) {
    const isSynthetic = result.classification === "synthetic";
    const pct = Math.round((isSynthetic ? result.synthetic_probability : result.real_probability) * 100);
    const modelInfo = `${result.model_name} (v${result.model_version})`;
    
    if (language === "hi") {
        return `[ऑटो-जेनरेटेड स्पष्टीकरण] मॉडल ने इस ध्वनि को ${isSynthetic ? 'कृत्रिम (Synthetic)' : 'वास्तविक (Real)'} के रूप में वर्गीकृत किया है। इसकी संभावना ${pct}% है और मॉडल का आत्मविश्वास (Confidence) ${Math.round(result.confidence * 100)}% है। यह एक मॉडल पूर्वानुमान (Model Prediction) है, इसे अंतिम सत्य न मानें। विश्लेषण ${result.processing_time_ms} मिलीसेकंड में किया गया था।`;
    }
    if (language === "kn") {
        return `[ಸ್ವಯಂ-ರಚಿತ ವಿವರಣೆ] ಮಾದರಿಯು ಈ ಧ್ವನಿಯನ್ನು ${isSynthetic ? 'ಕೃತಕ (Synthetic)' : 'ನೈಜ (Real)'} ಎಂದು ವರ್ಗೀಕರಿಸಿದೆ. ಇದರ ಸಂಭವನೀಯತೆ ${pct}% ಮತ್ತು ಮಾದರಿಯ ವಿಶ್ವಾಸಾರ್ಹತೆ (Confidence) ${Math.round(result.confidence * 100)}% ಆಗಿದೆ. ಇದು ಮಾದರಿ ಮುನ್ಸೂಚನೆ (Model Prediction) ಮಾತ್ರ, ಅಂತಿಮ ಸತ್ಯವಲ್ಲ. ವಿಶ್ಲೇಷಣೆಯು ${result.processing_time_ms} ಮಿಲಿಸೆಕೆಂಡ್‌ಗಳಲ್ಲಿ ಪೂರ್ಣಗೊಂಡಿದೆ.`;
    }
    return `[System Explanation - Gemini Offline] The voice deepfake scanner ${modelInfo} analyzed the audio file and predicted with ${Math.round(result.confidence * 100)}% confidence that the sample is ${result.classification.toUpperCase()} speech (Real probability: ${Math.round(result.real_probability * 100)}%, Synthetic probability: ${Math.round(result.synthetic_probability * 100)}%). This prediction was completed in ${result.processing_time_ms} ms. Please treat this output as a probabilistic model prediction and not absolute proof.`;
}

function getFallbackAssistantResponse(message, context, language) {
    const lower = message.toLowerCase();
    
    if (language === "hi") {
        if (lower.includes("मदद") || lower.includes("सहायता")) {
            return "नमस्ते! मैं वॉयसशील्ड सहायक हूँ। मैं आपको वॉयस डीपफेक डिटेक्शन विश्लेषण, सुरक्षा डैशबोर्ड और आवाज पहचान सत्यापन को समझने में मदद कर सकता हूँ। कृपया ध्यान दें कि मेरे सभी परिणाम मॉडल पूर्वानुमान हैं।";
        }
        return `मुझे आपकी बात समझ आई। वॉयसशील्ड प्रणाली वर्तमान में ${context.classification === "none" ? "किसी सक्रिय स्कैन का संचालन नहीं कर रही है" : `स्कैन परिणाम: ${context.classification}`} की स्थिति में है। कृपया याद रखें कि यह विश्लेषण एक सांख्यिकीय मॉडल पूर्वानुमान है।`;
    }
    
    if (language === "kn") {
        if (lower.includes("ಸಹಾಯ") || lower.includes("ಮಾಹಿತಿ")) {
            return "ನಮಸ್ಕಾರ! ನಾನು ವಾಯ್ಸ್‌ಶೀಲ್ಡ್ ಸಹಾಯಕ. ವಾಯ್ಸ್ ಡೀಪ್‌ಫೇಕ್ ಪತ್ತೆಹಚ್ಚುವಿಕೆ, ಭದ್ರತಾ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಮತ್ತು ಧ್ವನಿ ಗುರುತು ಪರಿಶೀಲನೆಯನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಬಹುದು. ನೆನಪಿಡಿ, ನಮ್ಮ ಫಲಿತಾಂಶಗಳು ಕೇವಲ ಮಾದರಿ ಮುನ್ಸೂಚನೆಗಳಾಗಿವೆ.";
        }
        return `ನನಗೆ ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಅರ್ಥವಾಯಿತು. ವಾಯ್ಸ್‌ಶೀಲ್ಡ್ ಪ್ರಸ್ತುತ ${context.classification === "none" ? "ಯಾವುದೇ ಸಕ್ರಿಯ ಸ್ಕ್ಯಾನ್ ಹೊಂದಿಲ್ಲ" : `ಸ್ಕ್ಯಾನ್ ಫಲಿತಾಂಶ: ${context.classification}`} ಸ್ಥಿತಿಯಲ್ಲಿದೆ. ಈ ವಿಶ್ಲೇಷಣೆಯು ಸಂಖ್ಯಾಶಾಸ್ತ್ರೀಯ ಮಾದರಿ ಮುನ್ಸೂಚನೆ ಮಾತ್ರ ಎಂಬುದನ್ನು ದಯವಿಟ್ಟು ಗಮನಿಸಿ.`;
    }

    // English Default
    if (lower.includes("help") || lower.includes("how to") || lower.includes("what is")) {
        return "Hi there! I am the VoiceShield Security Assistant. I can explain scanned voice profiles, help you interpret the dashboard risk assessments, or guide you through registering a voice verification reference. Note that all scanner results are probabilistic model predictions.";
    }
    if (context && context.classification && context.classification !== "none") {
        return `I have reviewed the current file scan (${context.filename || "recorded audio"}). The model predicted the speech is ${context.classification.toUpperCase()} with ${Math.round(context.confidence * 100)}% confidence. This is a model prediction; please verify identity before executing sensitive instructions.`;
    }
    return "Hello! I am your VoiceShield Assistant. I can help interpret deepfake risk findings and explain the model's pipeline structure. How can I assist you today?";
}
