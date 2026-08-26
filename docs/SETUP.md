# VoiceShield Deployment & Setup Guide

This document provides step-by-step instructions on setting up, configuring, and launching the VoiceShield Cybersecurity Deepfake Voice Detection Platform on Windows.

## Prerequisites

Before starting, ensure you have the following installed on your machine:
1. **Node.js** (v18.0.0 or higher) & `npm`
2. **Python** (v3.8 or higher) & `pip`
3. **Git** (optional)

---

## 1. Fast Launch (Concurrent Script Orchestration)

We have configured a root-level script package that handles installations and boots up all dev instances concurrently.

### Step 1.1: Install all workspace dependencies
Run the following in the root folder (`/Voice-Shield`):
```powershell
npm run install:all
```
This script runs `npm install` in the root, `/backend`, and `/frontend` folders automatically.

### Step 1.2: Activate Python ML environment
1. Create a virtual environment inside `/ml-service`:
   ```powershell
   cd ml-service
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
2. Install Python requirements:
   ```powershell
   pip install -r requirements.txt
   ```

### Step 1.3: Start All Services Concurrently
From the root folder (`/Voice-Shield`), launch the concurrent dev script:
```powershell
npm run dev
```
This executes:
- **Express Backend** at [http://localhost:5000](http://localhost:5000)
- **FastAPI ML Service** at [http://localhost:8000](http://localhost:8000)
- **Vite React Frontend** at [http://localhost:5173](http://localhost:5173) (or next available port)

---

## 2. Independent Manual Boot

If you prefer starting each service individually, open three shell windows and run:

### Terminal 1: Python FastAPI ML Service
```powershell
cd ml-service
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload --port 8000
```

### Terminal 2: Node.js Express Backend
```powershell
cd backend
# Create and edit .env with your GEMINI_API_KEY
npm run dev
```

### Terminal 3: Vite React Client
```powershell
cd frontend
npm run dev
```

---

## 3. Gemini API Key Configuration

To enable high-fidelity explainable AI summaries and conversational security assistant capabilities:
1. Open [backend/.env](file:///c:/Users/hvbr3/OneDrive/Desktop/website%20creation/Voice-Shield/backend/.env)
2. Add your Gemini developer key:
   ```env
   GEMINI_API_KEY=your_key_here
   ```
If the key is not set, VoiceShield degrades gracefully by using pre-coded static rule summaries. No client-side key leaks occur as keys are evaluated server-side.
