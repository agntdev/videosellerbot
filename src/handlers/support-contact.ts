import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Поддержка", data: "support:contact", order: 90 });
const composer = new Composer<Ctx>();

composer.callbackQuery("support:contact", async (ctx) => {
  await ctx.answerCallbackQuery();
  const ready = Boolean(adminChatId(ctx));
  await ctx.reply(
    ready
      ? "Если нужна помощь с покупкой, напишите владельцу. Оплата проходит через Telegram Stars, а видео приходит сразу после оплаты."
      : "Поддержка пока не настроена. Попробуйте ещё раз позже.",
    { reply_markup: inlineKeyboard([[inlineButton("Написать владельцу", "support:send")], [inlineButton("К каталогу", "menu:main")]]) },
  );
});

composer.callbackQuery("support:send", async (ctx) => {
  await ctx.answerCallbackQuery();
  const owner = adminChatId(ctx);
  if (!owner) { await ctx.reply("Поддержка пока не настроена. Попробуйте ещё раз позже."); return; }
  try {
    const from = ctx.from;
    await ctx.api.sendMessage(owner, `Сообщение от покупателя ${from?.username ? `@${from.username}` : from?.id}: нужна помощь с покупкой.`);
    await ctx.reply("Сообщение отправлено владельцу. Он скоро ответит.");
  } catch {
    await ctx.reply("Не получилось отправить сообщение владельцу. Попробуйте ещё раз.");
  }
});

export default composer;
