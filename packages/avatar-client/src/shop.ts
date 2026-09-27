/* The avatar NFT shop: wire types of `/avatar/v1/shop*` and `/avatar/v1/me/shop/*`, plus a
 * small typed client. See docs/client.md.
 *
 * Prebuilt (curated) avatars are sold as ERC-721 tokens for the platform ERC-20, paid from
 * the wallet linked to the player's ArkPlay account. The player's own wallet signs every
 * transaction; the service only prepares call data and verifies receipts on chain.
 *
 * Amounts are decimal strings of token base units (never floats); format them with
 * `formatUnits(BigInt(price), token.decimals)` from `./evm.ts`. Like types.ts, these are a
 * public contract: add fields, never rename or remove them. */

import { AvatarApiError, imageQuery, type AvatarClientOptions, type TokenGetter } from './client.ts'
import { AVATAR_API_PREFIX, type ApiErrorBody, type AvatarRarity, type ImageOptions } from './types.ts'

/** `disabled`: AVATAR_SHOP_ENABLED is off. `unconfigured`: on, but a chain setting is missing. */
export type ShopStatus = 'enabled' | 'disabled' | 'unconfigured'

/** `GET /avatar/v1/shop`: whether the shop can take orders, and on which chain and token. */
export interface ShopInfo {
  status: ShopStatus
  /** True only when `status` is `enabled`. Nothing may try to transact otherwise. */
  enabled: boolean
  /** EVM chain id (8453 = Base, 84532 = Base Sepolia, 31337 = a local Hardhat node). */
  chainId: number
  /** The ERC-20 prices are paid in. `address` is null until configured. */
  token: { address: string | null; symbol: string; decimals: number }
  /** The ArkPlayAvatars ERC-721 contract, or null until configured. */
  contract: string | null
  /** Blocks a purchase needs on top of its own before the service records it. */
  confirmations: number
}

/** Service-relative image paths for a prebuilt (`/avatar/v1/shop/prebuilts/{id}/image.png`). */
export interface PrebuiltImages {
  /** Omitted when the service can't rasterize (`Capabilities.raster` false). */
  png?: string
  svg: string
}

/** One curated avatar in the shop (`GET /avatar/v1/shop/prebuilts`). Its DNA is not public. */
export interface PrebuiltAvatar {
  id: string
  /** The `prebuiltId` the contract knows it by. */
  onchainId: number
  name: string
  description: string
  kind: 'humanoid' | 'creature'
  theme?: string
  /** The engine's `avatarRarity(dna, { nft: true })`: an NFT prebuilt counts its NFT status. */
  rarity: AvatarRarity
  /** Price in token base units (decimal string). Empty when the owner hasn't priced it. */
  price: string
  maxSupply: number
  sold: number
  remaining: number
  /** Priced, listed and not sold out. The shop itself may still be disabled (see ShopInfo). */
  available: boolean
  /** Labels of limited-edition or NFT-only items it wears. */
  special: string[]
  images: PrebuiltImages
}

/** A prepared contract call for the player's wallet: `eth_sendTransaction({ to, data })`. */
export interface ContractCall {
  to: string
  /** Canonical signature, e.g. `approve(address,uint256)`. */
  function: string
  /** Arguments as strings: addresses and decimal integers. */
  args: string[]
  /** ABI-encoded calldata (selector + arguments). */
  data: string
}

export type ShopOrderStatus = 'pending' | 'confirmed' | 'expired'

/** An order: a quote for one prebuilt, bound to the account's linked wallet. */
export interface ShopOrder {
  id: string
  prebuiltId: string
  onchainId: number
  status: ShopOrderStatus
  chainId: number
  /** The linked wallet that must send `buy` (lowercase). */
  wallet: string
  /** Base units (decimal string); also the `maxPrice` passed to `buy`. */
  price: string
  token: string
  contract: string
  /** `approve` exactly the price (only if the allowance is short), then `buy`. */
  calls: { approve: ContractCall; buy: ContractCall }
  /** The purchase transaction, once one has been verified against this order. */
  txHash: string | null
  confirmations: number
  requiredConfirmations: number
  /** Set once confirmed. `avatarId` is the saved copy in the player's avatars (null if their shelf was full). */
  nft: { tokenId: string; avatarId: string | null } | null
  /** The last verification problem, for support. Cleared on success. */
  lastError: { code: string; message: string } | null
  createdAt: string
  updatedAt: string
}

/** An NFT the service has recorded for the caller (`GET /avatar/v1/me/shop/nfts`). */
export interface OwnedNft {
  tokenId: string
  prebuiltId: string
  name: string
  rarity: AvatarRarity
  /** Wallet that held it at the last on-chain check (lowercase). */
  wallet: string
  avatarId: string | null
  /** `owned` keeps the entitlement; `transferred` lost it when the token left the wallet. */
  status: 'owned' | 'transferred'
  /** Last successful `ownerOf` check; ownership is re-checked lazily when this list is read. */
  verifiedAt: string
  purchasedAt: string
  txHash: string
  images: PrebuiltImages
}

export interface ConfirmResult {
  order: ShopOrder
  /** True (HTTP 202) while the transaction still needs confirmations: poll again after `retryAfter` s. */
  pending: boolean
  retryAfter?: number
}

/** Typed client for the shop routes. Same options (and token hook) as `AvatarClient`. */
export class ShopClient {
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

  /** Public image URL of a prebuilt (`size`, `crop`… as on every image route). */
  prebuiltImageUrl(id: string, o: ImageOptions = {}): string {
    return this.url(`/shop/prebuilts/${encodeURIComponent(id)}/image.${o.format ?? 'png'}${imageQuery(o)}`)
  }

  async info(): Promise<ShopInfo> {
    return (await this.request('GET', '/shop', undefined, false)).body as ShopInfo
  }

  async prebuilts(): Promise<PrebuiltAvatar[]> {
    return ((await this.request('GET', '/shop/prebuilts', undefined, false)).body as { prebuilts: PrebuiltAvatar[] }).prebuilts
  }

  async orders(): Promise<ShopOrder[]> {
    return ((await this.request('GET', '/me/shop/orders')).body as { orders: ShopOrder[] }).orders
  }

  async order(id: string): Promise<ShopOrder> {
    return (await this.request('GET', `/me/shop/orders/${encodeURIComponent(id)}`)).body as ShopOrder
  }

  /** Quotes a prebuilt for the caller's linked wallet. */
  async createOrder(prebuiltId: string): Promise<ShopOrder> {
    return (await this.request('POST', '/me/shop/orders', { prebuiltId })).body as ShopOrder
  }

  /** Asks the service to verify `txHash` on chain and record the NFT. Idempotent. */
  async confirmOrder(id: string, txHash: string): Promise<ConfirmResult> {
    const res = await this.request('POST', `/me/shop/orders/${encodeURIComponent(id)}/confirm`, { txHash })
    return { order: res.body as ShopOrder, pending: res.status === 202, retryAfter: res.retryAfter }
  }

  /** The caller's recorded NFTs, with ownership re-checked on chain when stale. */
  async nfts(): Promise<OwnedNft[]> {
    return ((await this.request('GET', '/me/shop/nfts')).body as { nfts: OwnedNft[] }).nfts
  }

  /** Claims an NFT that was transferred into the caller's linked wallet. */
  async claimNft(tokenId: string): Promise<OwnedNft> {
    return (await this.request('POST', `/me/shop/nfts/${encodeURIComponent(tokenId)}/claim`, {})).body as OwnedNft
  }

  private async request(method: string, path: string, body?: unknown, auth = true): Promise<{ status: number; body: unknown; retryAfter?: number }> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (auth) {
      const token = await this.getToken?.()
      if (!token) throw new AvatarApiError(401, { code: 'unauthorized', message: 'Sign in to use the shop.' })
      headers.Authorization = `Bearer ${token}`
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await this.fetchImpl(this.url(path), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
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
