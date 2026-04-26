@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", "IBM Plex Sans Arabic", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Outfit", "IBM Plex Sans Arabic", sans-serif;
  
  --color-brand-primary: #0a0a0a;
  --color-brand-secondary: #fdfdfd;
  --color-accent-amber: #f59e0b;
}

:root {
  --bg: #fdfdfd;
  --ink: #0a0a0a;
}

body {
  background-color: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

@utility scrollbar-hide {
  &::-webkit-scrollbar {
    display: none;
  }
  -ms-overflow-style: none;
  scrollbar-width: none;
}

