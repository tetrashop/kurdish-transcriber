'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWAV, hasSpeech, resampleTo16k } from '@/lib/audio';
import Transcript, { type Segment } from './Transcript';

// افزایش زمان به 4 ثانیه تا مدل فرصت کافی برای پردازش داشته باشد
const CHUNK_MS = 4000; 
const MIN_CHUNK_SAMPLES = 16000 * 0.5;

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

    if (!hasSpeech(merged)) return;

    const resampled = resampleTo16k(merged, rateRef.current);
    const wav = encodeWAV(resampled, 16000);

    // صف را با مدیریت خطا و تایم‌اوت همراه می‌کنیم تا قفل نشود
    queueRef.current = queueRef.current.then(async () => {
      try {
        setStatus('در حال ارسال به سرور…');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 ثانیه تایم‌اوت

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
          setStatus(`خطای سرور: ${String(data.error).slice(0, 60)}...`);
          return; // خروج از تابع تا درخواست بعدی پردازش شود
        }

        if (data.text?.trim()) {
          setSegments((prev) => [...prev, {
            id: crypto.randomUUID(),
            text: data.text.trim(),
            speaker: 'گوینده',
            ts: Date.now(),
          }]);
        }
        setStatus('در حال شنیدن…');
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setStatus('خطا: زمان پاسخگویی سرور به پایان رسید');
        } else {
          setStatus('خطا در ارتباط با سرور');
          console.error(err);
        }
      }
    });
    
    // منتظر ماندن برای تکمیل درخواست قبلی
    await queueRef.current;
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;
      
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        bufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      
      // اتصال خروجی به مقصد برای اجرای صحیح در کروم اندروید
      source.connect(processor);
      processor.connect(ctx.destination);
      
      timerRef.current = setInterval(flush, CHUNK_MS);
      setRecording(true);
      setStatus('در حال شنیدن… (صدا را در گوشی ضبط می‌کند)');
    } catch (err) {
      console.error(err);
      setStatus('دسترسی به میکروفون رد شد');
    }
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
// داخل return، بعد از دکمه اصلی
<button onClick={async () => {
  setStatus('در حال تست ارتباط…');
  try {
    const fd = new FormData();
    fd.append('file', new Blob(['test'], { type: 'audio/wav' }), 'test.wav');
    const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
    const data = await res.json();
    setStatus(`پاسخ سرور: ${JSON.stringify(data)}`);
  } catch (e) {
    setStatus(`خطای شبکه: ${e}`);
  }
}}>تست ارتباط</button>
    
    
    <div className="panel">
      <div className="controls">
        <button onClick={recording ? stop : start}>
          {recording ? '⏹ توقف' : '🎙 شروع'}
        </button>
        <span className="status">{status}</span>
      </div>
      <Transcript segments={segments} />
    </div>
  );
}
