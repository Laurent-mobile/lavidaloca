import type { Metadata } from 'next';
import './globals.css'; // ✅ Chemin corrigé

export const metadata: Metadata = {
  title: 'LA VIDA-LOCA',
  description: 'Hôtel • Restaurant • Lounge - Ouagadougou',
  icons: {
    icon: '/logo.png',           // ✅ Chemin vers votre logo
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
