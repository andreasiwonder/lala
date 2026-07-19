import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeading, headingPoint, headingFromEvent } from '../js/compass.js';

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
  assert.equal(headingFromEvent({ absolute: false, alpha: 270 }, 0), null);
});
