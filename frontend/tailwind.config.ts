import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#151515",
        mist: "#fff3e5",
        reef: "#f26b21",
        ember: "#d94f00",
        signal: "#f59e0b",
        graphite: "#334155",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23, 32, 37, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
