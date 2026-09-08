import { Cpu } from 'lucide-react';

export default function LogoBanner() {
  return <header className="logo-banner">
    <div className="brand-rail"><span><Cpu size={14} /> ESP32 ROBOTICS</span><span>TEAM DAJ / VEERA</span></div>
    <img className="brand-logo" src="/logo.png" alt="Veera Bot logo" />
    <div className="brand-bottom"><span className="font-mono">BUILT TO MOVE. DESIGNED TO INSPIRE.</span></div>
  </header>;
}
