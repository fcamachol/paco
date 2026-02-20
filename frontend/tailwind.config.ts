import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // PACO brand colors - Claude Code inspired ultra-dark theme
        background: {
          DEFAULT: "#0d0d0d",
          secondary: "#141414",
          tertiary: "#1a1a1a",
        },
        foreground: {
          DEFAULT: "#f5f5f5",
          muted: "#a3a3a3",
        },
        // Coral accent (PACO signature)
        coral: {
          50: "#fff5f3",
          100: "#ffe8e3",
          200: "#ffd5cc",
          300: "#ffb8a8",
          400: "#ff8f75",
          500: "#FF6B4A", // Primary coral
          600: "#ed4f2e",
          700: "#c73d20",
          800: "#a4351e",
          900: "#88311f",
        },
        // Status colors
        success: {
          DEFAULT: "#22c55e",
          muted: "#166534",
        },
        warning: {
          DEFAULT: "#f59e0b",
          muted: "#854d0e",
        },
        error: {
          DEFAULT: "#ef4444",
          muted: "#991b1b",
        },
        // Border colors
        border: {
          DEFAULT: "#262626",
          muted: "#1f1f1f",
        },
        // Accent color (alias for coral-500, used by builder components)
        accent: {
          DEFAULT: "#FF6B4A",
          light: "#ff8f75",
          dark: "#ed4f2e",
        },
        // UI semantic colors for builder components
        primary: "#f5f5f5",
        secondary: "#a3a3a3",
        tertiary: "#1a1a1a",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 2s linear infinite",
      },
      boxShadow: {
        glow: "0 0 20px rgba(255, 107, 74, 0.3)",
        "glow-sm": "0 0 10px rgba(255, 107, 74, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
