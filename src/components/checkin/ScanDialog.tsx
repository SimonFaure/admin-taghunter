import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, X } from 'lucide-react';

// Camera QR scanner + manual reference entry. Uses the browser's native
// BarcodeDetector when it exists (Chrome / Android), else the small
// qr-scanner library (loaded on demand, iOS Safari etc.).

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => NativeDetector;

export function ScanDialog({ onCode, onClose, busy, error }: {
  onCode: (code: string) => void; onClose: () => void; busy: boolean; error: string | null;
}) {
  const { t } = useTranslation('checkin');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [manual, setManual] = useState('');
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | null = null;
    const emit = (code: string) => {
      const now = Date.now();
      // The same code is seen many times per second: report it once every 3 s.
      if (lastRef.current && lastRef.current.code === code && now - lastRef.current.at < 3000) return;
      lastRef.current = { code, at: now };
      onCodeRef.current(code);
    };

    (async () => {
      const video = videoRef.current;
      if (!video) return;
      const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      try {
        if (Native) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
          video.srcObject = stream;
          await video.play();
          const detector = new Native({ formats: ['qr_code'] });
          let timer = 0;
          const tick = async () => {
            if (stopped) return;
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) emit(found[0].rawValue);
            } catch { /* frame not ready */ }
            timer = window.setTimeout(tick, 250);
          };
          void tick();
          cleanup = () => { clearTimeout(timer); stream.getTracks().forEach((tr) => tr.stop()); };
        } else {
          const QrScanner = (await import('qr-scanner')).default;
          if (stopped) return;
          const scanner = new QrScanner(video, (r) => emit(r.data), { preferredCamera: 'environment', highlightScanRegion: true, returnDetailedScanResult: true });
          await scanner.start();
          cleanup = () => { scanner.stop(); scanner.destroy(); };
        }
      } catch (e) {
        setCamError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      } finally {
        setStarting(false);
      }
    })();
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="text-lg font-bold flex items-center gap-2"><Camera className="w-5 h-5" />{t('scan.title')}</h2>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/10" aria-label={t('common.close')}><X className="w-6 h-6" /></button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black">
        <video ref={videoRef} className="max-h-full max-w-full" playsInline muted />
        {starting && <Loader2 className="absolute w-10 h-10 animate-spin text-white" />}
        {camError && <p className="absolute px-6 text-center text-white text-lg">{t(`scan.camera.${camError}`)}</p>}
        {busy && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-white" /></div>}
      </div>
      <form className="bg-white p-4 space-y-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onCode(manual.trim()); }}>
        {error && <p className="text-red-700 font-semibold" role="alert">{t(`scan.errors.${error}`, { defaultValue: t('scan.errors.generic') })}</p>}
        <label className="block text-sm font-medium text-slate-700">{t('scan.manual')}</label>
        <div className="flex gap-2">
          <input className="flex-1 min-w-0 border-2 border-slate-300 rounded-xl px-3 py-3 text-lg uppercase tracking-wider focus:outline-none focus:border-slate-900"
            value={manual} onChange={(e) => setManual(e.target.value)} placeholder="TH-XXXXXX" autoCapitalize="characters" autoComplete="off" />
          <button type="submit" disabled={busy || !manual.trim()} className="px-5 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-40">{t('scan.find')}</button>
        </div>
      </form>
    </div>
  );
}
