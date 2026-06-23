# Talos.ai 🚦

### Traffic Analysis, Learning and Optimization System

## 🚀 Live Demo

**Try the application here:**
https://avik28-talos-ai.hf.space/

> Experience Talos.ai in action by exploring real-time traffic simulations, intelligent resource deployment, AI-powered action plans, and event-driven congestion management.

---

## 🌟 Overview

Talos.ai is a state-of-the-art event-driven traffic command and resource optimization platform designed for the Bengaluru City Traffic Police. Built on a hybrid architecture of machine learning and spatial network routing, Talos.ai predicts, visualizes, and mitigates urban gridlocks before they impact the city.

The platform combines predictive analytics, traffic simulation, intelligent resource allocation, and AI-assisted decision support to help authorities proactively manage urban congestion.

---

## 🌟 Key Features

### Dynamic Diversion Generator

Simulates road closures, adverse weather conditions, and peak-hour traffic to generate optimized alternate routing strategies using spatial network analysis.

### Intelligent Deployment Engine

Automatically allocates field officers and resources using a priority-based assignment model. Features a Swarm Protocol that dynamically pulls reinforcements from neighboring stations when shortages are detected.

### AI Action Plan Generator

Generates operational action plans using advanced language models with multi-model fallback support for enhanced reliability.

### Event Planner & Feedback Loop

Schedules planned events, forecasts traffic impact, and incorporates real-world outcomes into future model retraining pipelines.

### Smart Escalation Incident Reporting

Logs field incidents with automated severity assessment based on urgency, duration, and geographical clustering.

### Explainable AI & Performance Analytics

Provides actionable insights through analytics dashboards, incident trend analysis, clearance-rate monitoring, and model performance evaluation.

---

## 🛠️ Technology Stack

### Frontend

* React 18
* Vite
* Tailwind CSS
* Leaflet Maps
* Lucide Icons

### Backend

* Python 3.10
* FastAPI
* Uvicorn

### Data & Intelligence Layer

* OSMnx
* NetworkX
* Pandas
* Scikit-learn
* Random Forest Regression
* Gradient Boosting Regression

### Infrastructure

* Docker
* Nginx
* Hugging Face Spaces

---

## 🚀 Local Setup

### 1. Configure Environment Variables

Create a `.env` file and add the following:

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### 2. Run Using Docker

```bash
docker compose up --build
```

Available endpoints:

* Frontend: http://localhost
* Backend Docs: http://localhost:8000/docs

---

### 3. Run Without Docker

#### Frontend

```bash
npm install
npm install -D @types/leaflet --legacy-peer-deps
npm run dev
```

#### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## 🌐 Hugging Face Deployment

This project is optimized for deployment as a Docker Space on Hugging Face.

### Required Secrets

Configure the following secrets inside your Hugging Face Space settings:

| Secret Name            | Description            |
| ---------------------- | ---------------------- |
| VITE_SUPABASE_URL      | Supabase Project URL   |
| VITE_SUPABASE_ANON_KEY | Supabase Anonymous Key |
| OPENROUTER_API_KEY     | OpenRouter API Key     |

After adding the secrets, rebuild the Space.

---

## 📊 Core Capabilities

* Traffic Impact Forecasting
* Resource Allocation Optimization
* Dynamic Route Diversion Planning
* Event Traffic Simulation
* Incident Escalation Management
* AI-Assisted Command Support
* Historical Analytics Dashboard
* Continuous Learning Feedback Loop
## Contributors

This project was developed collaboratively by:

* [Sai Avinash Bharadwaj Komaragiri (@avik28)](https://github.com/avik28)
* [Neha Mohanasundaram (@nehamohan24)](https://github.com/nehamohan24)
* [Lingala Athrinandhan (@athrinandhan)](https://github.com/athrinandhan)
* [Akhil Tummalapalli (@akhilt9)](https://github.com/akhilt9)

---

## Hackathon

Talos.ai was developed as part of the Flipkart Gridlock Hackathon, focusing on event-driven traffic congestion prediction, intelligent resource deployment, dynamic route diversion, and AI-assisted traffic management for smart city operations.
