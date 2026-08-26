# VoiceShield Model Training Pipeline

This directory contains the pipeline scripts required to train a production-grade PyTorch audio deepfake/synthetic voice classifier. 

For development and demonstration purposes, VoiceShield runs on a mock model that mirrors the official model schema and structure. To train and swap in a real classifier, follow the steps below using the provided script templates.

## Dataset Recommendation: ASVspoof 2019/2021
We recommend training the model on the **ASVspoof 2019 Logical Access (LA)** dataset.
- **Genuine Speech**: Human speech recorded under various acoustic settings.
- **Synthetic Speech**: Speech synthesized using 17 different Text-to-Speech (TTS) and Voice Conversion (VC) algorithms (neural-net vocoders, classical models, wave-net, etc.).
- **URL**: [https://www.asvspoof.org/](https://www.asvspoof.org/)

Do NOT auto-download this dataset inside automated production scripts due to licensing and size restrictions (approx. 15GB).

---

## Training Pipeline Steps

### 1. Dataset Preparation (`prepare_dataset.py`)
Organizes your downloaded ASVspoof files and generates metadata splits (`train.txt`, `dev.txt`, `eval.txt`).
Format: `[FILE_NAME] [LABEL (genuine/spoof)] [ATTACK_ID]`

### 2. Preprocessing & Feature Extraction (`preprocess.py`)
Computes acoustic features (LFCCs, MFCCs, or CQCCs) using `librosa` or `torchaudio`. Saves feature arrays as serialized PyTorch tensors (`.pt`) or numpy objects for fast loading during training.

### 3. PyTorch Model Definition & Training (`train.py`)
Trains a Deep Neural Network (e.g., a Light CNN or ResNet) using PyTorch. 
- Input: 13-dimensional MFCCs (or spectral features)
- Output: 2-class probabilities (Real vs Synthetic)
- Saves model checkpoints (`voiceshield_best_weights.pt`) in the `models/` directory.

### 4. Evaluation & Metrics Verification (`evaluate.py`)
Validates model accuracy, Equal Error Rate (EER), and Area Under the ROC Curve (AUC). Generates confusion matrices.

---

## Swapping In Your Trained Model
Once training completes, copy the weights file `voiceshield_best_weights.pt` to the `ml-service/models/` folder and update `detector.py` to load this checkpoint:

```python
# In detector.py
torch_model.load_state_dict(torch.load("models/voiceshield_best_weights.pt", map_location=torch.device('cpu')))
```
