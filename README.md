---
title: Talos.ai
emoji: 🚦
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Talos.ai 🚦
### Traffic Analysis, Learning and Optimization System

Talos.ai is a state-of-the-art event-driven traffic command and resource optimization platform designed for the Bengaluru City Traffic Police. Built on a hybrid architecture of machine learning and spatial network routing, Talos.ai predicts, visualizes, and mitigates urban gridlocks before they impact the city.

---

## 🌟 Key Features

*   **Dynamic Diversion Generator**: Simulates road closures, adverse weather (rain), and peak hour conditions to calculate alternative routing pathways using network distance heuristics.
*   **Intelligent Deployment Engine**: Auto-allocates field officers using a priority-driven assignment model. Features a **Swarm Protocol** to dynamically pull reinforcement units from neighboring stations when a deficit is detected.
*   **AI Action Plan Generator**: Generates field-ready tactical action plans using OpenRouter models (including `openai/gpt-oss-120b:free` and `google/gemma-4-26b-a4b-it:free`) with multi-model fallback resiliency.
*   **Event Planner & Feedback Loop**: Schedules major public events, projects attendee traffic impact, and logs real-world outcomes back into the system to trigger model retraining.
*   **Smart Escalation Incident Reporting**: Logs field incidents with automatic urgency grading based on severity, age, and geographical clustering.
*   **Explainable AI & Performance Analytics**: Displays charts of incident distribution, average clearance rates, and logs detailed model deviations to calibrate predictions.

---

## 🛠️ Technology Stack

*   **Frontend**: React (v18), Vite, Lucide Icons, Leaflet Maps, Tailwind CSS (Vanilla utilities).
*   **Backend**: Python (v3.10), FastAPI, Uvicorn.
*   **Spatial & ML Core**: OSmnx (graph logic), NetworkX (shortest path routing), Pandas, Scikit-learn (Random Forest & Gradient Boosting regression pipelines).
*   **Containerization**: Multi-stage Docker configuration running Nginx and FastAPI concurrently.

---

## 🚀 Local Setup

### 1. Configure Environment Variables
To keep credentials secure, create a `.env` file in the root directory (and/or inside the `backend/` directory) and add your configurations:

```env
# Supabase API credentials
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# OpenRouter API Key for AI action plan generation
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### 2. Run with Docker Compose (Recommended)
Make sure you have [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed on your machine, then run:

```bash
docker compose up --build
```
*   **Frontend Web App**: accessible at `http://localhost`
*   **FastAPI backend API Docs**: accessible at `http://localhost:8000/docs`

---

### 3. Run Manually (Without Docker)

#### Frontend Setup:
```bash
# Install dependencies
npm install -D @types/leaflet --legacy-peer-deps
npm install

# Run Vite dev server
npm run dev
```

#### Backend Setup:
Ensure you have Python 3.10 installed on your system.
```bash
# Activate virtual environment
./venv/Scripts/activate

# Install requirements
cd backend
pip install -r requirements.txt

# Start backend server
uvicorn main:app --reload
```

---

## 🌐 Cloud Deployment (Hugging Face Spaces)

This repository is optimized to run as a Docker SDK Space on Hugging Face (preferably deployed in the **EU (Europe)** region to support free-tier CPU availability).

### Adding Secrets in Hugging Face
To enable database integration and AI features on your live cloud space, configure the following secrets in your Space Settings:

1. Go to your Hugging Face Space settings.
2. Scroll down to the **Variables and secrets** section.
3. Click **New secret** to add:
   *   **Name**: `VITE_SUPABASE_URL` | **Value**: `<your-supabase-url>`
   *   **Name**: `VITE_SUPABASE_ANON_KEY` | **Value**: `<your-supabase-anon-key>`
   *   **Name**: `OPENROUTER_API_KEY` | **Value**: `<your-openrouter-api-key>`
4. Restart or rebuild the Space to apply changes.
