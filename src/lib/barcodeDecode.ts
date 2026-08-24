import "server-only";
import jpeg from "jpeg-js";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from "@zxing/library";

/**
 * Read a 1-D barcode out of a JPEG.
 *
 * The server half of "send a photo of the barcode" — used by the Telegram bot
 * and by the site's photo upload (the browser normalises whatever it took to a
 * JPEG first). A pure-JS JPEG decoder turns the bytes into pixels and ZXing
 * reads the bars; no native modules, no camera.
 *
 * A 1-D barcode is a row of vertical bars, so it only decodes when the bars are
 * roughly upright. A photo held sideways has them lying down, which reads as
 * nothing — so each frame is tried at all four right-angle rotations before
 * giving up. A photo that still will not decode returns null, and the caller
 * falls back to the number or a name.
 */

const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
hints.set(DecodeHintType.TRY_HARDER, true);

export function decodeBarcodeFromJpeg(buffer: Buffer): string | null {
  try {
    const img = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });

    // ZXing wants one luminance byte per pixel; fold RGBA down with the usual
    // perceptual weights.
    let gray: Uint8ClampedArray = new Uint8ClampedArray(img.width * img.height);
    for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
      gray[j] = (img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114) | 0;
    }

    let width = img.width;
    let height = img.height;
    for (let turn = 0; turn < 4; turn++) {
      const found = decodeGray(gray, width, height);
      if (found) return found;
      // Rotate 90° clockwise and try again — covers a photo held sideways or
      // upside down.
      const rotated = rotate90(gray, width, height);
      gray = rotated.gray;
      width = rotated.width;
      height = rotated.height;
    }
    return null;
  } catch {
    return null; // not a JPEG, or no readable barcode in it
  }
}

function decodeGray(gray: Uint8ClampedArray, width: number, height: number): string | null {
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)));
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    return reader.decode(bitmap).getText() || null;
  } catch {
    return null;
  }
}

/** A grayscale buffer rotated 90° clockwise: pixel (x,y) → (height-1-y, x). */
function rotate90(gray: Uint8ClampedArray, width: number, height: number): { gray: Uint8ClampedArray; width: number; height: number } {
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[x * height + (height - 1 - y)] = gray[y * width + x];
    }
  }
  return { gray: out, width: height, height: width };
}
