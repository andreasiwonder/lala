// @ts-check
/**
 * A ~60-line reactive core: `signal()` holds a value and notifies `effect()`s
 * that read it. Enough structure to drive the review / chat / settings screens
 * without a framework runtime. Deliberately minimal — no batching beyond a
 * microtask flush, no computed graph, no memoisation.
 *
 * @template T
 * @typedef {{ (): T, set(next: T): void, update(fn: (prev: T) => T): void, peek(): T }} Signal
 */

/** @type {(() => void) | null} The effect currently running (for dependency capture). */
let activeEffect = null;

/** @type {Set<() => void>} Effects queued for the next microtask flush. */
const pending = new Set();
let flushScheduled = false;

function flush() {
  flushScheduled = false;
  const running = [...pending];
  pending.clear();
  for (const run of running) run();
}

/** @param {() => void} run */
function enqueue(run) {
  pending.add(run);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

/**
 * Create a reactive signal.
 * @template T
 * @param {T} initial
 * @returns {Signal<T>}
 */
export function signal(initial) {
  let value = initial;
  /** @type {Set<() => void>} */
  const subscribers = new Set();

  const read = /** @type {Signal<T>} */ (
    /** @returns {T} */ function read() {
      if (activeEffect) subscribers.add(activeEffect);
      return value;
    }
  );

  read.peek = () => value;
  /** @param {T} next */
  read.set = (next) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const sub of [...subscribers]) enqueue(sub);
  };
  /** @param {(prev: T) => T} fn */
  read.update = (fn) => read.set(fn(value));

  return read;
}

/**
 * Run `fn` immediately and re-run it whenever a signal it read changes.
 * Returns a disposer that stops future runs.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function effect(fn) {
  let disposed = false;
  function run() {
    if (disposed) return;
    const prev = activeEffect;
    activeEffect = run;
    try {
      fn();
    } finally {
      activeEffect = prev;
    }
  }
  run();
  return () => {
    disposed = true;
  };
}

/**
 * Tiny hyperscript-ish DOM helper. `el('button.primary', { onclick }, 'Save')`.
 * Tag string supports `.class` and `#id` suffixes. Children may be nodes,
 * strings, or nested arrays; nullish children are skipped.
 * @param {string} spec
 * @param {Record<string, unknown> | null} [props]
 * @param {...unknown} children
 * @returns {HTMLElement}
 */
export function el(spec, props, ...children) {
  const [tagAndId, ...classes] = spec.split('.');
  const [tag, id] = tagAndId.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  for (const [key, val] of Object.entries(props ?? {})) {
    if (val == null || val === false) continue;
    if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), /** @type {EventListener} */ (val));
    } else if (key === 'class') {
      node.className = node.className ? `${node.className} ${val}` : String(val);
    } else if (key === 'dataset' && typeof val === 'object') {
      Object.assign(node.dataset, val);
    } else if (key in node && key !== 'list' && key !== 'form') {
      // Property assignment (value, disabled, textContent, …).
      /** @type {any} */ (node)[key] = val;
    } else {
      node.setAttribute(key, String(val));
    }
  }

  appendChildren(node, children);
  return node;
}

/**
 * @param {Node} node
 * @param {unknown[]} children
 */
function appendChildren(node, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}

/**
 * Replace the entire contents of `parent` with `next`.
 * @param {HTMLElement} parent
 * @param {...unknown} next
 */
export function render(parent, ...next) {
  parent.replaceChildren();
  appendChildren(parent, next);
}
