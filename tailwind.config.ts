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
      }
    }
  },
  plugins: []
};

export default config;
