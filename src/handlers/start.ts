import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { menuText, state } from "../shop.js";

const composer = new Composer<Ctx>();

export function catalogKeyboard(products: { id: string }[]) {
  return inlineKeyboard([
    ...products.map((p) => [
      inlineButton("Подробнее", `product:details:${p.id}`),
      inlineButton("Купить", `product:buy:${p.id}`),
    ]),
    [inlineButton("Поддержка", "support:contact"), inlineButton("Обновить", "menu:main")],
  ]);
}

composer.command("start", async (ctx) => {
  const shop = await state(ctx);
  await ctx.reply(menuText(shop), { reply_markup: catalogKeyboard(shop.products.filter((p) => p.visible)) });
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  const shop = await state(ctx);
  await ctx.editMessageText(menuText(shop), { reply_markup: catalogKeyboard(shop.products.filter((p) => p.visible)) });
});

composer.callbackQuery("catalog:open", async (ctx) => {
  await ctx.answerCallbackQuery();
  const shop = await state(ctx);
  await ctx.editMessageText(menuText(shop), { reply_markup: catalogKeyboard(shop.products.filter((p) => p.visible)) });
});

export default composer;
