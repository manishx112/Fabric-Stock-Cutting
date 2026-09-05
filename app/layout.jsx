import './globals.css';

/* Default LIGHT. OS ke dark mode ko follow nahi karte — factory ki screens par
   light hi padha jata hai. User toggle se dark chun le to wo yaad rehta hai. */
const THEME_BOOT = "try{if(localStorage.getItem('rc-theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}";

export const metadata = {
  title: 'Roll Cutting Control Room',
  description: 'Fabric roll cutting register — Gandhi Nagar (Ladies & Mens) aur G-104 ka inward, cutting, balance aur turnaround.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
