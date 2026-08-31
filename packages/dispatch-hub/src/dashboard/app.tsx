import { createRoot } from "react-dom/client";
import { JobsBoard } from "./board.js";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<JobsBoard />);
}
