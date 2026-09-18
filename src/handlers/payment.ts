import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { clock, orderFor, productFor, save, state } from "../shop.js";

const composer = new Composer<Ctx>();

composer.on("pre_checkout_query", async (ctx) => {
  const query = ctx.preCheckoutQuery;
  const shop = await state(ctx);
  const id = query.invoice_payload.startsWith("order:") ? query.invoice_payload.slice(6) : "";
  const order = orderFor(shop, id);
  if (!order || order.status !== "pending") {
    await ctx.answerPreCheckoutQuery(false, "Этот заказ уже нельзя оплатить.");
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

composer.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const id = payment.invoice_payload.startsWith("order:") ? payment.invoice_payload.slice(6) : "";
  const shop = await state(ctx);
  const order = orderFor(shop, id);
  if (!order) {
    await ctx.reply("Платёж получен, но заказ не найден. Владелец поможет разобраться.");
    return;
  }
  // Telegram may retry delivery of the same update. A paid order is terminal
  // for payment processing, so never send the file or admin notice twice.
  if (order.status !== "pending") return;
  const product = productFor(shop, order.productId);
  if (!product) {
    order.status = "paid";
    order.notes.push("Товар скрыт или удалён после оплаты.");
    await save(ctx, shop);
    await ctx.reply("Спасибо за оплату. Владелец скоро пришлёт видео вручную.");
    return;
  }
  order.status = "paid";
  order.paidAt = clock().toISOString();
  order.paymentChargeId = payment.telegram_payment_charge_id;
  await save(ctx, shop);
  await ctx.reply("Спасибо за оплату! Сейчас отправлю ваше видео.");

  let delivered = false;
  if (product.video && product.fileSizeBytes <= 50 * 1024 * 1024 && product.deliveryPreference === "direct") {
    try {
      await ctx.api.sendVideo(ctx.chat!.id, product.video, {
        caption: `Готово — ${product.title}. Сохраните видео в галерею.`,
        reply_markup: inlineKeyboard([[inlineButton("К каталогу", "menu:main")]]),
      });
      order.deliveryMethod = "direct_upload";
      delivered = true;
    } catch {
      order.notes.push("Прямая отправка не удалась.");
    }
  }
  if (!delivered && product.video.startsWith("https://") && product.fileSizeBytes > 50 * 1024 * 1024) {
    // The URL is owner-provided hosting. We never invent a download URL; an
    // owner can replace the product with a signed, expiring URL at any time.
    try {
      await ctx.reply("Видео большое, поэтому вот ссылка на скачивание. Она действует ограниченное время.", {
        reply_markup: inlineKeyboard([[{ text: "Скачать видео", url: product.video }], [inlineButton("К каталогу", "menu:main")]]),
      });
      order.deliveryMethod = "expiring_link";
      delivered = true;
    } catch { order.notes.push("Ссылка не отправилась."); }
  }
  if (delivered) {
    order.status = "delivered";
    order.deliveredAt = clock().toISOString();
  } else {
    order.notes.push("Видео не прикреплено: владелец должен добавить файл или ссылку.");
    await ctx.reply("Оплата прошла, но файл пока не прикреплён. Владелец пришлёт видео вручную.");
  }
  await notifyOwner(ctx, shop, order.id, product.title, payment.total_amount, delivered ? "доставлено" : "нужна ручная отправка");
  await save(ctx, shop);
});

async function notifyOwner(ctx: Ctx, shop: Awaited<ReturnType<typeof state>>, orderId: string, title: string, stars: number, delivery: string) {
  const owner = adminChatId(ctx);
  const order = orderFor(shop, orderId);
  if (!order) return;
  const message = `Новая продажа\nЗаказ: ${order.id}\nТовар: ${title}\nПокупатель: ${order.buyerUsername ? `@${order.buyerUsername}` : order.buyerTelegramId}\nСумма: ⭐ ${stars}\nДоставка: ${delivery}`;
  if (!owner) {
    order.notificationPending = true;
    order.notes.push("ADMIN_CHAT_ID не настроен — уведомление ожидает отправки.");
    return;
  }
  try {
    await ctx.api.sendMessage(owner, message);
    order.adminNotified = true;
    const id = `notice-${order.id}`;
    if (!shop.notificationIds.includes(id)) {
      shop.notificationIds.push(id);
      shop.notifications.push({ id, orderId, sentAt: clock().toISOString(), deliverablePayload: message });
    }
  } catch {
    order.notificationPending = true;
    order.notes.push("Не удалось уведомить владельца.");
  }
}

export default composer;
