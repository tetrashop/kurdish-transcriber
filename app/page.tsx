import Recorder from '@/components/Recorder';

export default function Page() {
  return (
    <main className="container">
      <h1>رونویسی زنده کردی</h1>
      <p className="sub">Whisper Large-v3 · Groq API</p>
      <Recorder />
    </main>
  );
}
