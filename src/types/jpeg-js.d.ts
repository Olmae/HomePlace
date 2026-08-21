// jpeg-js ships no types. Only the one call the barcode decoder makes is
// declared: JPEG bytes in, RGBA pixels out.
declare module "jpeg-js" {
  export interface DecodeOptions {
    useTArray?: boolean;
    maxMemoryUsageInMB?: number;
    formatAsRGBA?: boolean;
    tolerantDecoding?: boolean;
  }
  export interface RawImageData {
    width: number;
    height: number;
    data: Uint8Array;
  }
  export function decode(data: Buffer | Uint8Array, opts?: DecodeOptions): RawImageData;
  export function encode(image: { data: Uint8Array; width: number; height: number }, quality?: number): { data: Uint8Array; width: number; height: number };
  const _default: { decode: typeof decode; encode: typeof encode };
  export default _default;
}
