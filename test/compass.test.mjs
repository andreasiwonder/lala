import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHeading, headingPoint, headingFromEvent, initPhoneCompass,
} from '../js/compass.js';

test('normalizes headings into a single turn', () => {
  assert.equal(normalizeHeading(-10), 350);
  assert.equal(normalizeHeading(370), 10);
});

test('labels all eight compass sectors', () => {
  assert.equal(headingPoint(0), 'N');
  assert.equal(headingPoint(44), 'NE');
  assert.equal(headingPoint(181), 'S');
  assert.equal(headingPoint(315), 'NW');
});

test('prefers the native iOS compass heading', () => {
  assert.equal(headingFromEvent({ webkitCompassHeading: 92, alpha: 10 }, 90), 92);
});

test('converts an absolute orientation alpha and screen rotation', () => {
  assert.equal(headingFromEvent({ absolute: true, alpha: 270 }, 0), 90);
  assert.equal(headingFromEvent({ absolute: true, alpha: 270 }, 90), 180);
  assert.equal(headingFromEvent({ type: 'deviceorientationabsolute', alpha: 270 }, 0), 90);
  assert.equal(headingFromEvent({ absolute: false, alpha: 270 }, 0), null);
});

test('the masthead control opens and closes the compass panel', (t) => {
  const previousWindow = global.window;
  t.after(() => { global.window = previousWindow; });
  let toggleClick;
  global.window = { DeviceOrientationEvent: undefined, isSecureContext: true };

  const root = { hidden: true };
  const heading = {};
  const note = {};
  const button = {};
  const toggleLabel = { textContent: 'Compass' };
  const toggle = {
    addEventListener: (_type, callback) => { toggleClick = callback; },
    setAttribute: (name, value) => { toggle[name] = value; },
  };

  initPhoneCompass({ root, face: {}, heading, note, button, toggle, toggleLabel });
  toggleClick();
  assert.equal(root.hidden, false);
  assert.equal(toggle['aria-expanded'], 'true');
  assert.equal(toggleLabel.textContent, 'Hide compass');

  toggleClick();
  assert.equal(root.hidden, true);
  assert.equal(toggle['aria-expanded'], 'false');
  assert.equal(toggleLabel.textContent, 'Compass');
});
