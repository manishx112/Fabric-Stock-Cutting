import './globals.css';

export const metadata = {
  title: 'Roll Cutting Control Room',
  description: 'Fabric roll cutting register — Gandhi Nagar (Ladies & Mens) aur G-104 ka inward, cutting, balance aur turnaround.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
