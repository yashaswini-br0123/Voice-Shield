# VoiceShield Systems Architecture

This document describes the system architecture and internal data-flow structures of the VoiceShield Deepfake Detection Platform.

## System Topology & Flow

The system uses a decoupled microservices architecture to process voice samples:

```
[AUDIO UPLOAD / RECORD] 
         │
         ▼
 ┌───────────────┐
 │ React Client  │ ◄─── (Multilingual English/Hindi/Kannada UI)
 └───────┬───────┘
         │ (HTTP Multipart Upload / JSON requests)
         ▼
 ┌───────────────┐
 │ Express API   │ ◄─── (SQLite Database Logs & Audit Trails)
 └───────┬───────┘
         ├───────────────────────────────┐
         │ (Temporary WAV forward)       │ (JSON payload context)
         ▼                               ▼
 ┌───────────────┐               ┌───────────────┐
 │  FastAPI ML   │               │  Gemini API   │
 └───────┬───────┘               └───────┬───────┘
         │ (PyTorch MFCC Forward)        │ (Explainable Summary Narrative)
         ▼                               ▼
 [Synthetic / Real Prob] ────────► [Action Checklists & Logs PDF]
```

---

## 1. Frontend Layer (`/frontend`)
- **Core Technology**: React v18 + TypeScript + Vite.
- **Styling**: Tailwind CSS v3 with a slate-950 dark theme.
- **Telemetry Charts**: Recharts plotting area latencies and risk ratios.
- **Input Controllers**: Custom Web Audio API recorders compiling inline WAV blobs; standard file drop elements.
- **multilingual Module**: Client-side dictionary mapping text elements, supporting English, Hindi, and Kannada.

---

## 2. Backend Gateway (`/backend`)
- **Express Server**: Handles routing, schema validations, and uploads.
- **Multer Middleware**: Accepts file packages up to 10MB. Validates MIME audio boundaries.
- **Privacy Core**: Temporarily buffers files to a volatile folder (`/temp_uploads`) and purges them immediately upon feature compilation.
- **SQLite Database**: A persistent database file (`voiceshield.db`) containing:
  - `incidents`: scan metadata log history.
  - `voice_references`: registered reference voice configurations.
- **Gemini Service**: Handles generative explainable AI requests and security chatbot queries.

---

## 3. Machine Learning Microservice (`/ml-service`)
- **FastAPI Core**: A high-performance Python ASGI web service.
- **Features Extractor (librosa)**: Converts incoming audio files to mono at 16kHz and computes average 13-dimensional Mel-Frequency Cepstral Coefficients (MFCCs).
- **Classification Engine (PyTorch)**: Feedforward classifier mapping feature matrices to `[real, synthetic]` probability matrices.
- **ASVspoof Training Hooks (`/training`)**: Scripts indicating how to ingest ASVspoof logical access datasets, compile LFCC/MFCC representations, and output best weights file.
