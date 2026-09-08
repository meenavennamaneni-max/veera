import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import ActionButtons from '../src/components/ActionButtons';
import IntroductionButton from '../src/components/IntroductionButton';
import App from '../src/App';

it('provides only one hand action: Wave Hand', () => {
  const html = renderToStaticMarkup(createElement(ActionButtons, {
    isConnected: true, waveRequested: false, cooldownMs: 500, coolingDown: false,
    onCooldownChange: vi.fn(), onWaveHand: vi.fn(),
  }));
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain('Wave Hand');
  expect(html).not.toMatch(/Raise|Lower|Stop hand/);
});

it('Introduction is a simple connection-gated button, not an audio player or editor', () => {
  const html = renderToStaticMarkup(createElement(IntroductionButton, { isConnected: false, onIntroduction: vi.fn() }));
  expect(html).toContain('Introduction');
  expect(html).toContain('disabled');
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).not.toMatch(/<audio|<input|<textarea|<dialog/);
});

it('full application renders without any browser-only audio or introduction panel', () => {
  const html = renderToStaticMarkup(createElement(App));
  expect(html).toContain('Introduction');
  expect(html).toContain('Wave Hand');
  expect(html).toContain('Uses');
  expect(html).not.toMatch(/<audio|<textarea|Hi, I am Veera Bot|PLAY INTRODUCTION/);
});
