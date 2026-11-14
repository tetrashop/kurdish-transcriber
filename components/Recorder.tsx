'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWAV, hasSpeech, resampleTo16k } from '@/lib/audio';

const CHUNK_MS = 15000; 
const MIN_CHUNK_SAMPLES = 16000 * 2.0;

type Segment = { id: string; kurdish: string; persian: string; ts: number; };

export default function Recorder() {
  const [recording, setRecording] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState('idle');

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const rateRef = useRef<number>(16000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(async () => {
    const chunks = bufferRef.current;
    if (chunks.length === 0) return;
    const total = chunks.reduce((s, b) => s + b.length, 0);
    if (total < MIN_CHUNK_SAMPLES) return;

    const merged = new Float32Array(total);
    let off = 0;
    for (const b of chunks) { merged.set(b, off); off += b.length; }
    bufferRef.current = [];

    if (!hasSpeech(merged, 0.015)) return;

    const wav = encodeWAV(resampleTo16k(merged, rateRef.current), 16000);

    queueRef.current = queueRef.current.then(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      try {
        setStatus('در حال پردازش…');
        const fd = new FormData();
        fd.append('file', wav, 'chunk.wav');
        
        const res = await fetch('/api/transcribe', { 
          method: 'POST', 
          body: fd,
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();
        
        if (data.error) {
           setStatus(`خطا: ${String(data.error).slice(0, 40)}`);
        } else if (data.kurdish?.trim()) {
          setSegments((prev) => [...prev, {
            id: crypto.randomUUID(),
            kurdish: data.kurdish.trim(),
            persian: data.persian.trim(),
            ts: Date.now(),
          }]);
          setStatus('در حال شنیدن…');
        } else {
          setStatus('در حال شنیدن…');
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') setStatus('خطا: تایم‌اوت');
        else setStatus('خطای شبکه');
      }
    });
    await queueRef.current;
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => bufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(ctx.destination);
      timerRef.current = setInterval(flush, CHUNK_MS);
      setRecording(true);
      setStatus('در حال شنیدن…');
    } catch (err) { setStatus('دسترسی رد شد'); }
  };

  const stop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    await flush();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    await ctxRef.current?.close();
    ctxRef.current = null;
    streamRef.current = null;
    setRecording(false);
    setStatus('متوقف شد');
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close();
    };
  }, []);

  return (
    <div className="panel">
      <div className="controls" style={{ marginBottom: '20px' }}>
        <button onClick={recording ? stop : start}>
          {recording ? '⏹ توقف' : '🎙 شروع'}
        </button>
        <span className="status" style={{ marginRight: '15px', color: '#8b949e' }}>{status}</span>
      </div>
      
      <div className="transcript" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {segments.length === 0 && <div style={{ textAlign: 'center', color: '#8b949e', padding: '20px' }}>هنوز متنی دریافت نشده…</div>}
        {segments.map((s) => (
          <div key={s.id} style={{ padding: '15px', borderBottom: '1px solid #21262d', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '11px', color: '#58a6ff', background: '#0d419d33', padding: '2px 8px', borderRadius: '999px' }}>گوینده</span>
            </div>
            <div style={{ fontSize: '15px', color: '#e6edf3', fontWeight: 'bold', direction: 'rtl' }}>
              {s.kurdish}
            </div>
            <div style={{ fontSize: '13px', color: '#8b949e', direction: 'rtl' }}>
              ترجمه: {s.persian || '⏳ در حال پردازش...'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
