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

// Temporary upload folder
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration: 50MB max limit to handle video clips and audio files
const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * Endpoint: POST /api/analyze
 * Upload audio file for real acoustic AI deepfake classification.
 */
app.post('/api/analyze', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    const { notes } = req.body;
    const tempFilePath = req.file.path;

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('file', fileBlob, req.file.originalname);

        console.log(`Forwarding audio to ML Service at ${ML_SERVICE_URL}/analyze...`);
        const mlResponse = await fetch(`${ML_SERVICE_URL}/analyze`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) {
            const errText = await mlResponse.text();
            throw new Error(`ML Service responded with error ${mlResponse.status}: ${errText}`);
        }

        const mlData = await mlResponse.json();

        let recommendedAction = "";
        if (mlData.risk_level === "high") {
            recommendedAction = "CRITICAL WARNING: High probability of AI speech synthesis/cloning detected. DO NOT share passwords, OTPs, or sensitive business info. Verify caller via multi-factor authentication immediately.";
        } else if (mlData.risk_level === "medium") {
            recommendedAction = "WARNING: Moderate probability of acoustic anomalies/voice synthesis. Proceed with caution. Ask verification questions that only genuine speaker would know.";
        } else {
            recommendedAction = "SECURE: Acoustic profile matches typical genuine speech patterns. No immediate action required.";
        }

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
            recommended_action: recommendedAction
        };

        const lang = req.body.language || 'en';
        let explanationText = "";
        try {
            explanationText = await generateExplanation(incidentRecord, lang);
        } catch (geminiError) {
            console.error("Gemini explanation module error:", geminiError.message);
            explanationText = "Explanation module active. Acoustic spectral metrics recorded in system payload.";
        }

        incidentRecord.explanation = explanationText;
        await IncidentRepository.create(incidentRecord);

        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        return res.status(201).json(incidentRecord);

    } catch (error) {
        console.error("Server /api/analyze error:", error.message);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        return res.status(500).json({ error: `Audio analysis failed: ${error.message}` });
    }
});

/**
 * Endpoint: POST /api/video-analyze
 * Upload video file for YOLO object recognition & computer vision analysis.
 */
app.post('/api/video-analyze', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file uploaded.' });
    }

    const tempFilePath = req.file.path;

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('file', fileBlob, req.file.originalname);

        console.log(`Forwarding video to ML Service at ${ML_SERVICE_URL}/video-analyze...`);
        const mlResponse = await fetch(`${ML_SERVICE_URL}/video-analyze`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) {
            const errText = await mlResponse.text();
            throw new Error(`ML Service responded with error ${mlResponse.status}: ${errText}`);
        }

        const videoData = await mlResponse.json();

        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        return res.status(200).json(videoData);

    } catch (error) {
        console.error("Server /api/video-analyze error:", error.message);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        return res.status(500).json({ error: `Video YOLO analysis failed: ${error.message}` });
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
        const refBlob = new Blob([refBuffer], { type: req.file ? req.file.mimetype : 'audio/wav' });
        formData.append('reference', refBlob, refFile.originalname);

        const testBuffer = fs.readFileSync(testFile.path);
        const testBlob = new Blob([testBuffer], { type: testFile.mimetype });
        formData.append('test', testBlob, testFile.originalname);

        const mlResponse = await fetch(`${ML_SERVICE_URL}/compare`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) {
            const errText = await mlResponse.text();
            throw new Error(`ML Service responded with error ${mlResponse.status}: ${errText}`);
        }

        const mlData = await mlResponse.json();

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
 */
app.get('/api/incidents', async (req, res) => {
    try {
        const list = await IncidentRepository.list({});
        return res.status(200).json(list);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/incidents/:id
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
 */
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await IncidentRepository.getStats({});
        return res.status(200).json(stats);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * Endpoint: GET /api/incidents/:id/report
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

// Start Server
app.listen(PORT, () => {
    console.log(`VoiceShield Express server running on port ${PORT}`);
});
