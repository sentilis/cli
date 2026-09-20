/**
 * Medidas intrínsecas de una imagen, leídas de su cabecera.
 *
 * Existe porque el servidor no puede medirlas: `sharp` está fuera de la imagen
 * de producción a propósito. Sin las medidas, una galería reflota la página
 * entera cada vez que carga una obra, que es justo lo contrario de una sala.
 *
 * Son unas pocas decenas de bytes por formato y ninguna dependencia: bastan
 * las cabeceras de PNG, JPEG, GIF y WebP, que es lo que acepta la plataforma.
 * Un formato que no se reconozca devuelve `null` y quien llame decide.
 */

export interface ImageSize {
  width: number;
  height: number;
}

export function readImageSize(bytes: Uint8Array): ImageSize | null {
  return (
    pngSize(bytes) ?? gifSize(bytes) ?? webpSize(bytes) ?? jpegSize(bytes)
  );
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length; i++) {
    out += String.fromCharCode(bytes[i]!);
  }
  return out;
}

function be32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function be16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function le16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function le24(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

/** IHDR es siempre el primer chunk y siempre está en el mismo sitio. */
function pngSize(bytes: Uint8Array): ImageSize | null {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return null;
  }
  if (bytes.length < 24) return null;
  return { width: be32(bytes, 16), height: be32(bytes, 20) };
}

function gifSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 10) return null;
  if (ascii(bytes, 0, 3) !== "GIF") return null;
  return { width: le16(bytes, 6), height: le16(bytes, 8) };
}

/**
 * Tres envoltorios distintos bajo el mismo RIFF: `VP8 ` con pérdida, `VP8L`
 * sin ella y `VP8X` el extendido (animación, alfa). Cada uno guarda el tamaño
 * en un sitio, y el extendido además lo guarda menos uno.
 */
function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }

  const chunk = ascii(bytes, 12, 4);

  if (chunk === "VP8 ") {
    // Tras la cabecera del chunk: 3 bytes de frame tag y el sync 9D 01 2A.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    return {
      width: le16(bytes, 26) & 0x3fff,
      height: le16(bytes, 28) & 0x3fff,
    };
  }

  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits =
      (bytes[21]! |
        (bytes[22]! << 8) |
        (bytes[23]! << 16) |
        (bytes[24]! << 24)) >>>
      0;
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === "VP8X") {
    return {
      width: le24(bytes, 24) + 1,
      height: le24(bytes, 27) + 1,
    };
  }

  return null;
}

/**
 * En JPEG hay que recorrer los segmentos hasta dar con el marco (SOF). Los
 * SOF van de C0 a CF salvo C4 (tablas Huffman), C8 (extensión) y CC (aritmética),
 * que comparten rango sin ser marcos.
 */
function jpegSize(bytes: Uint8Array): ImageSize | null {
  if (!startsWith(bytes, [0xff, 0xd8])) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // Relleno entre segmentos: una ristra de FF es legal.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return { height: be16(bytes, offset + 5), width: be16(bytes, offset + 7) };
    }
    const length = be16(bytes, offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }

  return null;
}
