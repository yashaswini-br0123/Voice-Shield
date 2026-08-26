import os
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

# Import our detector logic
from detector import analyze_audio_file, compare_voices, MODEL_NAME, MODEL_VERSION, HAS_ML_DEPS

app = FastAPI(
    title="VoiceShield ML Service",
    description="Microservice for audio feature extraction and AI voice deepfake classification.",
    version="0.1.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "ml_dependencies_available": HAS_ML_DEPS
    }

@app.post("/analyze")
async def analyze_audio(
    file: UploadFile = File(...),
    scenario: Optional[str] = Form(None),
    x_scenario: Optional[str] = Header(None, alias="X-VoiceShield-Scenario")
):
    """
    Analyzes an uploaded audio file for synthetic speech patterns.
    Optionally accepts a 'scenario' parameter (via form field or headers) 
    to force specific classification outputs in Demo/Prototype Mode.
    """
    # Accept header override or form override
    active_scenario = scenario or x_scenario

    # Create a temporary file to store the upload
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        try:
            # Write contents to temporary file
            shutil.copyfileobj(file.file, temp_file)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    try:
        # Run analysis
        result = analyze_audio_file(temp_path, force_scenario=active_scenario)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}")
    finally:
        # Ensure temporary file cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/compare")
async def compare_audio(
    reference: UploadFile = File(...),
    test: UploadFile = File(...)
):
    """
    Compares a registered reference audio file with an incoming voice sample.
    Calculates Voice Identity Match score and Synthetic Voice Risk rating.
    """
    suffix_ref = os.path.splitext(reference.filename)[1] or ".wav"
    suffix_test = os.path.splitext(test.filename)[1] or ".wav"

    temp_ref_path = None
    temp_test_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix_ref) as tr:
            temp_ref_path = tr.name
            shutil.copyfileobj(reference.file, tr)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix_test) as tt:
            temp_test_path = tt.name
            shutil.copyfileobj(test.file, tt)

        # Run comparison
        result = compare_voices(temp_ref_path, temp_test_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice comparison failed: {e}")
    finally:
        # Cleanup
        if temp_ref_path and os.path.exists(temp_ref_path):
            os.remove(temp_ref_path)
        if temp_test_path and os.path.exists(temp_test_path):
            os.remove(temp_test_path)
