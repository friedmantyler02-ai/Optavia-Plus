/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f7f2",
          100: "#e0efe4",
          200: "#b8dcc2",
          300: "#8cc59d",
          400: "#5eaa76",
          500: "#4a7c59",
          600: "#3a6247",
          700: "#2e4e38",
          800: "#243d2c",
          900: "#1b2e21",
        },
        warm: {
          50: "#fdf6e3",
          100: "#faecc7",
          200: "#f5d98f",
          300: "#efc457",
          400: "#c9a84c",
          500: "#a38a3d",
        },
        coral: {
          50: "#faf0e8",
          100: "#f5e1d1",
          200: "#e8bfa3",
          300: "#d49975",
          400: "#c4855c",
          500: "#a86b47",
        },
      },
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        body: ["'Nunito'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
