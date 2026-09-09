import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

import { IncidentRepository, VoiceReferenceRepository } from './db.js';
import { generateExplanation, chatAssistant } from './gemini.js';
import { generateIncidentPDF } from './pdfGenerator.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * POST /api/analyze — Audio Deepfake Scan
 */
app.post('/api/analyze', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });
    const { notes } = req.body;
    const tempFilePath = req.file.path;

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('file', fileBlob, req.file.originalname);

        const mlResponse = await fetch(`${ML_SERVICE_URL}/analyze`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) throw new Error(`ML Service error ${mlResponse.status}`);
        const mlData = await mlResponse.json();

        let recommendedAction = mlData.risk_level === "high"
            ? "CRITICAL WARNING: High probability of AI speech synthesis detected. Request multi-factor auth callback."
            : "SECURE: Voice sample matches typical human vocal profile.";

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

        try {
            incidentRecord.explanation = await generateExplanation(incidentRecord, req.body.language || 'en');
        } catch {
            incidentRecord.explanation = "Acoustic spectral metrics recorded in system audit log.";
        }

        await IncidentRepository.create(incidentRecord);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(201).json(incidentRecord);

    } catch (error) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(500).json({ error: `Audio analysis failed: ${error.message}` });
    }
});

/**
 * POST /api/image-analyze — Image Recognition (YOLO)
 */
app.post('/api/image-analyze', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
    const tempFilePath = req.file.path;

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('file', fileBlob, req.file.originalname);

        const mlResponse = await fetch(`${ML_SERVICE_URL}/image-analyze`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) throw new Error(`ML Service error ${mlResponse.status}`);
        const imageData = await mlResponse.json();

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(200).json(imageData);

    } catch (error) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(500).json({ error: `Image YOLO analysis failed: ${error.message}` });
    }
});

/**
 * POST /api/video-analyze — Video Recognition (YOLO)
 */
app.post('/api/video-analyze', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
    const tempFilePath = req.file.path;

    try {
        const formData = new FormData();
        const fileBuffer = fs.readFileSync(tempFilePath);
        const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
        formData.append('file', fileBlob, req.file.originalname);

        const mlResponse = await fetch(`${ML_SERVICE_URL}/video-analyze`, {
            method: 'POST',
            body: formData
        });

        if (!mlResponse.ok) throw new Error(`ML Service error ${mlResponse.status}`);
        const videoData = await mlResponse.json();

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(200).json(videoData);

    } catch (error) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(500).json({ error: `Video YOLO analysis failed: ${error.message}` });
    }
});

app.post('/api/verify', upload.fields([
    { name: 'reference', maxCount: 1 },
    { name: 'test', maxCount: 1 }
]), async (req, res) => {
    if (!req.files || !req.files['reference'] || !req.files['test']) {
        return res.status(400).json({ error: 'Both reference and test audio files required.' });
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

        const mlResponse = await fetch(`${ML_SERVICE_URL}/compare`, { method: 'POST', body: formData });
        if (!mlResponse.ok) throw new Error();
        const mlData = await mlResponse.json();

        if (fs.existsSync(refFile.path)) fs.unlinkSync(refFile.path);
        if (fs.existsSync(testFile.path)) fs.unlinkSync(testFile.path);
        return res.status(200).json(mlData);

    } catch (error) {
        if (fs.existsSync(refFile.path)) fs.unlinkSync(refFile.path);
        if (fs.existsSync(testFile.path)) fs.unlinkSync(testFile.path);
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/incidents', async (req, res) => {
    try {
        const list = await IncidentRepository.list({});
        return res.status(200).json(list);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await IncidentRepository.getStats({});
        return res.status(200).json(stats);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/assistant', async (req, res) => {
    const { message, context, history, language } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required.' });
    try {
        const responseText = await chatAssistant(message, context || {}, history || [], language || 'en');
        return res.status(200).json({ response: responseText });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`VoiceShield Express server running on port ${PORT}`);
});
