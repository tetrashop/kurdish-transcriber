'use client';
import { useEffect, useRef } from 'react';

export type Segment = { id: string; text: string; speaker: string; ts: number; };

export default function Transcript({ segments }: { segments: Segment[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [segments]);

  if (segments.length === 0) {
    return <div className="empty">هنوز متنی دریافت نشده…</div>;
  }
  return (
    <div className="transcript">
      {segments.map((s) => (
        <div key={s.id} className="segment">
          <span className="speaker">{s.speaker}</span>
          <span className="text">{s.text}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
