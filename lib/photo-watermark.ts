/**
 * Company-name watermark helpers for Cloudinary task photos.
 * Applied at upload and on delivery (share portal, PDF generation).
 */

export type WatermarkSettings = {
  watermarkEnabled: boolean;
  companyName: string | null;
};

/** Percent-encode text for Cloudinary `l_text` overlay segments. */
export function encodeCloudinaryOverlayText(text: string): string {
  return encodeURIComponent(text.trim().slice(0, 80));
}

/** Build a Cloudinary text-overlay transformation segment. */
export function buildWatermarkTransformSegment(text: string, options?: { jpeg?: boolean }): string {
  const encoded = encodeCloudinaryOverlayText(text);
  const overlay = `l_text:Arial_36_bold:${encoded},o_45,g_south_east,x_24,y_24`;
  if (options?.jpeg) {
    return `${overlay},f_jpg`;
  }
  return overlay;
}

/**
 * Return a Cloudinary delivery URL with company-name watermark overlay.
 * No-op when text is empty or URL is not Cloudinary.
 */
export function buildWatermarkedPhotoUrl(
  originalUrl: string,
  watermarkText: string | null | undefined,
  options?: { jpeg?: boolean }
): string {
  const text = watermarkText?.trim();
  if (!text || !originalUrl.includes('res.cloudinary.com')) {
    return originalUrl;
  }

  const uploadMarker = '/image/upload/';
  const idx = originalUrl.indexOf(uploadMarker);
  if (idx === -1) {
    return originalUrl;
  }

  const base = originalUrl.slice(0, idx + uploadMarker.length);
  const rest = originalUrl.slice(idx + uploadMarker.length);

  // Skip if watermark already present
  if (rest.includes('l_text:')) {
    return originalUrl;
  }

  const transform = buildWatermarkTransformSegment(text, options);
  return `${base}${transform}/${rest}`;
}

export function resolvePhotoDisplayUrl(
  originalUrl: string,
  settings: WatermarkSettings,
  options?: { jpeg?: boolean }
): string {
  if (!settings.watermarkEnabled || !settings.companyName?.trim()) {
    return originalUrl;
  }
  return buildWatermarkedPhotoUrl(originalUrl, settings.companyName, options);
}
