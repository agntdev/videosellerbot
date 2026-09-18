import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { productFor, state } from "../shop.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^product:details:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = ctx.match[1];
  const product = productFor(await state(ctx), id);
  if (!product) {
    await ctx.reply("Не нашли это видео — откройте каталог ещё раз.", { reply_markup: inlineKeyboard([[inlineButton("К каталогу", "menu:main")]]) });
    return;
  }
  const size = product.fileSizeBytes ? `${Math.ceil(product.fileSizeBytes / 1024 / 1024)} МБ` : "размер уточняется";
  await ctx.reply(`${product.title}\n\n${product.fullDescription}\n\nРазмер файла: ${size}\nЦена: ⭐ ${product.priceStars}`, {
    reply_markup: inlineKeyboard([[inlineButton("Купить", `product:buy:${product.id}`)], [inlineButton("К каталогу", "menu:main")]]),
  });
});

export default composer;
