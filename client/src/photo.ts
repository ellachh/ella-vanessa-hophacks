/**
 * Turning a phone photo into something safe to put in a replicated table.
 *
 * Every client subscribes to the board, so an image posted by one donor is
 * bytes every volunteer downloads. A 4 MB camera JPEG is not a local problem,
 * it is everyone's problem — the same reasoning that caps `donor` and
 * `description` on the server, with three more orders of magnitude at stake.
 *
 * So the browser downscales and re-encodes before anything is sent, and the
 * module rejects whatever still arrives too large. The cap below mirrors
 * `MAX_PHOTO_CHARS` in `server/spacetimedb/src/lib.rs`; the module is the
 * authority and this only saves a round trip.
 */

/** Mirrors `MAX_PHOTO_CHARS` in the module. */
export const MAX_PHOTO_CHARS = 140_000

/** Longest edge, in pixels, after downscaling. */
export const MAX_EDGE = 720

/**
 * Tried in order until the encoded result fits. Starting lower would be
 * cheaper but visibly worse on the common case, which is a well-lit photo of
 * a tray of food that compresses easily.
 */
const QUALITY_LADDER = [0.72, 0.6, 0.48, 0.36]

/** What the module will accept. Anything else is rejected before upload. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Scale a width/height down so the longest edge is at most `maxEdge`,
 * preserving aspect ratio. Never scales up.
 *
 * Pure, so the sizing rule is testable without a canvas.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 }
  }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) }
  }
  const scale = maxEdge / longest
  // Math.max(1, …) because a very long thin image would otherwise round its
  // short edge to zero, and a zero-width canvas throws.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Does this data URI pass the same check the module applies? */
export function isWithinCap(dataUri: string): boolean {
  return dataUri.length > 0 && dataUri.length <= MAX_PHOTO_CHARS
}

/**
 * The exact prefixes `check_photo` accepts in the module.
 *
 * Kept as literal strings rather than derived from ACCEPTED so that this list
 * and the Rust one can be compared by eye.
 */
const SAFE_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
]

/**
 * Is this string safe to put in an `<img src>`?
 *
 * Photos arrive over a subscription, which means another anonymous client
 * uploaded them. The module already refuses anything without one of these
 * prefixes, so this is the second of two checks rather than the only one — but
 * "user data never reaches an unescaped sink" applies to `src` as much as to
 * `innerHTML`, and a duplicated string test is cheaper than trusting one layer.
 */
export function isSafePhotoSrc(dataUri: string): boolean {
  return isWithinCap(dataUri) && SAFE_PREFIXES.some((prefix) => dataUri.startsWith(prefix))
}

/** Is this a type the module will store at all? */
export function isAcceptedType(type: string): boolean {
  return ACCEPTED.includes(type)
}

/**
 * Read a file into an `<img>`, draw it to a canvas at the reduced size, and
 * encode it as a JPEG data URI small enough to store.
 *
 * Always JPEG regardless of what went in: PNG of a photograph is enormous, and
 * the module accepts PNG only so that a data URI produced elsewhere is not
 * rejected out of hand.
 *
 * Rejects with a sentence that can be shown to the donor as-is.
 */
export async function downscaleToDataUri(file: File): Promise<string> {
  if (!isAcceptedType(file.type)) {
    throw new Error('That file is not a photo we can use — try a JPEG or PNG.')
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight)
    if (width === 0 || height === 0) {
      throw new Error("That image didn't have a size we could read.")
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error("This browser wouldn't let us resize that photo.")
    }
    context.drawImage(image, 0, 0, width, height)

    for (const quality of QUALITY_LADDER) {
      const encoded = canvas.toDataURL('image/jpeg', quality)
      if (isWithinCap(encoded)) return encoded
    }
    throw new Error('That photo is too detailed to store — try a simpler shot.')
  } finally {
    // Whether we succeeded or threw, the object URL is a leak if left behind.
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("That file didn't open as an image."))
    image.src = url
  })
}
