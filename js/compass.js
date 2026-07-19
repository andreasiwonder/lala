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
  if ((event.absolute === true || event.type === 'deviceorientationabsolute') &&
      Number.isFinite(event.alpha)) {
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
    button.textContent = 'Starting…';
    heading.textContent = 'Requesting access…';
    note.textContent = 'Your browser may ask for motion and orientation access.';
    try {
      if (typeof OrientationEvent.requestPermission === 'function') {
        let permission;
        try {
          // Current implementations accept `true` to include magnetometer
          // access; older Safari versions expose the method with no argument.
          const hasWebKitHeading = 'webkitCompassHeading' in OrientationEvent.prototype;
          permission = hasWebKitHeading
            ? await OrientationEvent.requestPermission()
            : await OrientationEvent.requestPermission(true);
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          permission = await OrientationEvent.requestPermission();
        }
        if (permission !== 'granted') throw new Error('permission denied');
      }
      listen();
    } catch {
      heading.textContent = 'Permission needed';
      note.textContent = 'Allow motion access in your browser settings, then try again.';
      button.textContent = 'Try again';
      button.disabled = false;
    }
  });
}
