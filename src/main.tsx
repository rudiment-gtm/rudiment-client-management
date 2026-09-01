import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadMapboxToken } from "./config/mapbox";

// Load Mapbox token before rendering so the map initializes with a valid token.
loadMapboxToken().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
