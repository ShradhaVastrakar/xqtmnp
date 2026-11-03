/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme tokens are CSS variables (see src/index.css) so dark mode swaps in one place.
        page: "var(--page)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        line: "var(--line)",
        navy: { 900: "#0b2545", 800: "#13315c", 700: "#1c4a82" },
        brand: "var(--brand)",
        teal: { DEFAULT: "var(--teal)", soft: "var(--teal-soft)" },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
