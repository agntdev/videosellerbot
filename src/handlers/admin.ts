import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { clock, orderFor, productAny, productFor, save, state } from "../shop.js";

registerMainMenuItem({ label: "Продажи", data: "admin:sales", order: 80 });
const composer = new Composer<Ctx>();

composer.callbackQuery("admin:sales", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  if (shop.orders.length === 0) {
    await ctx.reply("Продаж пока нет.", { reply_markup: inlineKeyboard([[inlineButton("К каталогу", "menu:main")]]) });
    return;
  }
  const rows = shop.orders.slice(-20).reverse().map((o) => {
    const product = productFor(shop, o.productId);
    return [inlineButton(`${product?.title ?? "Видео"} · ${o.status}`, `admin:order:${o.id}`)];
  });
  await ctx.reply("Ваши продажи:", { reply_markup: inlineKeyboard([...rows, [inlineButton("К каталогу", "menu:main")]]) });
});

composer.callbackQuery(/^admin:order:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  const order = orderFor(shop, ctx.match[1]);
  if (!order) { await ctx.reply("Заказ не найден."); return; }
  const product = productFor(shop, order.productId);
  await ctx.reply(`Заказ ${order.id}\nТовар: ${product?.title ?? "недоступен"}\nСтатус: ${order.status}\nПокупатель: ${order.buyerTelegramId}\nПопыток повторной отправки: ${order.redeliveryAttempts.length}`, {
    reply_markup: inlineKeyboard([[inlineButton("Отправить ещё раз", `admin:redeliver:${order.id}`)], [inlineButton("К продажам", "admin:sales")]]),
  });
});

composer.callbackQuery(/^admin:redeliver:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  const order = orderFor(shop, ctx.match[1]);
  const product = order && productFor(shop, order.productId);
  if (!order || !product) { await ctx.reply("Не удалось найти заказ или видео."); return; }
  order.redeliveryAttempts.push(clock().toISOString());
  if (!product.video) {
    order.notes.push("Повторная отправка невозможна: файл не прикреплён.");
    await save(ctx, shop);
    await ctx.reply("У этого товара пока нет прикреплённого файла.");
    return;
  }
  try {
    await ctx.api.sendVideo(order.buyerTelegramId, product.video, { caption: `Повторная отправка: ${product.title}` });
    order.status = "delivered";
    order.deliveryMethod = "direct_upload";
    await save(ctx, shop);
    await ctx.reply("Видео отправлено ещё раз.");
  } catch {
    order.notes.push("Повторная отправка не удалась: покупатель недоступен или файл слишком большой.");
    await save(ctx, shop);
    await ctx.reply("Не получилось отправить видео. Проверьте файл и доступность покупателя.");
  }
});

composer.callbackQuery("admin:maintenance", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx); shop.maintenance = !shop.maintenance; await save(ctx, shop);
  await ctx.reply(shop.maintenance ? "Покупки приостановлены." : "Покупки снова доступны.");
});

composer.callbackQuery("admin:products", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  const rows = shop.products.map((p) => [
    inlineButton(`${p.visible ? "Виден" : "Скрыт"}: ${p.title}`, `admin:toggle:${p.id}`),
    inlineButton(`⭐ ${p.priceStars}`, `admin:price:${p.id}`),
    inlineButton("Файл", `admin:video:${p.id}`),
  ]);
  await ctx.reply("Товары магазина:", { reply_markup: inlineKeyboard([...rows, [inlineButton("Режим обслуживания", "admin:maintenance")], [inlineButton("К продажам", "admin:sales")]]) });
});

composer.callbackQuery(/^admin:price:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  if (!productAny(shop, ctx.match[1])) { await ctx.reply("Товар не найден."); return; }
  ctx.session.adminPriceProductId = ctx.match[1];
  await ctx.reply("Отправьте новую цену в Stars — целое число от 1 до 10 000.", { reply_markup: { force_reply: true, input_field_placeholder: "Например, 50" } });
});

composer.callbackQuery(/^admin:video:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  if (!productAny(shop, ctx.match[1])) { await ctx.reply("Товар не найден."); return; }
  ctx.session.adminVideoProductId = ctx.match[1];
  await ctx.reply("Отправьте HTTPS-ссылку или Telegram file_id для видео.", { reply_markup: { force_reply: true, input_field_placeholder: "Ссылка или file_id" } });
});

composer.on("message:text", async (ctx, next) => {
  const priceId = ctx.session.adminPriceProductId;
  const videoId = ctx.session.adminVideoProductId;
  if (!priceId && !videoId) { await next(); return; }
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  if (priceId) {
    const price = Number(ctx.message.text.trim());
    const product = productAny(shop, priceId);
    ctx.session.adminPriceProductId = undefined;
    if (!product || !Number.isInteger(price) || price < 1 || price > 10000) { await ctx.reply("Цена должна быть целым числом от 1 до 10 000."); return; }
    product.priceStars = price;
    await save(ctx, shop);
    await ctx.reply("Цена обновлена.", { reply_markup: inlineKeyboard([[inlineButton("К товарам", "admin:products")]]) });
    return;
  }
  const product = productAny(shop, videoId!);
  ctx.session.adminVideoProductId = undefined;
  if (!product || (!ctx.message.text.startsWith("https://") && !ctx.message.text.startsWith("BAA"))) { await ctx.reply("Нужна HTTPS-ссылка или Telegram file_id."); return; }
  product.video = ctx.message.text.trim();
  await save(ctx, shop);
  await ctx.reply("Видео прикреплено.", { reply_markup: inlineKeyboard([[inlineButton("К товарам", "admin:products")]]) });
});

composer.callbackQuery(/^admin:toggle:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await requireOwner(ctx))) return;
  const shop = await state(ctx);
  const product = shop.products.find((p) => p.id === ctx.match[1]);
  if (!product) { await ctx.reply("Товар не найден."); return; }
  product.visible = !product.visible;
  await save(ctx, shop);
  await ctx.reply(product.visible ? "Товар снова виден в каталоге." : "Товар скрыт из каталога.", { reply_markup: inlineKeyboard([[inlineButton("К товарам", "admin:products")]]) });
});

export default composer;
