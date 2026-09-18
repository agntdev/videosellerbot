import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { readState, updateState } from "../domain.js";

registerMainMenuItem({ label: "Управление", data: "owner:desk", order: 90 });

const composer = new Composer<Ctx>();

composer.callbackQuery("owner:desk", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const state = await readState(ctx);
  const sales = state.orders.filter((order) => order.status === "paid" || order.status === "delivered").length;
  await ctx.reply(`Продаж: ${sales}\nЗаказов всего: ${state.orders.length}\nРежим: ${state.maintenance ? "пауза покупок" : "приём заказов"}`, {
    reply_markup: inlineKeyboard([[inlineButton(state.maintenance ? "Включить покупки" : "Поставить на паузу", "owner:maintenance")], [inlineButton("⬅️ В каталог", "menu:main")]]),
  });
});

composer.callbackQuery("owner:maintenance", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const state = await updateState(ctx, (current) => { current.maintenance = !current.maintenance; });
  await ctx.reply(state.maintenance ? "Покупки поставлены на паузу." : "Покупки снова доступны.", { reply_markup: inlineKeyboard([[inlineButton("⬅️ В управление", "owner:desk")]]) });
});

export default composer;
