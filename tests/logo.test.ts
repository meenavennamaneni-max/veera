import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import LogoBanner from '../src/components/LogoBanner';

it('uses only the file-based logo without visitor upload or reset controls', () => {
  const html = renderToStaticMarkup(createElement(LogoBanner));
  expect(html).toContain('src="./logo.png"');
  expect(html).toContain('alt="Veera Bot logo"');
  expect(html).toContain('VEERA v3.1 / TRIGGER-ONLY CONTROLS');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<input');
  expect(html).not.toContain('Upload logo');
  expect(html).not.toContain('localStorage');
});
