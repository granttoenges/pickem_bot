import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        field: "#f7f3ea",
        turf: "#0b6b4f",
        chalk: "#f9fafb",
        gold: "#d6a644"
      }
    }
  },
  plugins: []
};

export default config;
