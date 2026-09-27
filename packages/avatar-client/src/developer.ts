/* The Avatar API developer portal: wire types of `GET /avatar/v1/developer/plans`,
 * `/avatar/v1/me/developer/*` and the developer admin routes, plus `DeveloperClient`, a small
 * typed client for the website's portal. See docs/client.md.
 *
 * Developers sign in with their ArkPlay account, accept the API terms, create API keys (the
 * secret is shown ONCE, in the `POST …/keys` answer), watch their usage, buy or upgrade a plan
 * and redeem vouchers. A plan belongs to the ACCOUNT: every key the account owns follows the
 * account's plan and shares its monthly quota.
 *
 * API keys are for BACKENDS. `DeveloperClient` never sends one, and a page must never keep one
 * after showing it. Like types.ts, this file is a public contract: add fields, never rename or
 * remove them. */

import { AvatarApiError, type AvatarClientOptions, type TokenGetter } from './client.ts'
import type { ContractCall } from './shop.ts'
import { AVATAR_API_PREFIX, type ApiErrorBody, type ApiKeyInfo, type ApiKeyScope } from './types.ts'

/** Thumbnail formats. `png` needs a raster-enabled server (`DeveloperPlansResponse.formats`). */
export type ThumbnailFormat = 'svg' | 'png'

export interface DeveloperPlanPrice {
  /** Monthly price in US cents, for invoiced (manual) payment. 0 = free; null = on request. */
  usdCents: number | null
  /** Monthly price in whole platform tokens as a decimal string ("90", "12.5"); null = not payable in tokens. */
  tokens: string | null
  /** Monthly price in Kash (whole units); null = not payable in Kash. */
  kash: number | null
}

/** One row of the plan table (`GET /avatar/v1/developer/plans`). */
export interface DeveloperPlan {
  /** Stable id stored in grants and orders (`free`, `indie`, `studio`, `enterprise`). */
  id: string
  name: string
  description: string
  /** Requests per calendar month (UTC) for the whole account; null = no fixed quota. */
  monthlyRequests: number | null
  /** Sustained requests per minute per key, and the burst on top. */
  requestsPerMinute: number
  burst: number
  /** New renders (cache misses) per minute per key, and their burst. Cached thumbnails are free. */
  rendersPerMinute: number
  renderBurst: number
  /** Largest thumbnail `size` (px) the plan may ask for. */
  maxSize: number
  formats: ThumbnailFormat[]
  /** Lookups by email (hash or plain). Without it, only handles. */
  emailLookup: boolean
  commercialUse: boolean
  /** "Avatars by ArkPlay" must be shown near the avatars. */
  attributionRequired: boolean
  /** Live keys an account on this plan may hold. */
  maxKeys: number
  /** Can be ordered on the website. */
  purchasable: boolean
  /** Priced per contract: talk to ArkPlay. */
  contactSales: boolean
  price: DeveloperPlanPrice
  /** Short selling points for the pricing table. */
  highlights: string[]
}

export type DeveloperPaymentMethod = 'manual' | 'tokens' | 'kash'

/** A way to pay for an order, as this server offers it right now. */
export interface DeveloperPaymentOption {
  method: DeveloperPaymentMethod
  enabled: boolean
  label: string
  description: string
  /** Token payments: the chain, the ERC-20 and the treasury that receives payments (null until configured). */
  token?: { chainId: number; address: string | null; symbol: string; decimals: number; treasury: string | null; confirmations: number }
}

export interface DeveloperTerms {
  /** Accept this exact version (`POST /me/developer/terms`) before creating keys, ordering or redeeming. */
  version: string
  /** Full terms, when published. */
  url: string | null
  /** The rules in short. */
  points: string[]
}

/** `GET /avatar/v1/developer/plans` (public). */
export interface DeveloperPlansResponse {
  plans: DeveloperPlan[]
  /** The plan every account is on without a grant. */
  defaultPlan: string
  terms: DeveloperTerms
  payments: DeveloperPaymentOption[]
  /** Formats this server renders right now (`png` only with a raster-enabled server). */
  formats: ThumbnailFormat[]
  /** Thumbnail sizes a requested `size` is snapped up to. */
  sizes: number[]
  /** Self-serve sign-up, key creation, orders and redemptions are open. */
  selfServe: boolean
}

export type DeveloperKeyStatus = 'active' | 'suspended' | 'revoked' | 'expired'

export interface DeveloperKeyUsage {
  /** Requests this key made this calendar month (UTC). */
  month: number
  /** Requests today (UTC). */
  today: number
}

/** A key as its owner sees it. The secret is never shown again after creation. */
export interface DeveloperKey {
  id: string
  name: string
  /** `apk_<id>_`: the public start of the key, to recognise it. */
  prefix: string
  status: DeveloperKeyStatus
  /** The plan whose limits apply: the account's, unless ArkPlay pinned the key to one. */
  plan: string
  scopes: ApiKeyScope[]
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  lastUsedAt: string | null
  usage: DeveloperKeyUsage
}

/** `POST /avatar/v1/me/developer/keys` → 201. */
export interface DeveloperKeyCreated {
  /** `apk_<id>_<secret>`: in this answer only. Store it in your backend's secrets. */
  key: string
  apiKey: DeveloperKey
}

export type DeveloperGrantSource = 'order' | 'voucher' | 'grant'

/** A plan for a time window: from an order, a voucher or ArkPlay. The best running grant wins. */
export interface DeveloperGrant {
  id: string
  plan: string
  source: DeveloperGrantSource
  startsAt: string
  expiresAt: string
  /** Running now (started, not ended, not revoked). */
  active: boolean
  revokedAt: string | null
}

export interface DeveloperQuota {
  /** Calendar month (UTC), `YYYY-MM`. */
  month: string
  used: number
  /** null: no fixed monthly quota. */
  limit: number | null
  /** First instant of next month (UTC), when `used` starts again from 0. */
  resetsAt: string
}

/** `GET /avatar/v1/me/developer`. */
export interface DeveloperAccount {
  sub: string
  /** The plan whose limits apply now. */
  plan: DeveloperPlan
  /** When the grant behind the current plan ends (null on the default plan). */
  planUntil: string | null
  terms: { version: string; acceptedVersion: string | null; acceptedAt: string | null; accepted: boolean }
  quota: DeveloperQuota
  keys: { active: number; max: number }
  /** Running and upcoming grants, and the ones that ended in the last 90 days; newest first. */
  grants: DeveloperGrant[]
}

export interface DeveloperUsageDay {
  /** `YYYY-MM-DD` (UTC). */
  day: string
  requests: number
  /** Requests that needed a new render (cache misses). */
  renders: number
}

/** `GET /avatar/v1/me/developer/keys/{id}/usage?days=N`: oldest day first, today last. */
export interface DeveloperUsage {
  keyId: string
  days: DeveloperUsageDay[]
  requests: number
  renders: number
}

export type DeveloperOrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired'

/** How to pay an order. */
export type DeveloperPayment =
  | { method: 'manual'; reference: string; instructions: string }
  | {
      method: 'tokens'
      chainId: number
      token: string
      symbol: string
      decimals: number
      treasury: string
      /** The wallet linked to the account: the payment must come from it. */
      wallet: string
      /** Exact amount in base units (decimal string). */
      amount: string
      /** `transfer(treasury, amount)` on the token, ready for the wallet. */
      transfer: ContractCall
      instructions: string
    }
  | { method: 'kash'; instructions: string }

export interface DeveloperOrder {
  id: string
  plan: string
  months: number
  method: DeveloperPaymentMethod
  status: DeveloperOrderStatus
  /** `USD` (amount in cents) or the token's symbol (amount in base units). */
  currency: string
  amount: string
  /** For people: "$27.00", "270 Kash+". */
  amountLabel: string
  payment: DeveloperPayment
  /** The verified payment transaction (token payments). */
  txHash: string | null
  confirmations: number
  requiredConfirmations: number
  /** The plan grant made when the order was paid. */
  grantId: string | null
  lastError: { code: string; message: string } | null
  createdAt: string
  updatedAt: string
  paidAt: string | null
  /** A pending order expires then. */
  expiresAt: string
}

/** `POST /avatar/v1/me/developer/orders`. `method` defaults to `manual`. */
export interface DeveloperOrderRequest {
  plan: string
  months: number
  method?: DeveloperPaymentMethod
}

export interface DeveloperOrderConfirmResult {
  order: DeveloperOrder
  /** True (HTTP 202) while the transaction needs more confirmations: try again after `retryAfter` s. */
  pending: boolean
  retryAfter?: number
}

/** `POST /avatar/v1/me/developer/redeem`. */
export interface VoucherRedeemed {
  grant: DeveloperGrant
  account: DeveloperAccount
  /** This account had already redeemed this voucher batch: nothing new was granted. */
  alreadyRedeemed: boolean
}

// ---- Admin (X-ArkPlay-Platform-Key) ------------------------------------------------------

/** What the admin key routes list: `ApiKeyInfo` plus the developer columns. */
export interface ApiKeyAdminInfo extends ApiKeyInfo {
  /** A plan pinned to the key; null = the owner's plan (or, without an owner, a legacy partner key). */
  plan: string | null
  ownerSub: string | null
  status: DeveloperKeyStatus
}

export interface VoucherBatch {
  id: string
  plan: string
  /** Length of the grant each redemption makes: `months` calendar months plus `days` days. */
  months: number
  days: number
  /** Codes in the batch. */
  codes: number
  /** Redemptions each code allows (by different accounts). */
  maxRedemptions: number
  redeemed: number
  /** Redeem by (null = no deadline). */
  expiresAt: string | null
  note: string
  createdBy: 'admin' | 'cli'
  createdAt: string
  revokedAt: string | null
}

/** `POST /avatar/v1/admin/developer/vouchers` → 201. `codes` are shown only here. */
export interface VoucherBatchCreated {
  batch: VoucherBatch
  codes: string[]
}

// ---- Voucher codes ---------------------------------------------------------------------

/** Crockford base32: no I, L, O or U, so codes survive being read aloud or typed. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * A voucher code in its canonical form `ARK-XXXX-XXXX-XXXX-XXXX` (16 Crockford base32
 * characters, 80 bits), or null. Case, spaces and dashes don't matter, the `ARK` prefix is
 * optional, and O/I/L are read as 0/1/1.
 */
export function normalizeVoucherCode(input: string): string | null {
  if (typeof input !== 'string' || input.length > 64) return null
  let s = input.toUpperCase().replace(/[\s-]+/g, '')
  if (s.length === 19 && s.startsWith('ARK')) s = s.slice(3)
  if (s.length !== 16) return null
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1')
  for (const ch of s) if (!CROCKFORD.includes(ch)) return null
  return `ARK-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`
}

/** Days of daily usage `DeveloperClient.usage` may ask for. */
export const DEVELOPER_USAGE_MAX_DAYS = 90

// ---- Client ------------------------------------------------------------------------------

/** Typed client for the developer portal routes. Same options (and token hook) as `AvatarClient`. */
export class DeveloperClient {
  readonly baseUrl: string
  private readonly getToken?: TokenGetter
  private readonly fetchImpl: typeof fetch

  constructor(opts: AvatarClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? '').replace(/\/+$/, '')
    this.getToken = opts.getToken
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args))
  }

  url(path: string): string {
    return `${this.baseUrl}${AVATAR_API_PREFIX}${path}`
  }

  /** The plan table, the terms and the payment methods (public). */
  async plans(signal?: AbortSignal): Promise<DeveloperPlansResponse> {
    return (await this.request('GET', '/developer/plans', undefined, false, signal)).body as DeveloperPlansResponse
  }

  async account(signal?: AbortSignal): Promise<DeveloperAccount> {
    return (await this.request('GET', '/me/developer', undefined, true, signal)).body as DeveloperAccount
  }

  /** Accepts the API terms of `version` (the one `plans()` names). */
  async acceptTerms(version: string): Promise<DeveloperAccount> {
    return (await this.request('POST', '/me/developer/terms', { version })).body as DeveloperAccount
  }

  async keys(signal?: AbortSignal): Promise<DeveloperKey[]> {
    return ((await this.request('GET', '/me/developer/keys', undefined, true, signal)).body as { keys: DeveloperKey[] }).keys
  }

  /** Creates a key on the account's plan. The answer's `key` is the only copy of the secret. */
  async createKey(name: string): Promise<DeveloperKeyCreated> {
    return (await this.request('POST', '/me/developer/keys', { name })).body as DeveloperKeyCreated
  }

  /** Revokes a key at once (idempotent). */
  async revokeKey(id: string): Promise<DeveloperKey> {
    return (await this.request('POST', `/me/developer/keys/${encodeURIComponent(id)}/revoke`, {})).body as DeveloperKey
  }

  /** Daily requests of one key, `days` (1..90) days ending today. */
  async usage(id: string, days = 30, signal?: AbortSignal): Promise<DeveloperUsage> {
    const n = Math.max(1, Math.min(DEVELOPER_USAGE_MAX_DAYS, Math.round(days)))
    return (await this.request('GET', `/me/developer/keys/${encodeURIComponent(id)}/usage?days=${n}`, undefined, true, signal)).body as DeveloperUsage
  }

  async orders(signal?: AbortSignal): Promise<DeveloperOrder[]> {
    return ((await this.request('GET', '/me/developer/orders', undefined, true, signal)).body as { orders: DeveloperOrder[] }).orders
  }

  async order(id: string): Promise<DeveloperOrder> {
    return (await this.request('GET', `/me/developer/orders/${encodeURIComponent(id)}`)).body as DeveloperOrder
  }

  /** Orders `months` of a plan. Pending until paid; the plan starts when it is. */
  async createOrder(req: DeveloperOrderRequest): Promise<DeveloperOrder> {
    return (await this.request('POST', '/me/developer/orders', req)).body as DeveloperOrder
  }

  /** Token payments: asks the service to verify `txHash` on chain. Idempotent. */
  async confirmOrder(id: string, txHash: string): Promise<DeveloperOrderConfirmResult> {
    const res = await this.request('POST', `/me/developer/orders/${encodeURIComponent(id)}/confirm`, { txHash })
    return { order: res.body as DeveloperOrder, pending: res.status === 202, retryAfter: res.retryAfter }
  }

  async cancelOrder(id: string): Promise<DeveloperOrder> {
    return (await this.request('POST', `/me/developer/orders/${encodeURIComponent(id)}/cancel`, {})).body as DeveloperOrder
  }

  /** Redeems a voucher code for the plan it grants. Idempotent per account and batch. */
  async redeem(code: string): Promise<VoucherRedeemed> {
    return (await this.request('POST', '/me/developer/redeem', { code })).body as VoucherRedeemed
  }

  private async request(method: string, path: string, body?: unknown, auth = true, signal?: AbortSignal): Promise<{ status: number; body: unknown; retryAfter?: number }> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (auth) {
      const token = await this.getToken?.()
      if (!token) throw new AvatarApiError(401, { code: 'unauthorized', message: 'Sign in to use the developer portal.' })
      headers.Authorization = `Bearer ${token}`
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await this.fetchImpl(this.url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
    const ra = Number(res.headers.get('Retry-After'))
    const retryAfter = Number.isFinite(ra) && ra > 0 ? ra : undefined
    if (res.ok) return { status: res.status, body: await res.json(), retryAfter }
    let err: ApiErrorBody = { code: `http_${res.status}`, message: res.statusText || `Request failed (${res.status})` }
    try {
      const j = (await res.json()) as Partial<ApiErrorBody>
      if (typeof j.code === 'string' && typeof j.message === 'string') err = { code: j.code, message: j.message, details: j.details }
    } catch {
      // Not JSON (a proxy error page): keep the status-based error.
    }
    throw new AvatarApiError(res.status, err, retryAfter)
  }
}
