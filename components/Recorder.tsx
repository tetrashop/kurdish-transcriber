'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWAV, hasSpeech, resampleTo16k } from '@/lib/audio';

const CHUNK_MS = 10000; 
type Segment = { id: string; kurdish: string; persian: string; ts: number; };

export default function Recorder() {
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState('idle');
  const [userCode, setUserCode] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const rateRef = useRef<number>(16000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const savedCode = localStorage.getItem('kurdish_user_code');
    if (savedCode) { setUserCode(savedCode); setIsAuthorized(true); }
  }, []);

  const handleLogin = () => {
    if (userCode.trim().length > 3) {
      localStorage.setItem('kurdish_user_code', userCode.trim());
      setIsAuthorized(true);
    }
  };

  const flush = useCallback(async () => {
    const chunks = bufferRef.current;
    if (chunks.length === 0) return;
    const total = chunks.reduce((s, b) => s + b.length, 0);
    if (total < 16000) return;

    const merged = new Float32Array(total);
    let off = 0;
    for (const b of chunks) { merged.set(b, off); off += b.length; }
    bufferRef.current = [];

    if (!hasSpeech(merged, 0.01)) return;
    const wav = encodeWAV(resampleTo16k(merged, rateRef.current), 16000);

    queueRef.current = queueRef.current.then(async () => {
      try {
        setStatus('در حال رونویسی…');
        const fd = new FormData();
        fd.append('file', wav, 'chunk.wav');
        
        const res = await fetch('/api/transcribe', { 
          method: 'POST', body: fd, headers: { 'x-user-code': userCode } 
        });
        const data = await res.json();
        
        if (data.kurdish?.trim()) {
          const newId = crypto.randomUUID();
          const kurdishText = data.kurdish.trim();
          setSegments((prev) => [...prev, { id: newId, kurdish: kurdishText, persian: '⏳ در حال ترجمه...', ts: Date.now() }]);

          const tRes = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-code': userCode },
            body: JSON.stringify({ text: kurdishText })
          });
          const tData = await tRes.json();
          
          if (tData.persian?.trim()) {
             setSegments((prev) => prev.map(s => s.id === newId ? { ...s, persian: tData.persian } : s));
          } else {
             setSegments((prev) => prev.filter(s => s.id !== newId));
          }
        }
        setStatus('در حال شنیدن…');
      } catch (err: any) {
        setStatus('خطای شبکه');
      }
    });
    await queueRef.current;
  }, [userCode]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => bufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor); processor.connect(ctx.destination);
      timerRef.current = setInterval(flush, CHUNK_MS);
      setRecording(true); setStatus('در حال شنیدن…');
    } catch (err) { setStatus('دسترسی رد شد'); }
  };

  const stop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await flush();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await ctxRef.current?.close();
    setRecording(false); setStatus('متوقف شد');
  };

  if (!isAuthorized) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '40px' }}>
        <h2 style={{ marginBottom: '20px' }}>ورود به سیستم</h2>
        <input type="text" value={userCode} onChange={(e) => setUserCode(e.target.value)} placeholder="مثلاً: TEST-USER" style={{ padding: '12px', width: '100%', maxWidth: '300px', borderRadius: '8px', border: '1px solid #30363d', background: '#0d1117', color: 'white', marginBottom: '20px', textAlign: 'center', direction: 'ltr' }} />
        <br /><button onClick={handleLogin}>ورود</button>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="controls" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
           <button onClick={recording ? stop : start}>{recording ? '⏹ توقف' : '🎙 شروع'}</button>
           <span style={{ fontSize: '12px', color: '#2ea043', border: '1px solid #2ea043', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
             v5.0 (Audited & Fixed)
           </span>
           <span className="status" style={{ color: '#8b949e', fontSize: '13px' }}>{status}</span>
        </div>
        <button onClick={() => { localStorage.removeItem('kurdish_user_code'); setIsAuthorized(false); }} style={{ background: 'transparent', border: '1px solid #30363d', padding: '8px' }}>خروج</button>
      </div>
      
      <div className="transcript" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {segments.map((s) => (
          <div key={s.id} style={{ padding: '15px', borderBottom: '1px solid #21262d', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><span style={{ fontSize: '11px', color: '#58a6ff', background: '#0d419d33', padding: '2px 8px', borderRadius: '999px' }}>گوینده</span></div>
            <div style={{ fontSize: '15px', color: '#e6edf3', fontWeight: 'bold', direction: 'rtl' }}>{s.kurdish}</div>
            <div style={{ fontSize: '13px', color: s.persian.includes('اعتبار') || s.persian.includes('خطا') ? '#f85149' : '#8b949e', direction: 'rtl' }}>ترجمه: {s.persian}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
