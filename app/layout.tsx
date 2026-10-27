import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'رونویسی زنده کردی',
  description: 'تبدیل گفتار کردی به متن، بلادرنگ',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ckb" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
