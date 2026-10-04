'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <h1>ไม่สามารถแสดงหน้านี้ได้</h1>
      <p>กรุณาลองโหลดใหม่ ข้อมูลที่บันทึกแล้วจะยังคงอยู่</p>
      <button onClick={reset}>ลองอีกครั้ง</button>
    </main>
  );
}
