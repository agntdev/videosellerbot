import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { buyerFrom, clock, nextOrderId, productFor, save, state, type Order } from "../shop.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^product:buy:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const shop = await state(ctx);
  const product = productFor(shop, ctx.match[1]);
  if (!product) {
    await ctx.reply("Не нашли это видео — откройте каталог ещё раз.", { reply_markup: inlineKeyboard([[inlineButton("К каталогу", "menu:main")]]) });
    return;
  }
  if (shop.maintenance) {
    await ctx.reply("Магазин временно закрыт на обслуживание. Загляните позже.");
    return;
  }
  const buyer = buyerFrom(ctx);
  const order: Order = {
    id: nextOrderId(shop, buyer.telegramId), buyerTelegramId: buyer.telegramId,
    buyerUsername: buyer.username, productId: product.id, status: "pending",
    createdAt: clock().toISOString(), adminNotified: false, notes: [], redeliveryAttempts: [],
  };
  shop.orderIds.push(order.id); shop.orders.push(order); buyer.lastOrderId = order.id;
  const previousBuyer = shop.buyers.find((b) => b.telegramId === buyer.telegramId);
  if (previousBuyer) Object.assign(previousBuyer, buyer);
  else { shop.buyerIds.push(buyer.telegramId); shop.buyers.push(buyer); }
  await save(ctx, shop);
  await ctx.api.sendInvoice(ctx.chat!.id, product.title, product.shortDescription, `order:${order.id}`, "XTR", [{ label: product.title, amount: product.priceStars }], { provider_token: "", start_parameter: `order-${order.id}` });
});

export default composer;
