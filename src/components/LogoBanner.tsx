import { useRef, useState, type ChangeEvent } from 'react';
import { Upload, RotateCcw, Cpu } from 'lucide-react';

const KEY = 'veera-logo';
function savedLogo() {
  try { return localStorage.getItem(KEY) || '/logo.png'; } catch { return '/logo.png'; }
}
export default function LogoBanner() {
  const [logo, setLogo] = useState(savedLogo);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a PNG, JPG or WebP image up to 2 MB.'); return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('Could not read this image. Please try another file.');
    reader.onload = () => {
      const value = String(reader.result);
      const image = new Image();
      image.onerror = () => setError('This file could not be opened as an image.');
      image.onload = () => {
        setLogo(value); setError('');
        try { localStorage.setItem(KEY, value); }
        catch { setError('Logo applied for this session; browser storage is unavailable or full.'); }
      };
      image.src = value;
    };
    reader.readAsDataURL(file);
  };
  return <header className="logo-banner">
    <div className="brand-rail"><span><Cpu size={14} /> ESP32 ROBOTICS</span><span>TEAM DAJ / VEERA</span></div>
    <img className="brand-logo" src={logo} alt="Veera Bot logo" onError={() => { if (logo !== '/logo.png') setLogo('/logo.png'); setError('Unable to load logo. Upload an image or replace public/logo.png.'); }} />
    <div className="brand-bottom"><span className="font-mono">BUILT TO MOVE. DESIGNED TO INSPIRE.</span>
      <div className="logo-actions"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload logo image" className="sr-only" onChange={upload} />
        <button onClick={() => input.current?.click()}><Upload size={14} /> Upload logo</button>
        {logo !== '/logo.png' && <button onClick={() => { setLogo('/logo.png'); setError(''); try { localStorage.removeItem(KEY); } catch { /* private browsing */ } }}><RotateCcw size={14} /> Reset</button>}
      </div>
    </div>
    <p className="logo-path">Default image: <code>public/logo.png</code> · URL: <code>/logo.png</code> · uploads stay in this browser</p>
    {error && <p role="alert" className="text-sm text-amber-300 mt-2">{error}</p>}
  </header>;
}
