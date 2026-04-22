declare module 'piexifjs' {
  type ExifObj = {
    '0th'?: Record<number, unknown>;
    Exif?: Record<number, unknown>;
    GPS?: Record<number, unknown>;
    Interop?: Record<number, unknown>;
    '1st'?: Record<number, unknown>;
    thumbnail?: string | null;
  };
  export const ImageIFD: { Orientation: number; [key: string]: number };
  export function load(jpegData: string): ExifObj;
  export function dump(exifObj: ExifObj): string;
  export function insert(exifBytes: string, jpegData: string): string;
  export function remove(jpegData: string): string;
}
