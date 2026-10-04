import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ENVIRA • Environmental Intelligence',
  description: 'ระบบบริหารข้อมูลสิ่งแวดล้อมและติดตามการดำเนินงาน',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
