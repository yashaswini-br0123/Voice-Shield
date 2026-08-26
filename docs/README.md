# VoiceShield System Documentation Hub

Welcome to the VoiceShield documentation hub. VoiceShield is a production-grade cybersecurity web platform that audits audio samples to detect synthetic and cloned AI voice deepfakes.

## Directory Mapping

- [SETUP.md](file:///c:/Users/hvbr3/OneDrive/Desktop/website%20creation/Voice-Shield/docs/SETUP.md): Hardware, platform, environment variables, and execution guides.
- [ARCHITECTURE.md](file:///c:/Users/hvbr3/OneDrive/Desktop/website%20creation/Voice-Shield/docs/ARCHITECTURE.md): Structural data-flow pathways, pipeline diagrams, and ML feature representations.
- [API.md](file:///c:/Users/hvbr3/OneDrive/Desktop/website%20creation/Voice-Shield/docs/API.md): Comprehensive REST API request/response structures for both backend and ML microservices.

## Project Structure Overview

```
/Voice-Shield
│
├── package.json           # Workspace-wide launcher configs
├── voiceshield.db         # Persistent SQLite database (auto-generated)
│
├── frontend/              # Vite + React + TS + Tailwind Client
│   ├── src/
│   │   ├── App.tsx        # UI router and view panels
│   │   ├── index.css      # Core styles & Tailwind directives
│   │   └── localization.ts# English, Hindi, Kannada Translations
│   └── index.html         # Main entry page (SEO optimized)
│
├── backend/               # Node.js + Express API Gateway
│   ├── server.js          # REST routes, upload, and scheduler endpoints
│   ├── db.js              # SQLite wrapper & Repository patterns
│   ├── gemini.js          # Gemini generative AI integrations
│   └── pdfGenerator.js    # PDFKit Branded incident report compiler
│
└── ml-service/            # Python FastAPI ML Inference Node
    ├── main.py            # API routes and file buffer streams
    ├── detector.py        # PyTorch model structures and librosa extraction
    └── training/          # ASVspoof data training pipelines
```
