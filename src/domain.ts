import type { Ctx } from "./bot.js";

export interface Product {
  id: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  thumbnail: string;
  priceStars: number;
  video: string;
  fileSizeBytes: number;
  deliveryPreference: "direct" | "link";
  visible: boolean;
}

export interface Order {
  id: string;
  buyerTelegramId: number;
  buyerUsername?: string;
  productId: string;
  status: "pending" | "paid" | "delivered" | "failed";
  createdAt: string;
  paidAt?: string;
  deliveredAt?: string;
  deliveryMethod?: "direct_upload" | "expiring_link";
  adminNotified: boolean;
  notes?: string;
  redeliveryAttempts: string[];
}

export interface Buyer {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastOrderId?: string;
}

export interface ShopState {
  orders: Order[];
  buyers: Buyer[];
  notificationLog: { id: string; orderId: string; sentAt: string; payload: string }[];
  maintenance: boolean;
}

export const PRODUCTS: Product[] = [
  {
    id: "sunset",
    title: "Закат над городом",
    shortDescription: "Короткое видео с тёплым городским светом.",
    fullDescription: "Мягкий городской закат для вдохновения, сторис или спокойной паузы.",
    thumbnail: "https://picsum.photos/seed/videoseller-sunset/640/360",
    priceStars: 25,
    video: "https://example.com/videos/sunset.mp4",
    fileSizeBytes: 8_000_000,
    deliveryPreference: "link",
    visible: true,
  },
  {
    id: "sea",
    title: "Тихое море",
    shortDescription: "Спокойные волны в коротком видео.",
    fullDescription: "Небольшое видео с морем и ровным ритмом волн — можно скачать сразу после оплаты.",
    thumbnail: "https://picsum.photos/seed/videoseller-sea/640/360",
    priceStars: 35,
    video: "https://example.com/videos/sea.mp4",
    fileSizeBytes: 12_000_000,
    deliveryPreference: "link",
    visible: true,
  },
];

const emptyState = (): ShopState => ({ orders: [], buyers: [], notificationLog: [], maintenance: false });

interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> };
  };
}

function envOf(ctx: Ctx): Record<string, unknown> | undefined {
  return (ctx as Ctx & { env?: Record<string, unknown> }).env;
}

function d1Of(ctx: Ctx): D1Like | undefined {
  const db = envOf(ctx)?.DB;
  return db && typeof (db as D1Like).prepare === "function" ? (db as D1Like) : undefined;
}

/** One clock seam for order timestamps and expiry-related decisions. Tests and
 * runtime adapters can replace `clock.now` without changing handler logic. */
export const clock = { now: (): Date => new Date() };

export function now(): string {
  return clock.now().toISOString();
}

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
}

export async function readState(ctx: Ctx): Promise<ShopState> {
  const db = d1Of(ctx);
  if (db) {
    await db.prepare("CREATE TABLE IF NOT EXISTS video_seller_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)").bind().run();
    const row = await db.prepare("SELECT value FROM video_seller_state WHERE id = ?1").bind("shop").first<{ value: string }>();
    if (row?.value) return JSON.parse(row.value) as ShopState;
    const initial = emptyState();
    await writeState(ctx, initial);
    return initial;
  }
  const session = ctx.session as SessionWithShop;
  if (!session.shop) session.shop = emptyState();
  return session.shop;
}

export async function writeState(ctx: Ctx, state: ShopState): Promise<void> {
  const db = d1Of(ctx);
  if (db) {
    await db.prepare("INSERT INTO video_seller_state (id, value) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET value = excluded.value")
      .bind("shop", JSON.stringify(state)).run();
    return;
  }
  (ctx.session as SessionWithShop).shop = state;
}

export async function updateState(ctx: Ctx, change: (state: ShopState) => void): Promise<ShopState> {
  const state = await readState(ctx);
  change(state);
  await writeState(ctx, state);
  return state;
}

interface SessionWithShop { shop?: ShopState }

export function orderId(ctx: Ctx, productId: string): string {
  return `ord-${ctx.from?.id ?? ctx.chat?.id ?? 0}-${productId}-${now().replace(/\D/g, "").slice(0, 17)}`;
}
