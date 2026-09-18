import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { productById } from "../domain.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^product:details:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const product = productById(ctx.match[1]);
  if (!product || !product.visible) {
    await ctx.reply("Не нашли это видео. Откройте каталог ещё раз.");
    return;
  }
  await ctx.reply(
    `${product.title}\n\n${product.fullDescription}\n\nРазмер файла: ${Math.round(product.fileSizeBytes / 1_000_000)} МБ.\nЦена: ${product.priceStars} ⭐`,
    { reply_markup: inlineKeyboard([[inlineButton("Купить", `product:buy:${product.id}`)], [inlineButton("⬅️ В каталог", "menu:main")]]) },
  );
});

export default composer;
