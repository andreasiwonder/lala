const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function normalizeHeading(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function headingPoint(degrees) {
  return POINTS[Math.round(normalizeHeading(degrees) / 45) % POINTS.length];
}

export function headingFromEvent(event, screenAngle = 0) {
  if (Number.isFinite(event.webkitCompassHeading)) {
    // Safari's heading already describes the physical top of the screen, so
    // applying the display rotation again would double-correct landscape use.
    return normalizeHeading(event.webkitCompassHeading);
  }
  if (event.absolute === true && Number.isFinite(event.alpha)) {
    return normalizeHeading(360 - event.alpha + screenAngle);
  }
  return null;
}

export function initPhoneCompass({ root, face, heading, note, button }) {
  if (!root || !face || !heading || !note || !button) return;

  const OrientationEvent = window.DeviceOrientationEvent;
  if (!OrientationEvent || !window.isSecureContext) {
    heading.textContent = 'Unavailable';
    note.textContent = window.isSecureContext
      ? 'This device does not expose a compass sensor.'
      : 'A secure HTTPS connection is required.';
    button.disabled = true;
    return;
  }

  let listening = false;
  let readingReceived = false;
  let fallbackTimer;

  const onReading = (event) => {
    const screenAngle = screen.orientation?.angle || window.orientation || 0;
    const value = headingFromEvent(event, screenAngle);
    if (value == null) return;

    readingReceived = true;
    clearTimeout(fallbackTimer);
    const rounded = Math.round(value) % 360;
    face.style.transform = `rotate(${-value}deg)`;
    heading.textContent = `${rounded}° ${headingPoint(value)}`;
    note.textContent = 'Hold the phone flat; its top edge points on this bearing.';
    root.classList.add('is-active');
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    window.addEventListener('deviceorientationabsolute', onReading, true);
    window.addEventListener('deviceorientation', onReading, true);
    heading.textContent = 'Finding north…';
    note.textContent = 'Move your phone in a figure eight if the reading seems stuck.';
    fallbackTimer = setTimeout(() => {
      if (!readingReceived) {
        heading.textContent = 'No reading';
        note.textContent = 'Compass data is not available in this browser.';
      }
    }, 2500);
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      if (typeof OrientationEvent.requestPermission === 'function') {
        // Absolute permission includes magnetometer access in browsers that
        // implement the current Device Orientation specification.
        const permission = await OrientationEvent.requestPermission(true);
        if (permission !== 'granted') throw new Error('permission denied');
      }
      listen();
    } catch {
      heading.textContent = 'Permission needed';
      note.textContent = 'Allow motion and orientation access to use the compass.';
      button.textContent = 'Try again';
      button.disabled = false;
    }
  });
}
