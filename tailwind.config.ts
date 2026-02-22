import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#121418",
        paper: "#f7f6f2",
        ember: "#b04624",
        olive: "#667a57",
        slate: "#364153"
      },
      keyframes: {
        "toast-in": {
          "0%": { opacity: "0", transform: "translateX(-50%) translateY(10px)" },
          "100%": { opacity: "1", transform: "translateX(-50%) translateY(0)" }
        },
        "toast-out": {
          "0%": { opacity: "1", transform: "translateX(-50%) translateY(0)" },
          "100%": { opacity: "0", transform: "translateX(-50%) translateY(-6px)" }
        }
      },
      animation: {
        "toast-in": "toast-in 0.2s ease forwards",
        "toast-out": "toast-out 0.35s ease forwards"
      }
    }
  },
  plugins: []
};

export default config;
