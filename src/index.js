const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();
const { UserModel } = require("./database");
const { ChatModel } = require("./database");
const CronJob = require("cron").CronJob;
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

const languageToTimezone = {
    en: "America/New_York",
    pt: "America/Sao_Paulo",
    ru: "Europe/Moscow",
    es: "Europe/Madrid",
    fr: "Europe/Paris",
    hi: "Asia/Kolkata",
    it: "Europe/Rome",
    tr: "Europe/Istanbul",
    uk: "Europe/Kiev"
};

const locales = fs.readdirSync(path.resolve(__dirname, 'locales'));

const enDescriptionShort = i18n.t('en', 'description.short');

for (const locale of locales) {
    const localeName = locale.split('.')[0];


    const myShortDescription = await bot.telegram.callApi('getMyShortDescription', {
        language_code: localeName,
    });

    const descriptionShort = i18n.t(localeName, 'description.short');
    const newDescriptionShort = localeName === 'en' || descriptionShort !== enDescriptionShort
        ? descriptionShort.replace(/[\r\n]/gm, '')
        : '';

    if (newDescriptionShort !== myShortDescription.short_description.replace(/[\r\n]/gm, '')) {
        try {
            const shortDescription = newDescriptionShort ? i18n.t(localeName, 'description.short') : '';
            const response = await bot.telegram.callApi('setMyShortDescription', {
                short_description: shortDescription,
                language_code: localeName,
            });
            console.log('setMyShortDescription', localeName, response);
        } catch (error) {
            console.error('setMyShortDescription', localeName, error.description);
        }
    }
}


const descriptions = [
    { description: "This Bot gives you weather information such as: weather, temperature, thermal sensation and humidity level in your city in real time.🌤 Official Channel: @climatologiaofc", language_code: "en" },
    { description: "Este Bot fornece informações meteorológicas, como: clima, temperatura, sensação térmica e nível de umidade em sua cidade em tempo real.🌤 Canal Oficial: @climatologiaofc", language_code: "pt" },
    { description: "Этот бот предоставляет вам информацию о погоде, такую как: погода, температура, ощущение тепла и уровень влажности в вашем городе в реальном времени.🌤 Официальный канал: @climatologiaofc", language_code: "ru" },
    { description: "Este Bot te brinda información del clima, como: el clima, la temperatura, la sensación térmica y el nivel de humedad en tu ciudad en tiempo real.🌤 Canal Oficial: @climatologiaofc", language_code: "es" },
    { description: "Ce Bot vous fournit des informations météorologiques telles que: le temps, la température, la sensation thermique et le niveau d'humidité dans votre ville en temps réel.🌤 Chaîne officielle: @climatologiaofc", language_code: "fr" },
    { description: "यह बॉट आपको आपके शहर में मौसम, तापमान, तापमान अनुभव और आपके शहर में ह्यूमिडिटी स्तर जैसी मौसम जानकारी देता है।🌤 आधिकृत चैनल: @climatologiaofc", language_code: "hi" },
    { description: "Questo Bot ti fornisce informazioni meteorologiche come: meteo, temperatura, sensazione termica e livello di umidità nella tua città in tempo reale.🌤 Canale ufficiale: @climatologiaofc", language_code: "it" },
    { description: "Bu Bot size gerçek zamanlı olarak şehrinizde hava durumu, sıcaklık, termal hissiyat ve nem seviyesi gibi hava durumu bilgilerini sunar.🌤 Resmi Kanal: @climatologiaofc", language_code: "tr" },
    { description: "Цей бот надсилає вам інформацію про погоду, таку як: погода, температура, теплова сенсація та рівень вологості в вашому місті в реальному часі.🌤 Офіційний канал: @climatologiaofc", language_code: "uk" }
];

// Loop through the descriptions and set them for each language
descriptions.forEach(descriptionInfo => {
    bot.setMyCommands(descriptionInfo);
});

function setMyCommandsSuite() {
    const commands = [
        { command: "start", description: "Menu inicial", language_code: "pt" },
        { command: "help", description: "Como usar o bot", language_code: "pt" },
        { command: "start", description: "Main menu", language_code: "en" },
        { command: "help", description: "How to use the bot", language_code: "en" },
        { command: "start", description: "Главное меню", language_code: "ru" },
        { command: "help", description: "Как использовать бота", language_code: "ru" },
        { command: "start", description: "Menú principal", language_code: "es" },
        { command: "help", description: "Cómo usar el bot", language_code: "es" },
        { command: "start", description: "Menu principal", language_code: "fr" },
        { command: "help", description: "Comment utiliser le bot", language_code: "fr" },
        { command: "start", description: "मुख्य मेनू", language_code: "hi" },
        { command: "help", description: "बॉट कैसे उपयोग करें", language_code: "hi" },
        { command: "start", description: "Menu principale", language_code: "it" },
        { command: "help", description: "Come usare il bot", language_code: "it" },
        { command: "start", description: "Ana menü", language_code: "tr" },
        { command: "help", description: "Botu nasıl kullanılır", language_code: "tr" },
        { command: "start", description: "Головное меню", language_code: "uk" },
        { command: "help", description: "Як користуватися ботом", language_code: "uk" },
    ];

    return bot.setMyCommands(commands);
}


const weatherBaseUrl = "https://api.openweathermap.org/data/2.5/weather";

async function getUserLanguage(userId) {
    try {
        const user = await UserModel.findOne({ userID: userId });
        if (user) {
            return user.lang;
        } else {
            return i18n.defaultLocale;
        }
    } catch (error) {
        console.error("Error fetching user language:", error);
        return i18n.defaultLocale;
    }
}

bot.on("inline_query", async (query) => {
    const userId = query.from.id;
    userLanguage = await getUserLanguage(userId) || "en";
    const cityName = query.query;
    const timezone = languageToTimezone[userLanguage] || "America/New_York";


    if (!cityName) {
        await bot.answerInlineQuery(query.id, [], {
            switch_pm_text: i18n.__({ phrase: "how_to_use", locale: userLanguage }),
            switch_pm_parameter: "how_to_use",
            cache_time: 0,
        });

        return;
    }

    let units = "metric";
    let lang = userLanguage;

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
        const opcoes = { timeZone: timezone };
        const horarioFormatado = agora.toLocaleTimeString("pt-BR", opcoes);

        const weatherIconUrl = `http://openweathermap.org/img/wn/${weatherIconCode}.png`;

        const firstAlert = weatherData.alerts ? weatherData.alerts[0] : null;

        let alertMessage;
        if (firstAlert) {
            const alertEvent = firstAlert.event;
            const alertDescription = firstAlert.description;
            const alertTags = firstAlert.tags.join(", ");

            alertMessage = i18n.__("alert_message", {
                alertEvent,
                alertDescription,
                alertTags,
            });
        } else {
            alertMessage = i18n.__("no_alert_message");
        }

        const message = i18n.__("weather_forecast_message", {
            emoji,
            temperature,
            weatherDescription: weatherDescription.charAt(0).toUpperCase() + weatherDescription.slice(1).toLowerCase(),
            feelsLike,
            windSpeed,
            humidity,
            countryCode,
            horarioFormatado,
            alertMessage,
        });
        const message1 = i18n.__("city_weather_forecast_message", {
            cityName: cityName.toUpperCase(),
            emoji,
            temperature,
            weatherDescription: weatherDescription.charAt(0).toUpperCase() + weatherDescription.slice(1).toLowerCase(),
            feelsLike,
            windSpeed,
            humidity,
            countryCode,
            horarioFormatado,
            alertMessage,
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
            if (msg.chat.username) {
                chatusername = `@${msg.chat.username}`;
            } else {
                chatusername = "Private Group";
            }

            if (newMembers.length > 0) {
                const message = `#Climatologiabot #New_Group
            <b>Group:</b> ${chatName}
            <b>ID:</b> <code>${chatId}</code>
            <b>Link:</b> ${chatusername}`;
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
    if (msg.chat.type !== "private") {
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
                "/sendgp - encaminha msg para grupos",
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

const channelStatusId = process.env.channelStatusId;

async function sendStatus() {
    const start = new Date();
    const replied = await bot.sendMessage(channelStatusId, "Bot is ON");
    const end = new Date();
    const m_s = end - start;
    const uptime = process.uptime();
    const uptime_formatted = timeFormatter(uptime);
    const numUsers = await UserModel.countDocuments();
    const numChats = await ChatModel.countDocuments();
    await bot.editMessageText(
        `#Climatologiabot #Status\n\nStatus: ON\nPing: \`${m_s}ms\`\nUptime: \`${uptime_formatted}\`\nUsers: \`${numUsers}\`\nChats: \`${numChats}\``,
        {
            chat_id: replied.chat.id,
            message_id: replied.message_id,
            parse_mode: "Markdown",
        }
    );
}

function timeFormatter(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const hoursFormatted = String(hours).padStart(2, "0");
    const minutesFormatted = String(minutes).padStart(2, "0");
    const secondsFormatted = String(secs).padStart(2, "0");

    return `${hoursFormatted}:${minutesFormatted}:${secondsFormatted}`;
}

const job = new CronJob(
    "00 12 * * *",
    sendStatus,
    null,
    true,
    "America/Sao_Paulo"
);

bot.onText(/^\/grupos/, async (message) => {
    const user_id = message.from.id;
    if (!(await is_dev(user_id))) {
        return;
    }
    if (message.chat.type !== "private") {
        return;
    }

    try {
        const chats = await ChatModel.find().sort({ chatId: 1 });

        let contador = 1;
        let chunkSize = 3900 - message.text.length;
        let messageChunks = [];
        let currentChunk = "";

        for (let chat of chats) {
            if (chat.chatId < 0) {
                let groupMessage = `<b>${contador}:</b> <b>Group=</b> ${chat.chatName} || <b>ID:</b> <code>${chat.chatId}</code>\n`;
                if (currentChunk.length + groupMessage.length > chunkSize) {
                    messageChunks.push(currentChunk);
                    currentChunk = "";
                }
                currentChunk += groupMessage;
                contador++;
            }
        }
        messageChunks.push(currentChunk);

        let index = 0;

        const markup = (index) => {
            return {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: `<< ${index + 1}`,
                                callback_data: `groups:${index - 1}`,
                                disabled: index === 0,
                            },
                            {
                                text: `>> ${index + 2}`,
                                callback_data: `groups:${index + 1}`,
                                disabled: index === messageChunks.length - 1,
                            },
                        ],
                    ],
                },
                parse_mode: "HTML",
            };
        };

        await bot.sendMessage(
            message.chat.id,
            messageChunks[index],
            markup(index)
        );

        bot.on("callback_query", async (query) => {
            if (query.data.startsWith("groups:")) {
                index = Number(query.data.split(":")[1]);
                if (
                    markup(index).reply_markup &&
                    markup(index).reply_markup.inline_keyboard
                ) {
                    markup(index).reply_markup.inline_keyboard[0][0].disabled =
                        index === 0;
                    markup(index).reply_markup.inline_keyboard[0][1].disabled =
                        index === messageChunks.length - 1;
                }
                await bot.editMessageText(messageChunks[index], {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    ...markup(index),
                });
                await bot.answerCallbackQuery(query.id);
            }
        });
    } catch (error) {
        console.error(error);
    }
});

bot.onText(/\/sendgp/, async (msg, match) => {
    const user_id = msg.from.id;
    if (!(await is_dev(user_id))) {
        return;
    }
    if (msg.chat.type !== "private") {
        return;
    }

    const sentMsg = await bot.sendMessage(msg.chat.id, "<i>Processing...</i>", {
        parse_mode: "HTML",
    });
    const web_preview = match.input.startsWith("-d");
    const query = web_preview ? match.input.substring(6).trim() : match.input;
    const ulist = await ChatModel.find().lean().select("chatId");
    let success_br = 0;
    let no_success = 0;
    let block_num = 0;

    if (msg.reply_to_message) {
        const replyMsg = msg.reply_to_message;
        for (const { chatId } of ulist) {
            try {
                await bot.forwardMessage(
                    chatId,
                    replyMsg.chat.id,
                    replyMsg.message_id
                );
                success_br += 1;
            } catch (err) {
                if (
                    err.response &&
                    err.response.body &&
                    err.response.body.error_code === 403
                ) {
                    block_num += 1;
                } else {
                    no_success += 1;
                }
            }
        }
    } else {
        for (const { chatId } of ulist) {
            try {
                await bot.sendMessage(chatId, query, {
                    disable_web_page_preview: !web_preview,
                    parse_mode: "HTML",
                    reply_to_message_id: msg.message_id,
                });
                success_br += 1;
            } catch (err) {
                if (
                    err.response &&
                    err.response.body &&
                    err.response.body.error_code === 403
                ) {
                    block_num += 1;
                } else {
                    no_success += 1;
                }
            }
        }
    }

    await bot.editMessageText(
        `
  ╭─❑ 「 <b>Broadcast Completed</b> 」 ❑──
  │- <i>Total Group:</i> \`${ulist.length}\`
  │- <i>Successful:</i> \`${success_br}\`
  │- <i>Removed:</i> \`${block_num}\`
  │- <i>Failed:</i> \`${no_success}\`
  ╰❑
    `,
        {
            chat_id: sentMsg.chat.id,
            message_id: sentMsg.message_id,
            parse_mode: "HTML",
        }
    );
});
