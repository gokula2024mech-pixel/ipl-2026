# IPL 2026 — Innovative Product League

A modern, responsive single-page marketing and registration website for the IPL 2026 college innovation program.

## Tech Stack

- **React 19** + **Vite 8**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Framer Motion** for scroll and entry animations
- **Lucide React** for icons

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

The static output is generated in the `dist/` folder.

## Deploy

This project is a static SPA — deploy the `dist/` folder to any static host.

### Vercel

1. Push the repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Vercel auto-detects Vite — no extra config needed.
4. Deploy. Every push to `main` triggers a new deployment.

Or use the CLI:

```bash
npm i -g vercel
vercel
```



### Netlify

1. Push the repo to GitHub.
2. Create a new site at [app.netlify.com](https://app.netlify.com).
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Deploy.

Or drag-and-drop the `dist/` folder into the Netlify dashboard.

## Project Structure

```
src/
├── components/       # One component per page section
│   ├── Navbar.jsx
│   ├── Hero.jsx
│   ├── About.jsx
│   ├── Registration.jsx
│   └── ...
├── data/
│   └── content.js    # Shared content, domains, phases, FAQ
├── App.jsx           # Main layout with lazy-loaded sections
└── index.css         # Tailwind + theme tokens
```



## Customization

Replace placeholder values marked with `TODO` comments in:

- `src/components/Footer.jsx` — college name, department, email, phone, social links
- `src/components/Registration.jsx` — backend/form integration
- `src/data/content.js` — FAQ content



## License

© 2026 IPL – Innovative Product Development Program. All Rights Reserved.