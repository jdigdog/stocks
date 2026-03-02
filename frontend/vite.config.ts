import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Set to "/<repo-name>/" for GitHub Pages via repo variable VITE_BASE
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  plugins: [react()],
  base,
});
