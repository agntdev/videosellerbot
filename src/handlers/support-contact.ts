import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId } from "../toolkit/index.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("support:contact", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Если нужна помощь с оплатой или скачиванием, напишите владельцу. Оплата проходит через Telegram Stars.", {
    reply_markup: inlineKeyboard([[inlineButton("✉️ Написать владельцу", "support:send")], [inlineButton("⬅️ В каталог", "menu:main")]]),
  });
});

composer.callbackQuery("support:send", async (ctx) => {
  await ctx.answerCallbackQuery();
  const owner = adminChatId(ctx as Ctx & { env?: Record<string, unknown> });
  if (!owner) {
    await ctx.reply("Контакт владельца ещё не настроен. Попробуйте позже.");
    return;
  }
  try {
    await ctx.api.sendMessage(owner, `Новый вопрос от ${ctx.from?.first_name ?? "покупателя"}. Напишите ему в Telegram: ${ctx.from?.id ?? "неизвестно"}.`);
    await ctx.reply("Сообщение отправлено владельцу. Он скоро ответит.");
  } catch {
    await ctx.reply("Не удалось передать сообщение. Попробуйте ещё раз чуть позже.");
  }
});

export default composer;
