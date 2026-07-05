import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0f0f23',
          secondary: '#1a1a3e',
          glass: 'rgba(255, 255, 255, 0.05)',
        },
        text: {
          primary: '#e2e8f0',
          secondary: '#94a3b8',
          accent: '#7c3aed',
        },
        border: {
          glass: 'rgba(255, 255, 255, 0.1)',
          focus: '#7c3aed',
        },
        status: {
          success: '#10b981',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },
      },
      backdropBlur: {
        glass: '12px',
      },
      borderRadius: {
        glass: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
