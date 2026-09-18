import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { requireOwner, inlineButton, inlineKeyboard, urlButton } from "../toolkit/index.js";
import { productById, readState, updateState, now } from "../domain.js";

const composer = new Composer<Ctx>();

composer.command("orders", async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  const state = await readState(ctx);
  if (state.orders.length === 0) { await ctx.reply("Продаж пока нет."); return; }
  const lines = state.orders.slice(-20).map((order) => `${order.id} · ${productById(order.productId)?.title ?? "Видео"} · ${order.status}`);
  await ctx.reply(`Последние заказы:\n${lines.join("\n")}`);
});

composer.command("redeliver", async (ctx) => {
  if (!(await requireOwner(ctx))) return;
  const id = ctx.match?.trim();
  if (!id) { await ctx.reply("Укажите номер заказа после команды."); return; }
  const state = await readState(ctx);
  const order = state.orders.find((item) => item.id === id);
  const product = order ? productById(order.productId) : undefined;
  if (!order || !product) { await ctx.reply("Заказ не найден. Проверьте номер и попробуйте ещё раз."); return; }
  try {
    if (product.video.startsWith("http")) await ctx.api.sendMessage(order.buyerTelegramId, "Вот повторная ссылка на ваше видео.", { reply_markup: inlineKeyboard([[urlButton("Скачать видео", product.video)]]) });
    else await ctx.api.sendVideo(order.buyerTelegramId, product.video, { caption: "Вот ваше видео ещё раз." });
    await updateState(ctx, (current) => { const item = current.orders.find((entry) => entry.id === id); if (item) item.redeliveryAttempts.push(now()); });
    await ctx.reply("Видео отправлено повторно.");
  } catch {
    await ctx.reply("Не удалось отправить видео повторно. Проверьте, что покупатель не заблокировал бота.");
  }
});

export default composer;
