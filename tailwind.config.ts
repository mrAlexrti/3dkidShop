import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FBF7F2",
          dark: "#F3ECE3",
        },
        pink: {
          50: "#FFF3F6",
          100: "#FFE2EA",
          200: "#FFC4D4",
          300: "#FF9DB6",
          400: "#FF7099",
          500: "#FF4D81",
          600: "#F22A66",
          700: "#CC1A52",
          900: "#5C0C26",
        },
        ink: "#221A1D",
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      boxShadow: {
        soft: "0 8px 30px rgba(34, 26, 29, 0.06)",
        glass: "0 8px 32px rgba(255, 77, 129, 0.12)",
      },
      backgroundImage: {
        "grid-notebook":
          "linear-gradient(rgba(255,77,129,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,77,129,0.16) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "28px 28px",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-6px) rotate(3deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out forwards",
        float: "float 4s ease-in-out infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
