/* Minimal EVM helpers shared by the avatar service and the website's NFT shop:
 * keccak-256, hex and address handling, ABI encoding for the few static-argument calls
 * the shop makes, log-word decoding, and bigint token amounts.
 *
 * There is no web3 dependency on purpose. The shop needs a handful of fixed function
 * selectors and one event, which doesn't justify a library in the service or in the
 * browser bundle (the Accounts server makes the same call for its balance reads).
 *
 * Money is always a bigint of token base units. Nothing here ever turns an amount into a
 * JavaScript number. */

export type Hex = `0x${string}`

// ---- keccak-256 (the Ethereum variant: pad10*1 with domain byte 0x01, not NIST SHA-3) ------

const MASK64 = (1n << 64n) - 1n

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
]

/** Rotation offsets r[x + 5y]. */
const ROTATIONS = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]

const rotl = (x: bigint, n: number): bigint => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64)

function keccakF(s: bigint[]): void {
  const c = new Array<bigint>(5)
  const b = new Array<bigint>(25)
  for (let round = 0; round < 24; round++) {
    // theta
    for (let x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1)
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d
    }
    // rho and pi: B[y, 2x + 3y] = rot(A[x, y])
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROTATIONS[x + 5 * y])
    }
    // chi
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & b[((x + 2) % 5) + y])
    }
    // iota
    s[0] ^= ROUND_CONSTANTS[round]
  }
}

/** keccak-256 of raw bytes, as 0x-prefixed lowercase hex. */
export function keccak256(data: Uint8Array): Hex {
  const rate = 136
  const padded = new Uint8Array(Math.floor(data.length / rate) * rate + rate)
  padded.set(data)
  padded[data.length] ^= 0x01
  padded[padded.length - 1] ^= 0x80
  const s = new Array<bigint>(25).fill(0n)
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n
      for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k])
      s[i] ^= lane
    }
    keccakF(s)
  }
  let out = '0x'
  for (let i = 0; i < 4; i++) {
    let lane = s[i]
    for (let k = 0; k < 8; k++) {
      out += Number(lane & 0xffn).toString(16).padStart(2, '0')
      lane >>= 8n
    }
  }
  return out as Hex
}

/** keccak-256 of a UTF-8 string (for signatures such as `Transfer(address,address,uint256)`). */
export const keccakText = (text: string): Hex => keccak256(new TextEncoder().encode(text))

/** First four bytes of keccak(signature): `0x095ea7b3` for `approve(address,uint256)`. */
export const functionSelector = (signature: string): Hex => keccakText(signature).slice(0, 10) as Hex

/** topic0 of an event: keccak of its canonical signature. */
export const eventTopic = (signature: string): Hex => keccakText(signature)

// ---- Hex -------------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(hex)) throw new TypeError('Expected 0x-prefixed hex with an even number of digits.')
  const out = new Uint8Array((hex.length - 2) / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let s = '0x'
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s as Hex
}

/** A JSON-RPC quantity (`0x1a`) from a bigint or safe integer. */
export const toQuantity = (n: bigint | number): Hex => `0x${BigInt(n).toString(16)}`

/** A JSON-RPC quantity or 32-byte word to bigint. Throws on anything else. */
export function fromQuantity(q: unknown): bigint {
  if (typeof q !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(q)) throw new TypeError('Expected a 0x-prefixed hex quantity.')
  return BigInt(q)
}

export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/

// ---- Addresses -------------------------------------------------------------------------

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** EIP-55 mixed-case checksum form. */
export function checksumAddress(address: string): string {
  if (!ADDRESS_RE.test(address)) throw new TypeError('Not an Ethereum address.')
  const lower = address.slice(2).toLowerCase()
  const hash = keccakText(lower).slice(2)
  let out = '0x'
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
  return out
}

/** A 20-byte hex address. All-lower or all-upper is accepted; mixed case must be a valid checksum. */
export function isAddress(v: unknown): v is string {
  if (typeof v !== 'string' || !ADDRESS_RE.test(v)) return false
  const body = v.slice(2)
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true
  return checksumAddress(v) === v
}

export const sameAddress = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && ADDRESS_RE.test(a) && ADDRESS_RE.test(b) && a.toLowerCase() === b.toLowerCase()

/** `0x1234…abcd`, for display. */
export const shortAddress = (a: string): string => (ADDRESS_RE.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

// ---- ABI (static types only) -------------------------------------------------------------

export const MAX_UINT256 = (1n << 256n) - 1n

export type AbiValue = bigint | number | string | boolean

function word(type: string, value: AbiValue): string {
  if (type === 'address') {
    if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new TypeError(`Expected an address, got ${String(value)}.`)
    return value.slice(2).toLowerCase().padStart(64, '0')
  }
  if (type === 'bool') {
    if (typeof value !== 'boolean') throw new TypeError('Expected a boolean.')
    return (value ? '1' : '0').padStart(64, '0')
  }
  const m = /^uint(\d{0,3})$/.exec(type)
  if (m) {
    const bits = m[1] ? Number(m[1]) : 256
    if (bits < 8 || bits > 256 || bits % 8) throw new TypeError(`Bad type ${type}.`)
    let n: bigint
    if (typeof value === 'bigint') n = value
    else if (typeof value === 'number' && Number.isSafeInteger(value)) n = BigInt(value)
    else if (typeof value === 'string' && /^\d{1,78}$/.test(value)) n = BigInt(value)
    else throw new TypeError(`Expected an unsigned integer for ${type}.`)
    if (n < 0n || n >= 1n << BigInt(bits)) throw new RangeError(`${n} does not fit ${type}.`)
    return n.toString(16).padStart(64, '0')
  }
  throw new TypeError(`Unsupported ABI type ${type} (static uint/address/bool only).`)
}

/** The parameter types of a canonical signature: `buy(uint256,uint256)` → ['uint256', 'uint256']. */
export function signatureTypes(signature: string): string[] {
  const m = /^[A-Za-z_$][\w$]*\(([^()]*)\)$/.exec(signature)
  if (!m) throw new TypeError(`Bad signature ${signature}.`)
  return m[1] ? m[1].split(',') : []
}

/** Calldata for a call whose arguments are all static: selector + one word per argument. */
export function encodeCall(signature: string, args: readonly AbiValue[]): Hex {
  const types = signatureTypes(signature)
  if (types.length !== args.length) throw new TypeError(`${signature} takes ${types.length} arguments, got ${args.length}.`)
  return `${functionSelector(signature)}${types.map((t, i) => word(t, args[i])).join('')}` as Hex
}

/** Splits return data or log data into 32-byte words. */
export function decodeWords(data: string): bigint[] {
  if (!/^0x([0-9a-fA-F]{64})*$/.test(data)) throw new TypeError('Expected ABI data made of 32-byte words.')
  const out: bigint[] = []
  for (let i = 2; i < data.length; i += 64) out.push(BigInt(`0x${data.slice(i, i + 64)}`))
  return out
}

/** The address in a 32-byte word (a topic or a return value), lowercase. Throws if the top bytes aren't zero. */
export function wordToAddress(w: bigint | string): string {
  const n = typeof w === 'bigint' ? w : fromQuantity(w)
  if (n >> 160n !== 0n) throw new RangeError('Not an address word.')
  return `0x${n.toString(16).padStart(40, '0')}`
}

// ---- Token amounts (bigint base units) ---------------------------------------------------

/**
 * Base units to a decimal string: `formatUnits(12_500000000000000000n, 18)` → `"12.5"`.
 * Exact by default (trailing zeros trimmed). `maxFraction` truncates toward zero, which is
 * right for balances but never for prices; `group` adds thousands separators.
 */
export function formatUnits(value: bigint, decimals: number, opts: { maxFraction?: number; group?: boolean } = {}): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) throw new RangeError('decimals must be 0..77.')
  const neg = value < 0n
  const v = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  let whole = (v / base).toString()
  let frac = decimals ? (v % base).toString().padStart(decimals, '0') : ''
  if (opts.maxFraction !== undefined && opts.maxFraction < frac.length) frac = frac.slice(0, Math.max(0, opts.maxFraction))
  frac = frac.replace(/0+$/, '')
  if (opts.group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`
}

/** A decimal string of whole tokens to base units: `parseUnits("12.5", 18)`. Refuses precision it can't keep. */
export function parseUnits(text: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 77) throw new RangeError('decimals must be 0..77.')
  const m = /^(\d{1,78})(?:\.(\d{1,78}))?$/.exec(text.trim())
  if (!m) throw new TypeError(`"${text}" is not a plain decimal amount.`)
  const frac = m[2] ?? ''
  if (frac.length > decimals && /[^0]/.test(frac.slice(decimals))) throw new RangeError(`"${text}" has more than ${decimals} decimals.`)
  const kept = frac.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(m[1]) * 10n ** BigInt(decimals) + (kept ? BigInt(kept) : 0n)
}

/** A non-negative decimal string of base units within uint256 (`"0"` included). */
export function isBaseUnits(v: unknown): v is string {
  return typeof v === 'string' && /^(0|[1-9]\d{0,77})$/.test(v) && BigInt(v) <= MAX_UINT256
}

// ---- The ArkPlay avatar shop contract (contracts/contracts/ArkPlayAvatars.sol) -----------

/** Canonical signatures the service and the website use. Keep in step with the contract;
 *  contracts/test checks every selector and topic here against the compiled ABI. */
export const SHOP_SIGNATURES = {
  buy: 'buy(uint256,uint256)',
  prebuilt: 'prebuilt(uint256)',
  prebuiltOf: 'prebuiltOf(uint256)',
  ownerOf: 'ownerOf(uint256)',
  paymentToken: 'paymentToken()',
  treasury: 'treasury()',
  paused: 'paused()',
  approve: 'approve(address,uint256)',
  allowance: 'allowance(address,address)',
  balanceOf: 'balanceOf(address)',
  decimals: 'decimals()',
  symbol: 'symbol()',
} as const

export const PURCHASED_EVENT = 'Purchased(address,uint256,uint256,uint256)'
export const TRANSFER_EVENT = 'Transfer(address,address,uint256)'

/** Custom errors a `buy` or `approve` can revert with (the contract's, OpenZeppelin's, ERC-6093's). */
export const SHOP_ERROR_SIGNATURES = [
  'UnknownPrebuilt(uint256)',
  'PrebuiltInactive(uint256)',
  'SoldOut(uint256)',
  'PriceAboveMax(uint256,uint256)',
  'PaymentShortfall(uint256,uint256)',
  'EnforcedPause()',
  'ReentrancyGuardReentrantCall()',
  'SafeERC20FailedOperation(address)',
  'ERC20InsufficientAllowance(address,uint256,uint256)',
  'ERC20InsufficientBalance(address,uint256,uint256)',
  'ERC721InvalidReceiver(address)',
] as const

let errorSelectors: Map<string, string> | null = null

/** The custom error's name (`SoldOut`) from revert data, or null when it isn't one of ours. */
export function shopErrorName(data: unknown): string | null {
  if (typeof data !== 'string' || !/^0x[0-9a-fA-F]{8}/.test(data)) return null
  errorSelectors ??= new Map(SHOP_ERROR_SIGNATURES.map((s) => [functionSelector(s), s.slice(0, s.indexOf('('))]))
  return errorSelectors.get(data.slice(0, 10).toLowerCase()) ?? null
}
