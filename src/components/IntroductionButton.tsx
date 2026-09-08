import { Info } from 'lucide-react';
import TriggerButton from './TriggerButton';

/** The ESP32, not the browser, tells the DFPlayer Mini to play its microSD MP3. */
export default function IntroductionButton({ isConnected, onIntroduction }: {
  isConnected: boolean;
  onIntroduction: () => void;
}) {
  return <TriggerButton disabled={!isConnected} className="introduction-button btn-control" onTrigger={onIntroduction}>
    <Info size={18} />Introduction
  </TriggerButton>;
}
