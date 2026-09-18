import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { orderId, productById, updateState, now } from "../domain.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^product:buy:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product = productById(ctx.match[1]);
  if (!product || !product.visible) {
    await ctx.reply("Не нашли это видео. Откройте каталог ещё раз.");
    return;
  }
  const state = await updateState(ctx, (current) => {
    if (current.maintenance) return;
    const order = {
      id: orderId(ctx, product.id),
      buyerTelegramId: ctx.from?.id ?? ctx.chat?.id ?? 0,
      buyerUsername: ctx.from?.username,
      productId: product.id,
      status: "pending" as const,
      createdAt: now(),
      adminNotified: false,
      redeliveryAttempts: [],
    };
    current.orders.push(order);
    const buyer = current.buyers.find((item) => item.telegramId === order.buyerTelegramId);
    if (buyer) buyer.lastOrderId = order.id;
    else current.buyers.push({ telegramId: order.buyerTelegramId, username: ctx.from?.username, firstName: ctx.from?.first_name, lastName: ctx.from?.last_name, lastOrderId: order.id });
  });
  if (state.maintenance) {
    await ctx.reply("Покупки временно приостановлены. Загляните чуть позже.");
    return;
  }
  const order = state.orders[state.orders.length - 1];
  await ctx.api.sendInvoice(ctx.chat!.id, product.title, product.fullDescription, `order:${order.id}`, "XTR", [{ label: product.title, amount: product.priceStars }], {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ В каталог", "menu:main")]]),
  });
});

export default composer;
