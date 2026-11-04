import type { ImageAsset } from '@/types/annotations'

export type PreparedImage = Omit<ImageAsset, 'url' | 'id'>

/** Longest side in pixels; larger images are scaled down (sharp enough for print). */
export const MAX_IMAGE_SIDE = 2400

/** Whether a file looks like an image the browser may be able to decode. */
export function looksLikeImage(file: Pick<File, 'name' | 'type'>): boolean {
  return (
    file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i.test(file.name)
  )
}

/** Pixel size of PNG or JPEG data, read from the file header. */
export function readImageSize(data: Uint8Array): { width: number; height: number } | null {
  // PNG: width/height in the IHDR chunk
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  // JPEG: scan for a start-of-frame marker
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = data[offset + 1]
      const length = (data[offset + 2] << 8) | data[offset + 3]
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isFrame) {
        return {
          height: (data[offset + 5] << 8) | data[offset + 6],
          width: (data[offset + 7] << 8) | data[offset + 8],
        }
      }
      offset += 2 + length
    }
  }
  return null
}

async function decode(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(blob)
  } catch {
    // Safari can decode HEIC through <img>, but not always through createImageBitmap
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return image
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      type,
      quality,
    ),
  )
}

/**
 * Turns any image the browser can decode into PNG or JPEG data that pdf-lib can
 * embed. PNG and JPEG files of reasonable size are kept as they are; other
 * formats (WebP, GIF, HEIC from iPhones …) and very large images are re-encoded.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const data = new Uint8Array(await file.arrayBuffer())
  const size = readImageSize(data)
  const isPng = size !== null && data[0] === 0x89
  if (size && Math.max(size.width, size.height) <= MAX_IMAGE_SIDE) {
    return { mimeType: isPng ? 'image/png' : 'image/jpeg', data, ...size }
  }

  const source = await decode(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ('close' in source && typeof source.close === 'function') source.close()

  // Photos as JPEG (small), everything else as PNG (keeps transparency)
  const photo = file.type === 'image/jpeg' || /hei[cf]/i.test(file.type)
  const mimeType = photo ? 'image/jpeg' : 'image/png'
  const blob = await canvasToBlob(canvas, mimeType, photo ? 0.88 : undefined)
  return {
    mimeType,
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  }
}

/** Crops transparent margins of a canvas (e.g. around a drawn signature). */
export function trimCanvas(canvas: HTMLCanvasElement, padding = 8): HTMLCanvasElement | null {
  const context = canvas.getContext('2d')!
  const { width, height } = canvas
  const pixels = context.getImageData(0, 0, width, height).data
  let top = height
  let left = width
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return null
  left = Math.max(0, left - padding)
  top = Math.max(0, top - padding)
  right = Math.min(width - 1, right + padding)
  bottom = Math.min(height - 1, bottom + padding)
  const trimmed = document.createElement('canvas')
  trimmed.width = right - left + 1
  trimmed.height = bottom - top + 1
  trimmed.getContext('2d')!.drawImage(canvas, -left, -top)
  return trimmed
}

/**
 * Makes near-white pixels transparent, so a photographed or scanned signature
 * on white paper sits cleanly on the page.
 */
export function removeWhiteBackground(canvas: HTMLCanvasElement, threshold = 225) {
  const context = canvas.getContext('2d')!
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  for (let i = 0; i < pixels.length; i += 4) {
    const lightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    if (lightness >= threshold) pixels[i + 3] = 0
    else if (lightness > threshold - 40) {
      // Soft edge for anti-aliased strokes
      pixels[i + 3] = Math.round(pixels[i + 3] * ((threshold - lightness) / 40))
    }
  }
  context.putImageData(image, 0, 0)
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<PreparedImage> {
  const blob = await canvasToBlob(canvas, 'image/png')
  return {
    mimeType: 'image/png',
    data: new Uint8Array(await blob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  }
}
