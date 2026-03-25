from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import pickle
import re
import numpy as np

# -----------------------------
# Initialize App
# -----------------------------
app = FastAPI(
    title="AI Emergency Communication Prioritization",
    description="Classifies disaster messages into priority levels",
    version="1.0"
)

# -----------------------------
# Enable CORS (for frontend)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Load Model & Vectorizer
# -----------------------------
try:
    model = pickle.load(open("model.pkl", "rb"))
    vectorizer = pickle.load(open("vectorizer.pkl", "rb"))
except Exception as e:
    print("Error loading model:", e)
    model = None
    vectorizer = None

# -----------------------------
# Priority Mapping (optional use)
# -----------------------------
PRIORITY_RANK = {
    "critical": 4,
    "urgent": 3,
    "medium": 2,
    "low": 1
}

# -----------------------------
# Preprocessing Function
# -----------------------------
def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^a-z\s]', '', text)
    return text.strip()

# -----------------------------
# Health Check Endpoint
# -----------------------------
@app.get("/")
def home():
    return {
        "status": "API running",
        "model_loaded": model is not None
    }

# -----------------------------
# Prediction Endpoint
# -----------------------------
@app.get("/predict")
def predict(msg: str = Query(..., description="Emergency message")):

    if not model or not vectorizer:
        return {"error": "Model not loaded properly"}

    # Step 1: Clean text
    cleaned = clean_text(msg)

    # Step 2: Vectorize
    vector = vectorizer.transform([cleaned])

    # Step 3: Predict
    prediction = model.predict(vector)[0]

    # Step 4: Confidence score
    probabilities = model.predict_proba(vector)
    confidence = float(np.max(probabilities))

    # Step 5: Response
    return {
        "message": msg,
        "cleaned_message": cleaned,
        "priority": prediction,
        "confidence": round(confidence, 3)
    }

# -----------------------------
# Batch Prediction (Optional Feature)
# -----------------------------
@app.post("/predict_batch")
def predict_batch(messages: list[str]):

    if not model or not vectorizer:
        return {"error": "Model not loaded properly"}

    cleaned_msgs = [clean_text(msg) for msg in messages]
    vectors = vectorizer.transform(cleaned_msgs)

    predictions = model.predict(vectors)
    probabilities = model.predict_proba(vectors)

    results = []

    for i, msg in enumerate(messages):
        results.append({
            "message": msg,
            "priority": predictions[i],
            "confidence": round(float(np.max(probabilities[i])), 3)
        })

    return {"results": results}