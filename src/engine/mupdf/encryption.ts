import type * as Mupdf from 'mupdf'

export interface ProtectOptions {
  /** Needed to open the file. */
  userPassword: string
  /** Needed to change the permissions; defaults to the user password. */
  ownerPassword?: string
  allowPrint: boolean
  allowCopy: boolean
  allowEdit: boolean
}

export type DecryptResult = { status: 'ok'; data: Uint8Array } | { status: 'password' }

const ENCRYPT_MARKER = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74] // "/Encrypt"

/**
 * Whether the file is encrypted (has an /Encrypt entry). Also true for files
 * that open without a password but restrict editing: their contents are
 * still encrypted and must be decrypted before other tools can change them.
 */
export function isEncrypted(data: Uint8Array): boolean {
  const first = ENCRYPT_MARKER[0]
  for (
    let i = data.indexOf(first);
    i >= 0 && i <= data.length - ENCRYPT_MARKER.length;
    i = data.indexOf(first, i + 1)
  ) {
    let match = true
    for (let j = 1; j < ENCRYPT_MARKER.length; j++) {
      if (data[i + j] !== ENCRYPT_MARKER[j]) {
        match = false
        break
      }
    }
    if (match) return true
  }
  return false
}

/**
 * PDF permission flags (/P): all allowed (-4), minus what is switched off.
 * Bits: 3 print, 4 modify, 5 copy, 6 annotate, 9 fill forms, 11 assemble,
 * 12 high-quality print. Accessibility extraction (10) stays allowed.
 */
export function permissionFlags({ allowPrint, allowCopy, allowEdit }: ProtectOptions): number {
  let flags = -4
  if (!allowPrint) flags &= ~(4 | 2048)
  if (!allowCopy) flags &= ~16
  if (!allowEdit) flags &= ~(8 | 32 | 256 | 1024)
  return flags
}

/** Passwords go into MuPDF's comma-separated option string: commas can't be used. */
export function validPassword(password: string): boolean {
  return password.length > 0 && !password.includes(',')
}

function save(document: Mupdf.PDFDocument, options: string): Uint8Array {
  const buffer = document.saveToBuffer(options)
  try {
    return buffer.asUint8Array().slice()
  } finally {
    buffer.destroy()
  }
}

/**
 * Removes the encryption of a PDF. Files that open without a password (only
 * restricting editing) need none; otherwise `password` must be the user or
 * owner password.
 */
export function decryptPdf(mupdf: typeof Mupdf, data: Uint8Array, password: string): DecryptResult {
  const document = new mupdf.PDFDocument(data)
  try {
    if (document.needsPassword() && !document.authenticatePassword(password)) {
      return { status: 'password' }
    }
    return { status: 'ok', data: save(document, 'encrypt=none,garbage=compact,compress=yes') }
  } finally {
    document.destroy()
  }
}

/** Encrypts a PDF with AES-256: the user password opens it, the permissions limit printing, copying and changes. */
export function encryptPdf(
  mupdf: typeof Mupdf,
  data: Uint8Array,
  options: ProtectOptions,
): Uint8Array {
  const owner = options.ownerPassword || options.userPassword
  if (!validPassword(options.userPassword) || !validPassword(owner)) {
    throw new Error('Passwörter dürfen nicht leer sein und kein Komma enthalten.')
  }
  const document = new mupdf.PDFDocument(data)
  try {
    return save(
      document,
      [
        'encrypt=aes-256',
        `user-password=${options.userPassword}`,
        `owner-password=${owner}`,
        `permissions=${permissionFlags(options)}`,
        'garbage=compact',
        'compress=yes',
      ].join(','),
    )
  } finally {
    document.destroy()
  }
}
