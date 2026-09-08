import { useState } from 'react';
import { Bot, Zap, Circle, List, Maximize, Minimize, OctagonX, ShieldCheck, Radio, HandHeart } from 'lucide-react';
import { useBluetooth } from './hooks/useBluetooth';
import { useRobotControl } from './hooks/useRobotControl';
import { useControlFullscreen } from './hooks/useControlFullscreen';
import RobotAvatar from './components/RobotAvatar';
import BluetoothPanel from './components/BluetoothPanel';
import MovementControls from './components/MovementControls';
import ActionButtons from './components/ActionButtons';
import StatusPanel from './components/StatusPanel';
import CommandLog from './components/CommandLog';
import IntroductionButton from './components/IntroductionButton';
import UsesPanel from './components/UsesPanel';
import LogoBanner from './components/LogoBanner';
import InfoDialog from './components/InfoDialog';

export default function App() {
  const bluetooth = useBluetooth();
  const isConnected = bluetooth.status === 'connected';
  const control = useRobotControl(bluetooth, isConnected);
  const demo = useControlFullscreen(control.stopRobot);
  const [showUses, setShowUses] = useState(false);
  const isMoving = control.speeds.left !== 0 || control.speeds.right !== 0;
  const openUses = () => {
    // Opening an informational modal cancels motion for safety; it sends no audio/Uses trigger.
    control.stopRobot();
    setShowUses(true);
  };
  const connection = <span role="status" className={`connection-badge ${isConnected ? 'connected' : bluetooth.status === 'connecting' ? 'connecting' : 'disconnected'}`}>
    <Circle size={9} fill="currentColor" />{isConnected ? 'Connected' : bluetooth.status === 'connecting' ? 'Connecting…' : 'Disconnected'}
  </span>;

  return <div className="min-h-screen grid-bg relative overflow-x-hidden">
      {/* Background glow effects */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse, rgba(255,215,0,0.05) 0%, transparent 65%)',
          filter: 'blur(50px)',
        }}
      />
      <div
        className="fixed top-1/2 left-0 -translate-y-1/2 w-[500px] h-[600px] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse, rgba(0,100,255,0.03) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="fixed bottom-0 right-0 w-[600px] h-[500px] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse, rgba(120,40,255,0.04) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      {/* Horizontal light line */}
      <div
        className="fixed top-0 left-0 right-0 h-px pointer-events-none z-50"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.4) 30%, rgba(255,215,0,0.4) 70%, transparent)' }}
      />


    <div className="site-shell relative z-10">
      <LogoBanner />
      <main>
        <div className="page-title">
          <div><p className="eyebrow"><Zap size={13} /> VEERA ROBOTICS / OPERATOR CONSOLE</p>
            <h1>VEERA BOT <span>CONTROL CENTER</span></h1>
            <p className="text-gray-400 text-sm mt-2">Precision in your hands. A better way to move.</p>
          </div>
          <span className="protocol-badge"><Radio size={14} /> ESP32 · BLUETOOTH LE</span>
        </div>

        <div className="dashboard-layout">
          <aside className="robot-sidebar space-y-5">
            <div className="glass-panel rounded-xl p-4 flex flex-col items-center panel-corners">
              <div className="section-heading w-full"><Bot size={17} /><h2>Veera Bot</h2><span className="heading-tag">{isConnected ? 'LINKED' : 'IDLE'}</span></div>
              <RobotAvatar status={bluetooth.status} isMoving={isMoving} waveRequested={control.waveRequested} />
              <p className="text-xs text-gray-500 font-mono mt-3">FOUR MOTORS / ONE RIGHT HAND</p>
            </div>
            <BluetoothPanel status={bluetooth.status} error={bluetooth.error} isBluetoothAvailable={bluetooth.isBluetoothAvailable}
              onConnect={bluetooth.connect} onDisconnect={() => { control.stopRobot(); bluetooth.disconnect(); }} />
          </aside>

          <div className="controller-column">
            <section ref={demo.ref} className={`control-interface ${demo.fullscreen ? 'demo-mode' : ''}`} aria-label="Live robot controls"
              onContextMenu={e => e.preventDefault()}>
              <div className="control-toolbar">
                <div><span className="eyebrow demo-title">VEERA BOT CONTROL CENTER · v3.1</span>{connection}</div>
                <button className="fullscreen-button" onClick={() => void demo.toggle()}>{demo.fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}{demo.fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
              </div>
              {demo.message && <p role="status" className="fullscreen-notice">{demo.message}</p>}
              <div className="live-controls">
                <MovementControls isConnected={isConnected} onJoystick={control.setJoystick} onStop={control.stopRobot} stopVersion={control.stopVersion} speeds={control.speeds} />
                <div className="secondary-controls">
                  <button className="emergency-stop" aria-label="Emergency STOP"
                    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); control.stopRobot(); }}
                    onClick={e => { if (e.detail === 0) control.stopRobot(); }}><OctagonX size={32} /><span>STOP<small>EMERGENCY · ALL MOTION</small></span></button>
                  <ActionButtons isConnected={isConnected} waveRequested={control.waveRequested} cooldownMs={control.cooldownMs} coolingDown={!!control.cooldownUntil}
                    onCooldownChange={control.setCooldownMs} onWaveHand={control.waveRightHand} />
                  <IntroductionButton isConnected={isConnected} onIntroduction={control.triggerIntroduction} />
                  <div className="safety-note"><ShieldCheck size={17} /><p>Release to stop. Use a second finger for the right hand or emergency stop.</p></div>
                </div>
              </div>
              <div className="control-navigation">
                <button onClick={openUses}><List size={18} /><span>Uses<small>Explore the possibilities</small></span></button>
                <span className="touch-hint">MULTITOUCH READY</span>
              </div>
              {showUses && <InfoDialog label="Uses" onClose={() => setShowUses(false)}>
                <UsesPanel onClose={() => setShowUses(false)} />
              </InfoDialog>}
            </section>
            <CommandLog logs={bluetooth.logs} onClear={bluetooth.clearLogs} />
          </div>

          <aside className="status-sidebar space-y-5">
            <StatusPanel status={bluetooth.status} isMoving={isMoving} waveRequested={control.waveRequested} lastCommand={bluetooth.lastCommand} commandCount={bluetooth.commandCount} />
            <div className="glass-panel rounded-xl p-4">
              <div className="section-heading"><ShieldCheck size={17} /><h2>Quick Guide</h2></div>
              <ol className="quick-guide">
                <li>Connect Veera Bot using Chrome or Edge over HTTPS.</li>
                <li>Drag the joystick. Distance controls speed; left and right steer both motor pairs independently.</li>
                <li>Release to stop immediately. STOP also cancels the right hand.</li>
                <li>Introduction triggers the prerecorded MP3 on the DFPlayer Mini. Wave Hand triggers the ESP32 servo routine.</li>
                <li>Use Fullscreen for a distraction-free demonstration.</li>
              </ol>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <div className="section-heading"><Radio size={17} /><h2>ESP32 Commands</h2></div>
              <dl className="command-reference">
                {[['M:L,R', 'Signed motor PWM'], ['S', 'Stop all motion'], ['H:wave', 'ESP32 servo wave'], ['I', 'DFPlayer MP3 trigger']].map(([cmd, desc]) => <div key={cmd}><dt>{cmd}</dt><dd>{desc}</dd></div>)}
              </dl>
              <p className="text-xs text-gray-500 mt-3">Requires compatible firmware. Motor commands are not the original F/B/L/R bytes.</p>
            </div>
          </aside>
        </div>
      </main>
      <footer className="site-footer"><span>VEERA BOT / ESP32 CONTROL INTERFACE</span><p>Developed By <strong>Team DAJ</strong> For Veera <HandHeart size={19} aria-hidden="true" /></p><span>DEVAANSH · JOHNSON · ABHIRAM</span></footer>
    </div>
  </div>;
}
