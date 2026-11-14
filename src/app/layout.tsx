import type { Metadata } from 'next';
import './globals.css'; // ✅ Chemin corrigé

export const metadata: Metadata = {
  title: 'LA VIDA-LOCA',
  description: 'Système de gestion Hôtel & Restaurant',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
