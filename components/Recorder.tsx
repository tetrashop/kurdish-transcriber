'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWAV, hasSpeech, resampleTo16k } from '@/lib/audio';
import Transcript, { type Segment } from './Transcript';

const CHUNK_MS = 3000;
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

    queueRef.current = queueRef.current.then(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // ۲۰ ثانیه صبر می‌کند

      try {
        setStatus('در حال ارسال به سرور…');
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
           setStatus(`خطا: ${String(data.error).slice(0, 50)}`);
        } else if (data.text?.trim()) {
          setSegments((prev) => [...prev, {
            id: crypto.randomUUID(),
            text: data.text.trim(),
            speaker: 'گوینده',
            ts: Date.now(),
          }]);
          setStatus('در حال شنیدن…');
        } else {
          setStatus('در حال شنیدن…');
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          setStatus('خطا: پاسخ سرور طول کشید (تایم‌اوت)');
        } else {
          setStatus(`خطای شبکه: ${err.message}`);
        }
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
      processor.onaudioprocess = (e) => {
        bufferRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      timerRef.current = setInterval(flush, CHUNK_MS);
      setRecording(true);
      setStatus('در حال شنیدن…');
    } catch (err) {
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
