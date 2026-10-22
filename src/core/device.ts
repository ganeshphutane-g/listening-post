// Laptops and desktops only (D-008). A device whose every pointer is coarse and that has touch points
// is a phone or tablet; an iPad with a trackpad, or a touch-screen laptop, still has a fine pointer.
export interface DeviceSignals { anyFinePointer: boolean; maxTouchPoints: number }

export function isTouchOnly(s: DeviceSignals): boolean {
  return !s.anyFinePointer && s.maxTouchPoints > 0;
}

export function readDeviceSignals(): DeviceSignals {
  // ?device=touch lets the harness check the notice without a real phone
  if (new URLSearchParams(location.search).get('device') === 'touch') return { anyFinePointer: false, maxTouchPoints: 5 };
  return { anyFinePointer: matchMedia('(any-pointer: fine)').matches, maxTouchPoints: navigator.maxTouchPoints || 0 };
}

/** Replaces the page with a notice; the game never starts on these devices. */
export function showDeviceNotice(): void {
  const el = document.createElement('div');
  el.id = 'device-notice';
  el.innerHTML = '<h1>Listening Post</h1><p>This game needs a laptop or desktop browser with a keyboard and mouse or trackpad.</p><p>Open it in Chrome, Edge, Firefox or Safari on a Mac or Windows computer.</p>';
  document.body.replaceChildren(el);
}
