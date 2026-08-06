import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Silumatch — El juego de adivinar futbolistas',
  description:
    'Aparece la silueta de un futbolista y todos pujan a ciegas. El nombre se revela recién cuando cierra la puja.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/* No background colour here: an opaque class on the body covers the
          gradient painted on the root element. */}
      <body className="text-white">
        {children}
        {/* Visitas, y cuánto tarda en cargar para la gente de verdad. Los dos
            necesitan que la CSP permita va.vercel-scripts.com: en Vercel el
            script sale del propio dominio, pero en desarrollo se baja de ahí y
            queda bloqueado en silencio. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
