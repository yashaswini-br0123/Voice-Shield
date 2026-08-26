import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Import services and repositories
import { IncidentRepository, VoiceReferenceRepository } from './db.js';
import { generateExplanation, chatAssistant } from './gemini.js';
import { generateIncidentPDF } from './pdfGenerator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Middlewares
app.use(cors());
app.use(express.json());

// Set up temporary upload folder (not permanent storage - cleaned after processing)
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration: 10MB max, limit formats to audio
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/ogg', 'audio/webm'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(wav|mp3|m4a|ogg|webm)$/i)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only WAV, MP3, M4A, OGG, and WEBM audio formats are supported.'), false);
    }
};

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
    fileFilter: fileFilter
});

/**
 * Endpoint: POST /api/analyze
 * Upload audio file for deepfake and cloning analysis.
 */
app.post('/api/analyze', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const { notes, scenario, isDemo } = req.body;
    const isDemoMode = isDemo === 'true' || isDemo === true;
    const tempFilePath = req.file.path;

    try {
        // Build FormData to forward to the Python FastAPI ML Service
        const formData = new FormData();
        
        // Load the file as a Blob to attach to fetch
        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('file', fileBlob, req.file.originalname);
        
        if (scenario) {
            formData.append('scenario', scenario);
        }

        console.log(`Forwarding audio to ML Service at ${ML_SERVICE_URL}/analyze...`);
        const mlResponse = await fetch(`${ML_SERVICE_URL}/analyze`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-VoiceShield-Scenario': scenario || ''
            }
        });

        if (!mlResponse.ok) {
            const errText = await mlResponse.text();
            throw new Error(`ML Service responded with error ${mlResponse.status}: ${errText}`);
        }

        const mlData = await mlResponse.json();

        // 1. Assign fixed pre-defined recommendations based on risk tiers
        let recommendedAction = "";
        if (mlData.risk_level === "high") {
            recommendedAction = "CRITICAL WARNING: High probability of AI speech synthesis/cloning detected. DO NOT share passwords, OTPs, or sensitive business info. DO NOT transfer funds or execute financial commands. Verify the caller via a pre-arranged physical or second-channel security password immediately.";
        } else if (mlData.risk_level === "medium") {
            recommendedAction = "WARNING: Moderate probability of audio anomalies/voice synthesis. Proceed with caution. Ask verification questions that only the genuine speaker would know, and verify identity through an alternative secure channel.";
        } else {
            recommendedAction = "SECURE: Auditory profile matches typical genuine speech patterns. No immediate action required. Continue standard compliance procedures.";
        }

        // 2. Build incident record
        const incidentId = uuidv4();
        const incidentRecord = {
            id: incidentId,
            timestamp: Date.now(),
            filename: req.file.originalname,
            result: mlData.classification,
            synthetic_probability: mlData.synthetic_probability,
            real_probability: mlData.real_probability,
            confidence: mlData.confidence,
            risk_level: mlData.risk_level,
            model_name: mlData.model_name,
            model_version: mlData.model_version,
            processing_time_ms: mlData.processing_time_ms,
            notes: notes || '',
            is_demo: isDemoMode,
            recommended_action: recommendedAction
        };

        // If Demo mode, append demo tags to explanation and output
        const demoPrefix = isDemoMode ? "[DEMO RESULT — NOT A VALIDATED MODEL PREDICTION] " : "";
        if (isDemoMode) {
            incidentRecord.notes = `${demoPrefix}${incidentRecord.notes}`;
        }

        // 3. Generate Explainable AI Explanation with Gemini (degrades gracefully)
        const lang = req.body.language || 'en';
        let explanationText = "";
        try {
            explanationText = await generateExplanation(incidentRecord, lang);
            if (isDemoMode) {
                explanationText = `${demoPrefix}${explanationText}`;
            }
        } catch (geminiError) {
            console.error("Gemini explanation module error:", geminiError.message);
            explanationText = "Explanation module offline. Scan details are fully recorded in the metadata.";
        }

        incidentRecord.explanation = explanationText;

        // 4. Save to Database
        await IncidentRepository.create(incidentRecord);

        // 5. Clean up temporary audio upload file immediately (Privacy guard)
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        return res.status(201).json(incidentRecord);

    } catch (error) {
        console.error("Server /api/analyze error:", error.message);
        
        // Ensure cleanup of temp file even on error
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        return res.status(500).json({ error: `Audio analysis failed: ${error.message}` });
    }
});

/**
 * Endpoint: POST /api/verify
 * Compares reference voice print with incoming voice scan.
 */
app.post('/api/verify', upload.fields([
    { name: 'reference', maxCount: 1 },
    { name: 'test', maxCount: 1 }
]), async (req, res) => {
    if (!req.files || !req.files['reference'] || !req.files['test']) {
        return res.status(400).json({ error: 'Both reference and test audio files must be uploaded.' });
    }

    const refFile = req.files['reference'][0];
    const testFile = req.files['test'][0];

    try {
        const formData = new FormData();

        const refBuffer = fs.readFileSync(refFile.path);
        const refBlob = new Blob([refBuffer], { type: refFile.mimetype });
        formData.append('reference', refBlob, refFile.originalname);

        const testBuffer = fs.readFileSync(testFile.path);
        const testBlob = new Blob([testBuffer], { type: testFile.mimetype });
        formData.append('test', testBlob, testFile.originalname);

        console.log(`Forwarding comparison request to ML Service...`);
        const mlResponse = await fetch(`${ML_SERVICE_URL}/compare`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) {
            const errText = await mlResponse.text();
            throw new Error(`ML Service responded with error ${mlResponse.status}: ${errText}`);
        }

        const mlData = await mlResponse.json();

        // Cleanup temporary files immediately (Privacy Guard)
        if (fs.existsSync(refFile.path)) fs.unlinkSync(refFile.path);
        if (fs.existsSync(testFile.path)) fs.unlinkSync(testFile.path);

        return res.status(200).json(mlData);

    } catch (error) {
        console.error("Server /api/verify error:", error.message);
        
        if (fs.existsSync(refFile.path)) fs.unlinkSync(refFile.path);
        if (fs.existsSync(testFile.path)) fs.unlinkSync(testFile.path);

        return res.status(500).json({ error: `Voice verification failed: ${error.message}` });
    }
});

/**
 * Endpoint: POST /api/register-voice
 * Store a trusted voice print metadata (name and placeholder path)
 */
app.post('/api/register-voice', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Audio file is required for voice registration.' });
    }
    const { name } = req.body;
    if (!name) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Name is required to register voice.' });
    }

    try {
        const id = uuidv4();
        // For security, we might store the path, but standard implementation 
        // doesn't persist raw audio indefinitely. We copy it to a references directory.
        const refDir = path.join(__dirname, 'references');
        if (!fs.existsSync(refDir)) {
            fs.mkdirSync(refDir, { recursive: true });
        }
        
        const fileExt = path.extname(req.file.originalname) || '.wav';
        const permanentPath = path.join(refDir, `${id}${fileExt}`);
        fs.renameSync(req.file.path, permanentPath);

        const refObj = await VoiceReferenceRepository.register(id, name, permanentPath);
        return res.status(201).json(refObj);

    } catch (error) {
        console.error("Voice registration failed:", error.message);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: `Registration failed: ${error.message}` });
    }
});

/**
 * Endpoint: GET /api/references
 * List registered voice prints.
 */
app.get('/api/references', async (req, res) => {
    try {
        const references = await VoiceReferenceRepository.list();
        return res.status(200).json(references);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/incidents
 * Get log history.
 */
app.get('/api/incidents', async (req, res) => {
    const includeDemo = req.query.includeDemo !== 'false';
    try {
        const list = await IncidentRepository.list({ includeDemo });
        return res.status(200).json(list);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/incidents/:id
 * Get single log file.
 */
app.get('/api/incidents/:id', async (req, res) => {
    try {
        const item = await IncidentRepository.getById(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Incident not found' });
        }
        return res.status(200).json(item);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: DELETE /api/incidents/:id
 * Delete incident log and purge audio metadata.
 */
app.delete('/api/incidents/:id', async (req, res) => {
    try {
        const success = await IncidentRepository.delete(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Incident not found' });
        }
        return res.status(200).json({ message: 'Incident record purged successfully.' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/dashboard/stats
 * Aggregated metric counts.
 */
app.get('/api/dashboard/stats', async (req, res) => {
    const includeDemo = req.query.includeDemo !== 'false';
    try {
        const stats = await IncidentRepository.getStats({ includeDemo });
        return res.status(200).json(stats);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/incidents/:id/report
 * Streams the exportable cyber investigation report PDF.
 */
app.get('/api/incidents/:id/report', async (req, res) => {
    try {
        const item = await IncidentRepository.getById(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Incident not found' });
        }
        generateIncidentPDF(item, res);
    } catch (error) {
        console.error("PDF generation failed:", error.message);
        return res.status(500).json({ error: `Report generation failed: ${error.message}` });
    }
});

/**
 * Endpoint: POST /api/assistant
 * Handles dialogue for floating Gemini chatbot.
 */
app.post('/api/assistant', async (req, res) => {
    const { message, context, history, language } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'Message query is required.' });
    }
    try {
        const responseText = await chatAssistant(message, context || {}, history || [], language || 'en');
        return res.status(200).json({ response: responseText });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/tts
 * Generates a mock TTS speech wave for the chatbot audio reader (graceful backend fallback).
 */
app.get('/api/tts', (req, res) => {
    const text = req.query.text || 'Greeting from VoiceShield.';
    
    // We create a tiny, lightweight valid 1-second WAV buffer representing a synthesized beep/acknowledgement tone 
    // to act as a backend audio response fallback, while the frontend mainly utilizes 
    // the native high-fidelity window.speechSynthesis.
    const buffer = Buffer.alloc(44);
    
    // Write simple WAV PCM header
    buffer.write('RIFF', 0); // ChunkID
    buffer.writeUInt32LE(36 + 2000, 4); // ChunkSize
    buffer.write('WAVE', 8); // Format
    buffer.write('fmt ', 12); // Subchunk1ID
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    buffer.writeUInt16LE(1, 22); // NumChannels (Mono)
    buffer.writeUInt32LE(8000, 24); // SampleRate (8000 Hz)
    buffer.writeUInt32LE(8000, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
    buffer.writeUInt16LE(1, 32); // BlockAlign
    buffer.writeUInt16LE(8, 34); // BitsPerSample
    buffer.write('data', 36); // Subchunk2ID
    buffer.writeUInt32LE(2000, 40); // Subchunk2Size

    res.setHeader('Content-Type', 'audio/wav');
    res.send(buffer);
});

// Start Server
app.listen(PORT, () => {
    console.log(`VoiceShield Express server running on port ${PORT}`);
});
