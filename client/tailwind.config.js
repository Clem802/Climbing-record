export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#cd2927', dark: '#961816' },
      },
      boxShadow: {
        natural: '6px 6px 9px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
