/**
 * Shared browser-only Site Visit photo preparation.
 *
 * Both Management and Employee portals compress photos the same way before
 * upload. The server independently enforces a 4 MiB processed-image limit.
 * Files remain in memory for the current form only.
 */
export const SITE_VISIT_MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|heic|heif)$/i;

export function isSiteVisitPhoto(file: File): boolean {
  const mime = file.type.toLowerCase();
  const recognizedMime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(mime);
  return recognizedMime || (!mime && IMAGE_EXTENSION.test(file.name));
}

function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob || blob.type !== "image/jpeg") {
          reject(new Error("This browser could not convert the photo to JPG."));
        } else resolve(blob);
      }, "image/jpeg", quality);
    } catch {
      reject(new Error("This browser could not prepare the photo. Try another JPG or PNG."));
    }
  });
}

export async function prepareSiteVisitPhoto(file: File, maxDimension = 1400): Promise<File> {
  if (!isSiteVisitPhoto(file)) throw new Error("Select a JPG, PNG or WebP photo (supported HEIC/HEIF may also work).");
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("The original photo exceeds 40 MB. Choose a smaller photo.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(
        "This browser could not open the photo. If it is HEIC/HEIF, convert it to JPG in your gallery and try again.",
      ));
      image.src = url;
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Photo dimensions could not be read. Try a different image.");
    }

    // Repeat at decreasing size/quality only when needed. The output always
    // meets the server's 4 MiB limit or preparation fails before any POST.
    const attempts = [
      { dimension: maxDimension, quality: 0.78 },
      { dimension: Math.min(maxDimension, 1200), quality: 0.66 },
      { dimension: Math.min(maxDimension, 1000), quality: 0.55 },
    ];
    for (const attempt of attempts) {
      const factor = Math.min(1, attempt.dimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not prepare the photo on this device.");
      // JPEG has no transparency: white prevents PNG alpha from turning black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await canvasJpeg(canvas, attempt.quality);
      if (blob.size <= SITE_VISIT_MAX_PHOTO_BYTES) {
        const base = file.name.replace(/\.[^.]+$/, "") || "site-visit";
        return new File([blob], `${base}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
    throw new Error("This photo is still over 4 MB after compression. Try a smaller photo.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function siteVisitNetworkError(error: unknown, requestStarted: boolean): string {
  const original = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message || "Unknown error")
    : String(error || "Unknown error");
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!requestStarted && offline) return "You are offline. Reconnect before submitting. Your form and selected photos are still here.";
  // A POST can succeed on the server even when its response gets lost. Never
  // automatically retry and risk duplicate Site Visit records.
  if (requestStarted && (offline || error instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed/i.test(original))) {
    return "The connection was interrupted. The visit may already be saved. Check Recent Site Visits before submitting again; your form and photos remain here.";
  }
  return original || "Could not submit Site Visit.";
}
