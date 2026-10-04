import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Renders a QR for the verification URI (§5.4) so the user can approve on
 * another device. Generated locally as a data URL — nothing leaves the device.
 */
export const QrCode: React.FC<{
  value: string;
  size?: number;
  color?: string;
  background?: string;
  alt?: string;
}> = ({ value, size = 180, color = '#111827', background = '#FFFFFF', alt = 'QR code' }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: color, light: background },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [value, size, color, background]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size, background }}
        className="rounded-2xl animate-pulse"
        aria-hidden="true"
      />
    );
  }
  return <img src={dataUrl} width={size} height={size} alt={alt} className="rounded-2xl" />;
};
