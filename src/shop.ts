import type { Context } from "grammy";
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
  visible: boolean;
  deliveryPreference: "direct" | "link";
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
  notificationPending?: boolean;
  notes: string[];
  redeliveryAttempts: string[];
  paymentChargeId?: string;
}

export interface Buyer {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastOrderId?: string;
}

export interface AdminNotificationLog {
  id: string;
  orderId: string;
  sentAt: string;
  deliverablePayload: string;
}

export interface ShopState {
  products: Product[];
  productIds: string[];
  orders: Order[];
  orderIds: string[];
  buyers: Buyer[];
  buyerIds: number[];
  notifications: AdminNotificationLog[];
  notificationIds: string[];
  maintenance: boolean;
}

export const now = (): Date => new Date();

// The two initial products are metadata-only until the owner attaches a real
// Telegram file id or HTTPS download URL. This is intentional: sending a fake
// media id would create paid orders that cannot be fulfilled.
const SEED_PRODUCTS: Product[] = [
  {
    id: "morning-light",
    title: "Утренний свет",
    shortDescription: "Короткое видео для спокойного начала дня.",
    fullDescription: "Мягкий свет, тишина и несколько секунд для себя. Скачайте видео и храните его в галерее.",
    thumbnail: "",
    priceStars: 25,
    video: "",
    fileSizeBytes: 0,
    visible: true,
    deliveryPreference: "direct",
  },
  {
    id: "city-rain",
    title: "Дождь в городе",
    shortDescription: "Атмосферный городской кадр на каждый день.",
    fullDescription: "Огни, мокрый асфальт и ритм города. Полная версия короткого видео — после оплаты.",
    thumbnail: "",
    priceStars: 35,
    video: "",
    fileSizeBytes: 0,
    visible: true,
    deliveryPreference: "direct",
  },
];

export function emptyShop(): ShopState {
  return {
    products: SEED_PRODUCTS.map((p) => ({ ...p })),
    productIds: SEED_PRODUCTS.map((p) => p.id),
    orders: [], orderIds: [], buyers: [], buyerIds: [],
    notifications: [], notificationIds: [], maintenance: false,
  };
}

// This seam keeps all clock-dependent decisions injectable in tests.
export function clock(): Date { return now(); }

export async function state(ctx: Ctx): Promise<ShopState> {
  const db = (ctx.env as { DB?: D1Like } | undefined)?.DB;
  if (db) {
    await db.exec("CREATE TABLE IF NOT EXISTS video_seller_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const result = await db.prepare("SELECT value FROM video_seller_state WHERE id = ?").bind("shop").first<{ value: string }>();
    if (result?.value) {
      try { const parsed = JSON.parse(result.value) as ShopState; ctx.session.shop = parsed; return parsed; } catch { /* repair below */ }
    }
  }
  if (!ctx.session.shop) ctx.session.shop = emptyShop();
  return ctx.session.shop;
}

export async function save(ctx: Ctx, value: ShopState): Promise<void> {
  ctx.session.shop = value;
  const db = (ctx.env as { DB?: D1Like } | undefined)?.DB;
  if (db) {
    await db.exec("CREATE TABLE IF NOT EXISTS video_seller_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
    await db.prepare("INSERT INTO video_seller_state (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value")
      .bind("shop", JSON.stringify(value)).run();
  }
}

interface D1Like {
  exec(sql: string): Promise<unknown>;
  prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } };
}

export function productFor(shop: ShopState, id: string): Product | undefined {
  return shop.productIds.includes(id) ? shop.products.find((p) => p.id === id && p.visible) : undefined;
}

export function productAny(shop: ShopState, id: string): Product | undefined {
  return shop.productIds.includes(id) ? shop.products.find((p) => p.id === id) : undefined;
}

export function buyerFrom(ctx: Context): Buyer {
  const from = ctx.from!;
  return { telegramId: from.id, username: from.username, firstName: from.first_name, lastName: from.last_name };
}

export function upsertBuyer(shop: ShopState, buyer: Buyer): void {
  const at = shop.buyerIds.indexOf(buyer.telegramId);
  if (at < 0) { shop.buyerIds.push(buyer.telegramId); shop.buyers.push(buyer); }
  else shop.buyers[at] = { ...shop.buyers[at], ...buyer };
}

export function orderFor(shop: ShopState, id: string): Order | undefined {
  return shop.orderIds.includes(id) ? shop.orders.find((o) => o.id === id) : undefined;
}

export function nextOrderId(shop: ShopState, buyerId: number): string {
  const stamp = clock().getTime();
  return `ord-${buyerId}-${stamp}-${shop.orderIds.length + 1}`;
}

export function menuText(shop: ShopState): string {
  const products = shop.products.filter((p) => p.visible);
  if (products.length === 0) return "Сейчас видео нет — загляните позже.";
  return "Выберите короткое видео:\n\n" + products.map((p) => `${p.title}\n${p.shortDescription}\n⭐ ${p.priceStars}`).join("\n\n");
}

export function productKeyboard(p: Product) {
  return { inline_keyboard: [[
    { text: "Подробнее", callback_data: `product:details:${p.id}` },
    { text: "Купить", callback_data: `product:buy:${p.id}` },
  ]] };
}
