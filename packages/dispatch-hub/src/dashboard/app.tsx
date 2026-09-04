import { createRoot } from "react-dom/client";
import { ConsoleApp } from "./console-app.js";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<ConsoleApp />);
}
