// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signal, effect } from '../js/lib/reactive.mjs';

/** Wait for the microtask flush that reactive effects schedule. */
const tick = () => new Promise((r) => setTimeout(r, 0));

test('effect runs once immediately', () => {
  let runs = 0;
  effect(() => {
    runs += 1;
  });
  assert.equal(runs, 1);
});

test('effect re-runs when a read signal changes', async () => {
  const s = signal(1);
  let seen = 0;
  effect(() => {
    seen = s();
  });
  assert.equal(seen, 1);
  s.set(42);
  await tick();
  assert.equal(seen, 42);
});

test('setting an equal value does not re-run effects', async () => {
  const s = signal(7);
  let runs = 0;
  effect(() => {
    s();
    runs += 1;
  });
  s.set(7);
  await tick();
  assert.equal(runs, 1);
});

test('peek() reads without subscribing', async () => {
  const s = signal(1);
  let runs = 0;
  effect(() => {
    s.peek();
    runs += 1;
  });
  s.set(2);
  await tick();
  assert.equal(runs, 1); // not re-run
});

test('multiple synchronous sets batch into a single re-run', async () => {
  const a = signal(0);
  const b = signal(0);
  let runs = 0;
  effect(() => {
    a();
    b();
    runs += 1;
  });
  a.set(1);
  b.set(1);
  a.set(2);
  await tick();
  assert.equal(runs, 2); // 1 initial + 1 batched
});

test('update() applies a function to the current value', async () => {
  const s = signal(10);
  let seen = 0;
  effect(() => {
    seen = s();
  });
  s.update((v) => v + 5);
  await tick();
  assert.equal(seen, 15);
});

test('disposing an effect stops future runs', async () => {
  const s = signal(1);
  let runs = 0;
  const dispose = effect(() => {
    s();
    runs += 1;
  });
  dispose();
  s.set(2);
  await tick();
  assert.equal(runs, 1);
});
