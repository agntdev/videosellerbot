import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { PRODUCTS } from "../domain.js";

const composer = new Composer<Ctx>();
const WELCOME = "👋 Добро пожаловать! Выберите короткое видео:";

function catalogKeyboard() {
  const rows = PRODUCTS.filter((product) => product.visible).flatMap((product) => [
    [inlineButton(`Подробнее · ${product.title}`, `product:details:${product.id}`), inlineButton(`Купить · ${product.priceStars} ⭐`, `product:buy:${product.id}`)],
  ]);
  rows.push([inlineButton("Поддержка", "support:contact"), inlineButton("Обновить", "menu:main")]);
  rows.push([inlineButton("❓ Помощь", "menu:help")]);
  return inlineKeyboard(rows);
}

async function showCatalog(ctx: Ctx, edit = false) {
  if (edit) await ctx.editMessageText(WELCOME, { reply_markup: catalogKeyboard() });
  else await ctx.reply(WELCOME, { reply_markup: catalogKeyboard() });
}

composer.command("start", async (ctx) => showCatalog(ctx));
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCatalog(ctx, true);
});

export default composer;
