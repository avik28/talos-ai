# Setup

## Configure Supabase

### PowerShell

```powershell
$env:SUPABASE_URL = "https://rkapgqgrdkhitrfhndwg.supabase.co"
$env:SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYXBncWdyZGtoaXRyZmhuZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDU3NDUsImV4cCI6MjA5NzM4MTc0NX0.5glUMmsLZHI-hUOlDZ8mX05TC5OzgQ0rD8FgLAPgNCc"
```

## Install Dependencies

```bash
npm install --legacy-peer-deps
npm install -D @types/leaflet
```

## Run the Project

```bash
npm run dev
```

The app will start on `http://localhost:5173`.
