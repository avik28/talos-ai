# TalosAI Local Running Instructions 🚦

This guide provides step-by-step instructions for running the **TalosAI** (Traffic Analysis, Learning and Optimization System) application locally on your machine.

---

## 🔑 1. Setup Environment Variables

Before starting the application, you must set up the environment variables. 

Create a `.env` file in the root of the workspace (and/or inside the `backend/` directory) and add the following keys:

```env
# Supabase Database Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anonymous-key

# OpenRouter API Key (For AI event action plan generation)
OPENROUTER_API_KEY=your-openrouter-api-key
```

> [!NOTE]
> If Supabase credentials are not provided or if connection fails, the frontend will automatically fall back to loading the local dataset from `public/dataset.csv`.

---

## 🐳 Option A: Run using Docker (Recommended)

Build and run the entire application stack (Frontend, Backend, and Nginx reverse proxy) in a single unified Docker container using the project's root `Dockerfile`.

### Prerequisites
Make sure you have [Docker](https://www.docker.com/) installed and running.

### 1. Build the Docker Image
Run the following command from the root of the workspace directory:

```bash
docker build -t gridlock_app .
```

### 2. Run the Container
Run the container mapping host port 80 to container port 7860 (the default port exposed by the unified setup):

```bash
docker run -d -p 80:7860 --name gridlock_app gridlock_app
```

### Access URLs
*   **Web Application (Frontend)**: [http://localhost](http://localhost)

To stop and remove the container, run:
```bash
docker stop gridlock_app
docker rm gridlock_app
```

---

## 💻 Option B: Run Manually (Without Docker)

If you prefer to run the frontend and backend servers individually without containerization, follow these steps.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Python 3.10](https://www.python.org/downloads/)

### Part 1: Start the Backend (FastAPI)

1. Open a new terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```

2. Activate your Python virtual environment:
   *   **Windows (PowerShell)**:
       ```powershell
       ..\venv\Scripts\activate
       ```
   *   **Windows (Command Prompt)**:
       ```cmd
       ..\venv\Scripts\activate.bat
       ```
   *   **macOS / Linux**:
       ```bash
       source ../venv/bin/activate
       ```

3. Install python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend development server:
   ```bash
   uvicorn main:app --reload
   ```
   The backend will start running on [http://127.0.0.1:8000](http://127.0.0.1:8000). You can access the Interactive Swagger documentation at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

---

### Part 2: Start the Frontend (Vite + React)

1. Open a second terminal window.
2. Install the frontend dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Start the Vite local development server:
   ```bash
   npm run dev
   ```
   The frontend will start running on [http://localhost:5173](http://localhost:5173).

---

## 🛠️ Offline Support & Model Data Bootstrap
*   **Spatial Network Graphs**: On startup, the backend automatically looks for the local spatial graph of Bangalore (`backend/data/bangalore.graphml`). If it is not found, the backend will automatically call `bootstrap_graph.py` to download the layout from OpenStreetMap (OSM) via the OSMnx library.
*   **Machine Learning Models**: The application evaluates predictions utilizing pre-trained Gradient Boosting and Random Forest regression models located in `backend/model/dual_intake_model.pkl`.
