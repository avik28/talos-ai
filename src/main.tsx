import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RootLayout } from "./routes/__root";
import LandingPage from "./routes/index";
import DiversionsRoute from "./routes/diversions";
import DeploymentPage from "./routes/deployment";
import PlannerPage from "./routes/planner";
import IncidentsPage from "./routes/incidents";
import ForecastsPage from "./routes/forecasts";
import AnalyticsPage from "./routes/analytics";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/diversions" element={<DiversionsRoute />} />
          <Route path="/deployment" element={<DeploymentPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/forecasts" element={<ForecastsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
