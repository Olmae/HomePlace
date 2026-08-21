import "server-only";
import jpeg from "jpeg-js";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from "@zxing/library";

/**
 * Read a 1-D barcode out of a JPEG.
 *
 * This is the server half of "send a photo of the barcode to the bot": Telegram
 * photos are JPEG, so a pure-JS JPEG decoder turns the bytes into pixels and
 * ZXing reads the bars. No native modules and no camera — it runs wherever the
 * server does. A photo that will not decode returns null, and the caller falls
 * back to asking for the number or a name.
 */

const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];

export function decodeBarcodeFromJpeg(buffer: Buffer): string | null {
  try {
    const img = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
    const { width, height, data } = img; // RGBA

    // ZXing wants one luminance byte per pixel; fold RGBA down with the usual
    // perceptual weights.
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }

    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)));
    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    return reader.decode(bitmap).getText() || null;
  } catch {
    return null; // no readable barcode in the frame
  }
}
