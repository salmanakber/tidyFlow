import prisma from "@/lib/prisma"

/**
 * Geocode an address using Google Maps Geocoding API
 */
export async function geocodeAddress(address: string, postcode?: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // Get Google Maps API key from settings
    const apiKeySetting = await prisma.systemSetting.findUnique({
      where: { key: "google_maps_api_key" },
    })

    const apiKey = apiKeySetting?.isEncrypted
      ? decryptValue(apiKeySetting.value)
      : apiKeySetting?.value || process.env.GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      console.error("Google Maps API key not found")
      return null
    }

    // Build address string
    const fullAddress = postcode ? `${address}, ${postcode}` : address

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`
    )

    const data = await response.json()

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const location = data.results[0].geometry.location
      return {
        lat: location.lat,
        lng: location.lng,
      }
    }

    console.warn(`Geocoding failed for address: ${fullAddress}`, data.status)
    return null
  } catch (error) {
    console.error("Error geocoding address:", error)
    return null
  }
}

/** Resolve lat/lng for a property — geocode from address when missing and persist. */
export async function ensurePropertyCoordinates(
  propertyId: number
): Promise<{ latitude: number; longitude: number } | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, address: true, postcode: true, latitude: true, longitude: true },
  });
  if (!property) return null;

  if (property.latitude != null && property.longitude != null) {
    return { latitude: Number(property.latitude), longitude: Number(property.longitude) };
  }

  if (!property.address?.trim()) return null;

  const coords = await geocodeAddress(property.address, property.postcode ?? undefined);
  if (!coords) return null;

  await prisma.property.update({
    where: { id: propertyId },
    data: { latitude: coords.lat, longitude: coords.lng },
  });

  return { latitude: coords.lat, longitude: coords.lng };
}

export type GeocodeAllResult = {
  total: number;
  alreadyHadCoords: number;
  geocoded: number;
  failed: number;
  skippedNoAddress: number;
  failures: Array<{ id: number; address: string; reason: string }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Bulk backfill lat/lng for properties that have an address but no coordinates. */
export async function geocodeAllPropertiesForCompany(
  companyId: number,
  options?: { delayMs?: number; limit?: number }
): Promise<GeocodeAllResult> {
  const delayMs = options?.delayMs ?? 250;
  const limit = options?.limit ?? 500;

  const properties = await prisma.property.findMany({
    where: { companyId },
    select: { id: true, address: true, postcode: true, latitude: true, longitude: true },
    orderBy: { id: 'asc' },
    take: limit,
  });

  const result: GeocodeAllResult = {
    total: properties.length,
    alreadyHadCoords: 0,
    geocoded: 0,
    failed: 0,
    skippedNoAddress: 0,
    failures: [],
  };

  for (const property of properties) {
    if (property.latitude != null && property.longitude != null) {
      result.alreadyHadCoords++;
      continue;
    }

    if (!property.address?.trim()) {
      result.skippedNoAddress++;
      continue;
    }

    const coords = await geocodeAddress(property.address, property.postcode ?? undefined);
    if (coords) {
      await prisma.property.update({
        where: { id: property.id },
        data: { latitude: coords.lat, longitude: coords.lng },
      });
      result.geocoded++;
    } else {
      result.failed++;
      result.failures.push({
        id: property.id,
        address: property.address,
        reason: 'Google Geocoding returned no match',
      });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return result;
}

export async function countPropertiesNeedingGeocode(companyId: number): Promise<{
  total: number;
  needsGeocode: number;
  missingAddress: number;
  hasCoords: number;
}> {
  const properties = await prisma.property.findMany({
    where: { companyId },
    select: { address: true, latitude: true, longitude: true },
  });

  let needsGeocode = 0;
  let missingAddress = 0;
  let hasCoords = 0;

  for (const p of properties) {
    if (p.latitude != null && p.longitude != null) {
      hasCoords++;
    } else if (!p.address?.trim()) {
      missingAddress++;
    } else {
      needsGeocode++;
    }
  }

  return { total: properties.length, needsGeocode, missingAddress, hasCoords };
}

/**
 * Decrypt encrypted value (simple implementation - should match encryption in settings)
 */
function decryptValue(encryptedText: string): string {
  try {
    // This should match the decryption logic in email.ts or settings route
    const crypto = require("crypto")
    const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || "default-key-change-in-production"
    const ALGORITHM = "aes-256-cbc"

    const parts = encryptedText.split(":")
    if (parts.length !== 2) return encryptedText

    const iv = Buffer.from(parts[0], "hex")
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32, "0")),
      iv
    )
    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")
    return decrypted
  } catch (e) {
    console.error("Decryption failed:", e)
    return encryptedText
  }
}



