import os
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Import detector modules
from detector import analyze_audio_file, compare_voices, MODEL_NAME, MODEL_VERSION, HAS_ML_DEPS
from video_detector import analyze_video_file, analyze_image_file

app = FastAPI(
    title="VoiceShield Enterprise ML Service",
    description="Microservice for audio deepfake classification, YOLO image recognition, and YOLO video object detection.",
    version="2.2.0"
)

# Enable CORS
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
        "audio_model": MODEL_NAME,
        "vision_model": "YOLO11 / YOLO26 Vision Engine",
        "version": MODEL_VERSION,
        "ml_dependencies_available": HAS_ML_DEPS
    }

@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        try:
            shutil.copyfileobj(file.file, temp_file)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")

    try:
        result = analyze_audio_file(temp_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio deepfake analysis failed: {e}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/image-analyze")
async def analyze_image(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        try:
            shutil.copyfileobj(file.file, temp_file)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded image file: {e}")

    try:
        result = analyze_image_file(temp_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image YOLO analysis failed: {e}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/video-analyze")
async def analyze_video(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        try:
            shutil.copyfileobj(file.file, temp_file)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded video file: {e}")

    try:
        result = analyze_video_file(temp_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video YOLO analysis failed: {e}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/compare")
async def compare_audio(
    reference: UploadFile = File(...),
    test: UploadFile = File(...)
):
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

        result = compare_voices(temp_ref_path, temp_test_path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Voice comparison failed: {e}")
    finally:
        if temp_ref_path and os.path.exists(temp_ref_path):
            os.remove(temp_ref_path)
        if temp_test_path and os.path.exists(temp_test_path):
            os.remove(temp_test_path)
