import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard, urlButton } from "../toolkit/index.js";
import { now, productById, readState, updateState } from "../domain.js";

const composer = new Composer<Ctx>();

composer.on("pre_checkout_query", async (ctx) => {
  const payload = ctx.preCheckoutQuery.invoice_payload;
  const orderId = payload.startsWith("order:") ? payload.slice(6) : "";
  const state = await readState(ctx);
  const order = state.orders.find((item) => item.id === orderId && item.status === "pending");
  await ctx.api.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, !!order);
});

composer.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const orderId = payment.invoice_payload.startsWith("order:") ? payment.invoice_payload.slice(6) : "";
  const state = await readState(ctx);
  const order = state.orders.find((item) => item.id === orderId);
  const product = order ? productById(order.productId) : undefined;
  if (!order || !product) {
    await ctx.reply("Платёж получен, но заказ не найден. Владелец поможет разобраться.");
    return;
  }
  if (order.status === "delivered" || order.status === "paid") {
    await ctx.reply("Этот заказ уже обработан. Если файл не пришёл, откройте поддержку.");
    return;
  }
  await updateState(ctx, (current) => {
    const currentOrder = current.orders.find((item) => item.id === order.id);
    if (currentOrder) { currentOrder.status = "paid"; currentOrder.paidAt = now(); }
  });
  let delivery: "direct_upload" | "expiring_link" = "expiring_link";
  let delivered = false;
  try {
    if (product.deliveryPreference === "direct" && product.fileSizeBytes <= 50_000_000) {
      await ctx.api.sendVideo(ctx.chat!.id, product.video, { caption: "Спасибо за покупку! Вот ваше видео.", reply_markup: inlineKeyboard([[urlButton("Скачать", product.video)]]) });
      delivery = "direct_upload";
    } else if (product.video.startsWith("http")) {
      await ctx.reply("Спасибо за покупку! Скачайте видео по ссылке. Она предназначена только для вас.", { reply_markup: inlineKeyboard([[urlButton("Скачать видео", product.video)]]) });
    } else {
      await ctx.reply("Спасибо за покупку! Файл пока нужно передать вручную. Владелец уже получил уведомление.");
    }
    delivered = product.video.startsWith("http") || delivery === "direct_upload";
  } catch {
    if (product.video.startsWith("http")) {
      await ctx.reply("Загрузка не прошла, но видео можно скачать по запасной ссылке.", { reply_markup: inlineKeyboard([[urlButton("Скачать видео", product.video)]]) });
      delivered = true;
    } else {
      await ctx.reply("Оплата прошла, но файл не удалось отправить. Владелец передаст его вручную.");
    }
  }
  await updateState(ctx, (current) => {
    const currentOrder = current.orders.find((item) => item.id === order.id);
    if (currentOrder) { currentOrder.status = delivered ? "delivered" : "failed"; currentOrder.deliveryMethod = delivery; currentOrder.deliveredAt = delivered ? now() : undefined; }
  });
  const owner = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
  const notice = `Новая продажа\nЗаказ: ${order.id}\nВидео: ${product.title}\nПокупатель: ${ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.id ?? "неизвестно"}\nЦена: ${payment.total_amount} ⭐\nДоставка: ${delivered ? delivery : "не удалось"}`;
  if (owner) {
    try { await ctx.api.sendMessage(owner, notice); await updateState(ctx, (current) => { const currentOrder = current.orders.find((item) => item.id === order.id); if (currentOrder) currentOrder.adminNotified = true; current.notificationLog.push({ id: `${order.id}-notice`, orderId: order.id, sentAt: now(), payload: notice }); }); } catch { /* paid order remains auditable */ }
  }
});

export default composer;
