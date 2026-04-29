/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050b14",
        surface: "#0a1525",
        border: "#1e3a5f",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(6, 182, 212, 0.35)",
      },
    },
  },
  plugins: [],
};
