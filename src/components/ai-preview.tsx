import Link from 'next/link';
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  FileSearch,
  ListChecks,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const ideas = [
  {
    icon: ChartNoAxesCombined,
    number: '01',
    title: 'ชี้แนวโน้มที่ควรดู',
    detail: 'ช่วยสังเกตวันที่ใช้น้ำ พลังงาน หรือเกิดของเสียมากกว่าระดับปกติ แล้วชวนตรวจข้อมูลต้นทาง',
  },
  {
    icon: FileSearch,
    number: '02',
    title: 'ช่วยเตรียมประเด็นประชุม',
    detail: 'สรุปสิ่งที่เปลี่ยนไปเมื่อเทียบกับปริมาณการผลิต พร้อมลิงก์กลับไปดูตัวเลขและหลักฐาน',
  },
  {
    icon: ListChecks,
    number: '03',
    title: 'ช่วยติดตามงานแก้ไข',
    detail: 'ช่วยร่างคำถามสำหรับตรวจสาเหตุและติดตามผล โดยให้ผู้รับผิดชอบตรวจทานก่อนใช้จริง',
  },
];

export function AiPreview() {
  return (
    <div className="ai-preview">
      <section className="ai-hero" aria-labelledby="ai-preview-title">
        <div>
          <span className="ai-kicker">
            <Sparkles size={15} /> ฟีเจอร์ในอนาคต
          </span>
          <h2 id="ai-preview-title">AI ช่วยมองข้อมูลสิ่งแวดล้อมให้ไวขึ้น</h2>
          <p>
            แนวคิดต่อไปคือให้ AI ช่วยหาจุดที่ควรตรวจ ช่วยเตรียมเรื่องเข้าประชุม
            และพากลับไปดูข้อมูลต้นทางได้ง่ายขึ้น
          </p>
          <span className="ai-status">ยังไม่เปิดใช้งาน • ไม่มีการส่งข้อมูลไปยัง AI</span>
        </div>
        <div className="ai-hero-art" aria-hidden="true">
          <span className="ai-orbit ai-orbit-one" />
          <span className="ai-orbit ai-orbit-two" />
          <Sparkles size={49} strokeWidth={1.3} />
        </div>
      </section>

      <div className="ai-preview-heading">
        <div>
          <span className="eyebrow">WHAT'S NEXT</span>
          <h2>สิ่งที่อยากให้ AI ช่วยทำ</h2>
        </div>
        <span>แนวทางที่กำลังวางแผน</span>
      </div>
      <div className="ai-idea-grid">
        {ideas.map(({ icon: Icon, number, title, detail }) => (
          <article className="ai-idea" key={number}>
            <div className="ai-idea-top">
              <span className="ai-idea-icon">
                <Icon size={23} />
              </span>
              <span>{number}</span>
            </div>
            <h3>{title}</h3>
            <p>{detail}</p>
            <span className="ai-idea-badge">เร็ว ๆ นี้</span>
          </article>
        ))}
      </div>
      <div className="ai-current">
        <ShieldCheck size={22} />
        <div>
          <strong>ตอนนี้ดูข้อมูลจริงใน Demo ได้แล้ว</strong>
          <p>
            กราฟ KPI และชุดประชุมใช้ข้อมูลที่อนุมัติแล้วตามกฎของระบบ ไม่มี AI สร้างผลวิเคราะห์แทนข้อมูลจริง
          </p>
        </div>
        <Link className="button secondary" href="/analysis/monthly">
          ดูชุดประชุม <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  );
}
