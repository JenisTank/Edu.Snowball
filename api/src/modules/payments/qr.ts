import QRCode from 'qrcode';

/**
 * QR rendering for a UPI intent.
 *
 * The image is produced server-side so the parent app does not pull a 40 kB QR
 * library into a bundle that already has to load on a 3G phone. PNG for the
 * screen, SVG for print (a fee counter can pin the SVG up on a wall).
 */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#111827', light: '#FFFFFF' },
  });
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
  });
}
