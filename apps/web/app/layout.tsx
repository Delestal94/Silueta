import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Siluetas - Subasta Futbolera',
  description: 'Juego de subasta de futbolistas en tiempo real',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-900 text-white">
        {children}
      </body>
    </html>
  );
}
