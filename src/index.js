const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();
const { UserModel } = require("./database");
const { ChatModel } = require("./database");
const i18n = require("i18n");

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });
function is_dev(user_id) {
    const devUsers = process.env.DEV_USERS.split(",");
    return devUsers.includes(user_id.toString());
}

i18n.configure({
    locales: ["en", "pt", "ru", "es", "fr", "hi", "it", "tr", "uk"],
    directory: __dirname + "/locales",
    defaultLocale: "en",
    queryParameter: "lang",
    cookie: "language",
    indent: "  ",
});

const weatherBaseUrl = "https://api.openweathermap.org/data/2.5/weather";

async function getUserLanguage(userId) {
    const user = await UserModel.findOne({ userID: userId });

    if (!user) {
        return i18n.defaultLocale;
    }

    return user.lang;
}

bot.on("inline_query", async (query) => {
    const userId = query.from.id;
    const userLanguage = await getUserLanguage(userId);
    const cityName = query.query;

    if (!cityName) {
        await bot.answerInlineQuery(query.id, [], {
            switch_pm_text: i18n.__("how_to_use"),
            switch_pm_parameter: "how_to_use",
            cache_time: 0,
        });

        return;
    }

    let units = "metric";
    let lang = "en";

    switch (userLanguage) {
        case "pt":
        case "es":
        case "fr":
        case "hi":
        case "it":
        case "tr":
        case "uk":
        case "ru":
            lang = userLanguage;
            break;
        default:
            lang = "en";
            break;
    }

    i18n.setLocale(lang);

    try {
        const response = await axios.get(
            `${weatherBaseUrl}?q=${cityName}&appid=${process.env.WEATHER_API_KEY}&units=${units}&lang=${lang}`
        );

        const weatherData = response.data;
        const temperature = Math.round(weatherData.main.temp);
        const weatherDescription = weatherData.weather[0].description;
        const weatherIconCode = weatherData.weather[0].icon;
        const feelsLike = Math.round(weatherData.main.feels_like);
        const windSpeed = Math.round(weatherData.wind.speed);
        const humidity = weatherData.main.humidity;
        const emoji = getTemperatureEmoji(temperature);
        const countryCode = weatherData.sys.country || "";
        const agora = new Date();
        const opcoes = { timeZone: "America/Sao_Paulo" };
        const horarioFormatado = agora.toLocaleTimeString("pt-BR", opcoes);

        const weatherIconUrl = `http://openweathermap.org/img/wn/${weatherIconCode}.png`;

        const message = i18n.__("weather_forecast_message", {
            emoji,
            temperature,
            weatherDescription,
            feelsLike,
            windSpeed,
            humidity,
            countryCode,
            horarioFormatado,
        });
        const message1 = i18n.__("city_weather_forecast_message", {
            cityName: cityName.toUpperCase(),
            emoji,
            temperature,
            weatherDescription,
            feelsLike,
            windSpeed,
            humidity,
            countryCode,
            horarioFormatado,
        });
        const title_message_visible = i18n.__("title_message_visible");
        const description_visible = i18n.__("description_visible", {
            cityName: cityName,
            countryCode,
        });
        const title_message_hidden = i18n.__("title_message_hidden");
        const description_hidden = i18n.__("description_hidden", {
            cityName: cityName,
            countryCode,
        });

        const result = [
            {
                type: "article",
                id: "1",
                title: title_message_hidden,
                description: description_hidden,
                input_message_content: {
                    message_text: message,
                    parse_mode: "markdown",
                },
                thumb_url: weatherIconUrl,
            },
            {
                type: "article",
                id: "2",
                title: title_message_visible,
                description: description_visible,
                input_message_content: {
                    message_text: message1,
                    parse_mode: "markdown",
                },
                thumb_url: weatherIconUrl,
            },
        ];

        bot.answerInlineQuery(query.id, result);
        console.log(result);
    } catch (error) {
        console.log(error);

        const errorMessage = i18n.__("erro_message");
        const errorResult = [
            {
                type: "article",
                id: "3",
                title: i18n.__("title_error"),
                description: i18n.__("description_error"),
                input_message_content: {
                    message_text: errorMessage,
                },
                thumb_url:
                    "https://e7.pngegg.com/pngimages/804/92/png-clipart-computer-icons-error-exit-miscellaneous-trademark.png",
            },
        ];

        bot.answerInlineQuery(query.id, errorResult);
    }
});

function getTemperatureEmoji(temperature) {
    if (temperature < -10) {
        return "❄️";
    } else if (temperature < 0) {
        return "🥶";
    } else if (temperature < 10) {
        return "🧊";
    } else if (temperature < 20) {
        return "🌡️";
    } else if (temperature < 25) {
        return "🌤️";
    } else if (temperature < 30) {
        return "☀️";
    } else if (temperature < 35) {
        return "🔥";
    } else {
        return "🥵";
    }
}

bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    const numUsers = await UserModel.countDocuments();
    const numChats = await ChatModel.countDocuments();
    const message = `\n──❑ 「 Bot Stats 」 ❑──\n\n ☆ ${numUsers} usuários\n ☆ ${numChats} chats`;
    bot.sendMessage(chatId, message);
});

const groupId = process.env.groupId;

UserModel.on("save", (user) => {
    const message = `#Climatologia #New_User
  <b>User:</b> <a href="tg://user?id=${user.userID}">${user.firstName}</a>
  <b>ID:</b> <code>${user.userID}</code>
  <b>Username:</b> ${user.username ? `@${user.username}` : "Não informado"}`;
    bot.sendMessage(groupId, message, { parse_mode: "HTML" });
});
bot.on("polling_error", (error) => {
    console.error(error);
});

bot.onText(/\/start/, async (msg) => {
    if (msg.chat.type !== "private") {
        return;
    }

    const chatId = msg.chat.id;

    let user = await UserModel.findOne({ userID: msg.from.id });
    if (!user) {
        user = new UserModel({
            firstName: msg.from.first_name,
            userID: msg.from.id,
            username: msg.from.username,
            lang: "en",
        });
        await user.save();
    } else {
        i18n.setLocale(user.lang);
    }

    bot.sendMessage(chatId, i18n.__("startMessage"), {
        parse_mode: "markdown",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: i18n.__("addGroup"),
                        url: "https://t.me/climatologiabot?startgroup=true",
                    },
                ],
                [
                    {
                        text: i18n.__("help"),
                        callback_data: "help",
                    },
                    {
                        text: i18n.__("owner"),
                        url: "https://t.me/Kylorensbot",
                    },
                ],
                [
                    {
                        text: i18n.__("langMessage"),
                        callback_data: "choose_language",
                    },
                ],
            ],
        },
    });
});

bot.on("callback_query", async (callbackQuery) => {
    if (callbackQuery.message.chat.type !== "private") {
        return;
    }

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    if (callbackQuery.data === "help") {
        await bot.editMessageText(i18n.__("help_message"), {
            parse_mode: "markdown",
            disable_web_page_preview: true,
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("support_group_button"),
                            url: "https://t.me/climatologiaofc",
                        },
                        {
                            text: i18n.__("support_button"),
                            url: "https://t.me/kylorensbot",
                        },
                    ],
                    [
                        {
                            text: i18n.__("git_to_use"),
                            url: "https://t.me/+2w5cw249tXkxMWUx",
                        },
                    ],
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    }

    if (callbackQuery.data === "choose_language") {
        await bot.editMessageText(i18n.__("chooseLangMessage"), {
            parse_mode: "markdown",
            disable_web_page_preview: true,
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: "🇧🇷 Português",
                            callback_data: "choose_portuguese",
                        },
                        {
                            text: "🇺🇸 English",
                            callback_data: "choose_english",
                        },
                        {
                            text: "🇷🇺 Русский",
                            callback_data: "choose_russian",
                        },
                    ],
                    [
                        {
                            text: "🇪🇸 Español",
                            callback_data: "choose_spanish",
                        },
                        {
                            text: "🇫🇷 Français",
                            callback_data: "choose_french",
                        },
                        {
                            text: "🇮🇳 हिन्दी",
                            callback_data: "choose_hindi",
                        },
                    ],
                    [
                        {
                            text: "🇮🇹 Italiano",
                            callback_data: "choose_italian",
                        },
                        {
                            text: "🇹🇷 Türkçe",
                            callback_data: "choose_turkish",
                        },
                        {
                            text: "🇺🇦 Українська",
                            callback_data: "choose_ukrainian",
                        },
                    ],
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_portuguese") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "pt" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_english") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "en" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_russian") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "ru" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_spanish") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "es" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_french") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "fr" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_hindi") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "hi" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_italian") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "it" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_turkish") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "tr" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "choose_ukrainian") {
        const user = await UserModel.findOneAndUpdate(
            { userID: callbackQuery.from.id },
            { lang: "uk" },
            { new: true }
        );
        i18n.setLocale(user.lang);

        await bot.editMessageText(i18n.__("langChangedMessage"), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("back"),
                            callback_data: "back_to_start",
                        },
                    ],
                ],
            },
        });
    } else if (callbackQuery.data === "back_to_start") {
        await bot.editMessageText(i18n.__("startMessage"), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "markdown",
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("addGroup"),
                            url: "https://t.me/climatologiabot?startgroup=true",
                        },
                    ],
                    [
                        {
                            text: i18n.__("help"),
                            callback_data: "help",
                        },
                        {
                            text: i18n.__("owner"),
                            url: "https://t.me/Kylorensbot",
                        },
                    ],
                    [
                        {
                            text: i18n.__("langMessage"),
                            callback_data: "choose_language",
                        },
                    ],
                ],
            },
        });
    }
});

bot.onText(/\/lang/, (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        bot.sendMessage(chatId, i18n.__("pv_message_lang"), {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("pv_message_lang_button"),
                            url: "https://t.me/climatologiabot?start=lang",
                        },
                    ],
                ],
            },
        });
        return;
    }

    bot.sendMessage(chatId, i18n.__("chooseLanguage"), {
        parse_mode: "markdown",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "🇧🇷 Português",
                        callback_data: "choose_portuguese",
                    },
                    {
                        text: "🇺🇸 English",
                        callback_data: "choose_english",
                    },
                    {
                        text: "🇷🇺 Русский",
                        callback_data: "choose_russian",
                    },
                ],
                [
                    {
                        text: "🇪🇸 Español",
                        callback_data: "choose_spanish",
                    },
                    {
                        text: "🇫🇷 Français",
                        callback_data: "choose_french",
                    },
                    {
                        text: "🇮🇳 हिन्दी",
                        callback_data: "choose_hindi",
                    },
                ],
                [
                    {
                        text: "🇮🇹 Italiano",
                        callback_data: "choose_italian",
                    },
                    {
                        text: "🇹🇷 Türkçe",
                        callback_data: "choose_turkish",
                    },
                    {
                        text: "🇺🇦 Українська",
                        callback_data: "choose_ukrainian",
                    },
                ],
                [
                    {
                        text: i18n.__("startlanguptdate"),
                        callback_data: "back_to_start",
                    },
                ],
            ],
        },
    });
});

bot.onText(/\/help/, (msg) => {
    if (msg.chat.type !== "private") {
        return;
    }
    const chatId = msg.chat.id;

    const helpMessage = i18n.__("help_message");

    bot.sendPhoto(
        chatId,
        "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/f914dc21-b453-4629-8710-ebf4ec304e49/d8gymea-76b549b0-5202-4789-899a-9c5f835e8fd8.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcL2Y5MTRkYzIxLWI0NTMtNDYyOS04NzEwLWViZjRlYzMwNGU0OVwvZDhneW1lYS03NmI1NDliMC01MjAyLTQ3ODktODk5YS05YzVmODM1ZThmZDgucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.tQYStAnWtQo_s7raGbX_T9CVmujGRY_blrcI68suz5E",
        {
            caption: helpMessage,
            parse_mode: "markdown",
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: i18n.__("support_group_button"),
                            url: "https://t.me/climatologiaofc",
                        },
                        {
                            text: i18n.__("support_button"),
                            url: "https://t.me/kylorensbot",
                        },
                    ],
                ],
            },
        }
    );
});

bot.on("new_chat_members", async (msg) => {
    const chatId = msg.chat.id;
    const chatName = msg.chat.title;

    try {
        const chat = await ChatModel.findOne({ chatId: chatId });

        if (chat) {
            console.log(
                `Grupo ${chatName} (${chatId}) já existe no banco de dados`
            );
        } else {
            const newChat = await ChatModel.create({ chatId, chatName });
            console.log(
                `Grupo ${newChat.chatName} (${newChat.chatId}) adicionado ao banco de dados`
            );

            const botUser = await bot.getMe();
            const newMembers = msg.new_chat_members.filter(
                (member) => member.id === botUser.id
            );

            if (newMembers.length > 0) {
                const message = `#Climatologiabot #New_Group
            <b>Group:</b> ${chatName}
            <b>ID:</b> <code>${chatId}</code>`;
                bot.sendMessage(groupId, message, { parse_mode: "HTML" }).catch(
                    (error) => {
                        console.error(
                            `Erro ao enviar mensagem para o grupo ${groupId}: ${error}`
                        );
                    }
                );
            }

            bot.sendMessage(
                chatId,
                "(🇧🇷) Olá, meu nome é Janna! Obrigado por me adicionado em seu grupo. Eu sou bot de previsão do tempo, para usar digite @climatologiabot cidade.\n\n(🇺🇸)Hello, my name is Janna! Thanks for adding me to your group. I'm a weather forecast bot, to use type @climatologiabot city.",
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Visite nosso canal",
                                    url: "https://t.me/climatologiaofc",
                                },
                                {
                                    text: "Relate bugs",
                                    url: "https://t.me/kylorensbot",
                                },
                            ],
                        ],
                    },
                }
            );
        }
        const developerMembers = msg.new_chat_members.filter(
            (member) => member.is_bot === false && is_dev(member.id)
        );

        if (developerMembers.length > 0) {
            const message1 = `👨‍💻 <b>ᴜᴍ ᴅᴏs ᴍᴇᴜs ᴅᴇsᴇɴᴠᴏʟᴠᴇᴅᴏʀᴇs ᴇɴᴛʀᴏᴜ ɴᴏ ɢʀᴜᴘᴏ</b> <a href="tg://user?id=${developerMembers[0].id}">${developerMembers[0].first_name}</a> 😎👍`;
            bot.sendMessage(chatId, message1, { parse_mode: "HTML" }).catch(
                (error) => {
                    console.error(
                        `Erro ao enviar mensagem para o grupo ${chatId}: ${error}`
                    );
                }
            );
        }
    } catch (err) {
        console.error(err);
    }
});

bot.on("left_chat_member", async (msg) => {
    const botUser = await bot.getMe();
    if (msg.left_chat_member.id === botUser.id) {
        console.log("Bot left the group!");

        try {
            const chatId = msg.chat.id;
            const chat = await ChatModel.findOneAndDelete({ chatId });
            console.log(
                `Grupo ${chat.chatName} (${chat.chatId}) removido do banco de dados`
            );
        } catch (err) {
            console.error(err);
        }
    }
});

bot.on("polling_error", (error) => {
    console.error(`Erro no bot de polling: ${error}`);
});

function timeFormatter(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const hoursFormatted = String(hours).padStart(2, "0");
    const minutesFormatted = String(minutes).padStart(2, "0");
    const secondsFormatted = String(secs).padStart(2, "0");

    return `${hoursFormatted}:${minutesFormatted}:${secondsFormatted}`;
}

bot.onText(/\/ping/, async (msg) => {
    const start = new Date();
    const replied = await bot.sendMessage(msg.chat.id, "𝚙𝚘𝚗𝚐!");
    const end = new Date();
    const m_s = end - start;
    const uptime = process.uptime();
    const uptime_formatted = timeFormatter(uptime);
    await bot.editMessageText(
        `𝚙𝚒𝚗𝚐: \`${m_s}𝚖𝚜\`\n𝚞𝚙𝚝𝚒𝚖𝚎: \`${uptime_formatted}\``,
        {
            chat_id: replied.chat.id,
            message_id: replied.message_id,
            parse_mode: "Markdown",
        }
    );
});

bot.onText(/^(\/broadcast|\/bc)\b/, async (msg, match) => {
    const user_id = msg.from.id;
    if (!(await is_dev(user_id))) {
        return;
    }

    const query = match.input.substring(match[0].length).trim();
    if (!query) {
        return bot.sendMessage(
            msg.chat.id,
            "<i>I need text to broadcast.</i>",
            { parse_mode: "HTML" }
        );
    }
    const sentMsg = await bot.sendMessage(msg.chat.id, "<i>Processing...</i>", {
        parse_mode: "HTML",
    });
    const web_preview = query.startsWith("-d");
    const query_ = web_preview ? query.substring(2).trim() : query;
    const ulist = await UserModel.find().lean().select("user_id");
    let sucess_br = 0;
    let no_sucess = 0;
    let block_num = 0;
    for (const { user_id } of ulist) {
        try {
            await bot.sendMessage(user_id, query_, {
                disable_web_page_preview: !web_preview,
                parse_mode: "HTML",
            });
            sucess_br += 1;
        } catch (err) {
            if (
                err.response &&
                err.response.body &&
                err.response.body.error_code === 403
            ) {
                block_num += 1;
            } else {
                no_sucess += 1;
            }
        }
    }
    await bot.editMessageText(
        `
  ╭─❑ 「 <b>Broadcast Completed</b> 」 ❑──
  │- <i>Total Users:</i> \`${ulist.length}\`
  │- <i>Successful:</i> \`${sucess_br}\`
  │- <i>Blocked:</i> \`${block_num}\`
  │- <i>Failed:</i> \`${no_sucess}\`
  ╰❑
    `,
        {
            chat_id: sentMsg.chat.id,
            message_id: sentMsg.message_id,
            parse_mode: "HTML",
        }
    );
});

bot.onText(/\/dev/, async (message) => {
    const userId = message.from.id;
    if (message.chat.type !== "private") {
        return;
    }
    const firstName = message.from.first_name;
    const message_start_dev = `Olá, <b>${firstName}</b>! Você é um dos desenvolvedores 🧑‍💻\n\nVocê está no painel do desenvolvedor da Janna, então aproveite a responsabilidade e use os comandos com consciências`;
    const options_start_dev = {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "📬 Canal Oficial",
                        url: "https://t.me/climatologiaofc",
                    },
                ],
                [
                    {
                        text: "🗃 Lista de para desenvolvedores",
                        callback_data: "commands",
                    },
                ],
            ],
        },
    };
    bot.on("callback_query", async (callbackQuery) => {
        if (callbackQuery.message.chat.type !== "private") {
            return;
        }
        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;

        if (callbackQuery.data === "commands") {
            const commands = [
                "/stats - Estatística de grupos, usuarios e mensagens enviadas",
                "/broadcast ou /bc - envia mensagem para todos usuários",
                "/ping - veja a latência da VPS",
            ];
            await bot.editMessageText(
                "<b>Lista de Comandos:</b> \n\n" + commands.join("\n"),
                {
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "⬅️ Voltar",
                                    callback_data: "back_to_start",
                                },
                            ],
                        ],
                    },
                }
            );
        } else if (callbackQuery.data === "back_to_start") {
            await bot.editMessageText(message_start_dev, {
                parse_mode: "HTML",
                chat_id: chatId,
                message_id: messageId,
                disable_web_page_preview: true,
                reply_markup: options_start_dev.reply_markup,
            });
        }
    });
    if (is_dev(userId)) {
        bot.sendMessage(userId, message_start_dev, options_start_dev);
    } else {
        bot.sendMessage(message.chat.id, "Você não é desenvolvedor");
    }
});
