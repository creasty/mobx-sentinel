import { createRoot } from "react-dom/client";
import "@/helpers/picocss-custom.css";
import "@/helpers/example-layout.css";
import { App } from "@/App";

createRoot(document.getElementById("root")!).render(<App />);
