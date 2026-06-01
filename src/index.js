const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
require("dotenv").config();
const { UserModel, ChatModel } = require("./database");
const CronJob = require("cron").CronJob;
const i18n = require("i18n");

// --- Env validation ---
const REQUIRED_ENV = ["TELEGRAM_BOT_TOKEN", "DB_STRING", "groupId"];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`Missing required environment variable: ${key}`);
        process.exit(1);
    }
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const groupId = process.env.groupId;
const channelStatusId = process.env.channelStatusId;

const bot = new TelegramBot(token, { polling: true });

// --- Helpers ---
function is_dev(user_id) {
    const devUsers = (process.env.DEV_USERS || "").split(",").filter(Boolean);
    return devUsers.includes(user_id.toString());
}

function timeFormatter(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function getTemperatureEmoji(temp) {
    if (temp < -10) return "❄️";
    if (temp < 0) return "🥶";
    if (temp < 10) return "🧊";
    if (temp < 20) return "🌡️";
    if (temp < 25) return "🌤️";
    if (temp < 30) return "☀️";
    if (temp < 35) return "🔥";
    return "🥵";
}

const WMO_ICONS = {
    0: "01d", 1: "01d", 2: "02d", 3: "04d",
    45: "50d", 48: "50d",
    51: "09d", 53: "09d", 55: "09d",
    61: "10d", 63: "10d", 65: "10d",
    71: "13d", 73: "13d", 75: "13d", 77: "13d",
    80: "09d", 81: "09d", 82: "09d",
    85: "13d", 86: "13d",
    95: "11d", 96: "11d", 99: "11d",
};

const WMO_EMOJIS = {
    0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
    45: "🌫️", 48: "🌫️",
    51: "🌦️", 53: "🌦️", 55: "🌧️",
    61: "🌧️", 63: "🌧️", 65: "🌧️",
    71: "❄️", 73: "❄️", 75: "❄️", 77: "❄️",
    80: "🌧️", 81: "🌧️", 82: "🌧️",
    85: "🌨️", 86: "🌨️",
    95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function getWeatherIconUrl(wmoCode) {
    const icon = WMO_ICONS[wmoCode] || "01d";
    return `https://openweathermap.org/img/wn/${icon}.png`;
}

function getWeatherEmoji(wmoCode) {
    return WMO_EMOJIS[wmoCode] || "🌡️";
}

function formatTime(isoString) {
    if (!isoString) return "--:--";
    const parts = isoString.split("T");
    return parts.length > 1 ? parts[1] : "--:--";
}

// --- i18n config ---
i18n.configure({
    locales: ["en", "pt", "ru", "es", "fr", "hi", "it", "tr", "uk", "de", "ar", "id", "fa"],
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
    uk: "Europe/Kiev",
    de: "Europe/Berlin",
    ar: "Asia/Riyadh",
    id: "Asia/Jakarta",
    fa: "Asia/Tehran",
};

// --- DB helper ---
async function getUserLanguage(userId) {
    try {
        const user = await UserModel.findOne({ userID: userId });
        return user ? user.lang : "en";
    } catch {
        return "en";
    }
}

// --- Open-Meteo API (free, no API key required) ---
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";

async function getWeatherData(cityName) {
    const geoRes = await axios.get(GEO_URL, {
        params: { name: cityName, count: 1, language: "en", format: "json" },
        timeout: 8000,
    });

    if (!geoRes.data.results || geoRes.data.results.length === 0) {
        throw new Error("City not found");
    }

    const { latitude, longitude, name, country_code, timezone } = geoRes.data.results[0];

    const weatherRes = await axios.get(WEATHER_URL, {
        params: {
            latitude,
            longitude,
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,uv_index",
            daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max",
            wind_speed_unit: "kmh",
            timezone: timezone || "auto",
            forecast_days: 4,
        },
        timeout: 8000,
    });

    const d = weatherRes.data;
    return {
        city: name,
        countryCode: country_code || "",
        timezone: timezone || "UTC",
        current: {
            temperature: Math.round(d.current.temperature_2m),
            humidity: d.current.relative_humidity_2m,
            feelsLike: Math.round(d.current.apparent_temperature),
            weatherCode: d.current.weather_code,
            windSpeed: Math.round(d.current.wind_speed_10m),
            windGusts: Math.round(d.current.wind_gusts_10m),
            uvIndex: parseFloat((d.current.uv_index || 0).toFixed(1)),
        },
        today: {
            precipitationProbability: d.daily.precipitation_probability_max[0] ?? 0,
            sunrise: formatTime(d.daily.sunrise[0]),
            sunset: formatTime(d.daily.sunset[0]),
        },
        forecast: d.daily.time.slice(1, 4).map((date, i) => ({
            date,
            weatherCode: d.daily.weather_code[i + 1],
            tempMax: Math.round(d.daily.temperature_2m_max[i + 1]),
            tempMin: Math.round(d.daily.temperature_2m_min[i + 1]),
            precipProbability: d.daily.precipitation_probability_max[i + 1] ?? 0,
            uvIndexMax: parseFloat((d.daily.uv_index_max[i + 1] || 0).toFixed(1)),
        })),
    };
}

// --- Groups cache for /grupos pagination ---
const groupsCache = new Map();

// --- inline_query ---
bot.on("inline_query", async (query) => {
    const userId = query.from.id;
    const lang = await getUserLanguage(userId) || "en";
    const cityName = query.query.trim();
    const timezone = languageToTimezone[lang] || "UTC";

    UserModel.findOneAndUpdate(
        { userID: userId },
        { lastActiveAt: new Date(), $inc: { searchCount: 1 } }
    ).catch(() => {});

    if (!cityName) {
        await bot.answerInlineQuery(query.id, [{
            type: "article",
            id: "init",
            title: i18n.__({ phrase: "title_init", locale: lang }),
            description: i18n.__({ phrase: "description_init", locale: lang }),
            input_message_content: {
                message_text: i18n.__({ phrase: "msg_text_init", locale: lang }),
                parse_mode: "HTML",
            },
            thumbnail_url: "https://i.imgur.com/7OVSbzi.jpeg",
        }], {
            switch_pm_text: i18n.__({ phrase: "how_to_use", locale: lang }),
            switch_pm_parameter: "how_to_use",
            cache_time: 0,
        });
        return;
    }

    try {
        const weather = await getWeatherData(cityName);
        const { current, today, forecast, city, countryCode } = weather;
        const weatherCode = current.weatherCode;
        const emoji = getTemperatureEmoji(current.temperature);
        const weatherEmoji = getWeatherEmoji(weatherCode);
        const weatherDescription = i18n.__({ phrase: `wmo_${weatherCode}`, locale: lang });
        const iconUrl = getWeatherIconUrl(weatherCode);

        const now = new Date();
        const horarioFormatado = now.toLocaleTimeString("pt-BR", { timeZone: timezone });

        const forecastLines = forecast.map(day => {
            const de = getWeatherEmoji(day.weatherCode);
            const dateStr = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return i18n.__({ phrase: "daily_forecast_line", locale: lang }, {
                weatherEmoji: de,
                date: dateStr,
                tempMin: day.tempMin,
                tempMax: day.tempMax,
                precipProbability: day.precipProbability,
                uvIndexMax: day.uvIndexMax,
            });
        }).join("\n");

        const msgParams = {
            cityName: city.toUpperCase(),
            emoji,
            weatherEmoji,
            temperature: current.temperature,
            weatherDescription,
            feelsLike: current.feelsLike,
            windSpeed: current.windSpeed,
            windGusts: current.windGusts,
            uvIndex: current.uvIndex,
            humidity: current.humidity,
            precipitationProbability: today.precipitationProbability,
            sunrise: today.sunrise,
            sunset: today.sunset,
            countryCode,
            horarioFormatado,
            forecastLines,
        };

        const results = [
            {
                type: "article",
                id: "1",
                title: i18n.__({ phrase: "title_message_hidden", locale: lang }),
                description: i18n.__({ phrase: "description_hidden", locale: lang }, { cityName: city, countryCode }),
                input_message_content: {
                    message_text: i18n.__({ phrase: "weather_forecast_message", locale: lang }, msgParams),
                    parse_mode: "Markdown",
                },
                thumbnail_url: iconUrl,
            },
            {
                type: "article",
                id: "2",
                title: i18n.__({ phrase: "title_message_visible", locale: lang }),
                description: i18n.__({ phrase: "description_visible", locale: lang }, { cityName: city, countryCode }),
                input_message_content: {
                    message_text: i18n.__({ phrase: "city_weather_forecast_message", locale: lang }, msgParams),
                    parse_mode: "Markdown",
                },
                thumbnail_url: iconUrl,
            },
            {
                type: "article",
                id: "3",
                title: i18n.__({ phrase: "title_message_forecast", locale: lang }),
                description: i18n.__({ phrase: "description_forecast", locale: lang }, { cityName: city, countryCode }),
                input_message_content: {
                    message_text: i18n.__({ phrase: "daily_forecast_message", locale: lang }, msgParams),
                    parse_mode: "Markdown",
                },
                thumbnail_url: iconUrl,
            },
        ];

        await bot.answerInlineQuery(query.id, results);
    } catch {
        await bot.answerInlineQuery(query.id, [{
            type: "article",
            id: "err",
            title: i18n.__({ phrase: "title_error", locale: lang }),
            description: i18n.__({ phrase: "description_error", locale: lang }),
            input_message_content: {
                message_text: i18n.__({ phrase: "erro_message", locale: lang }),
            },
            thumbnail_url: "https://e7.pngegg.com/pngimages/804/92/png-clipart-computer-icons-error-exit-miscellaneous-trademark.png",
        }]);
    }
});

// --- /stats ---
bot.onText(/\/stats/, async (msg) => {
    if (!is_dev(msg.from.id)) return;

    const now = new Date();
    const d1ago  = new Date(now - 1  * 24 * 60 * 60 * 1000);
    const d7ago  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const d30ago = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
        totalUsers, totalChats,
        dau, wau, mau,
        d1Eligible, d7Eligible, d30Eligible,
        d1Returned, d7Returned, d30Returned,
        langAgg, refAgg, topUsers,
    ] = await Promise.all([
        UserModel.countDocuments(),
        ChatModel.countDocuments(),
        // DAU/WAU/MAU — users active in last N days
        UserModel.countDocuments({ lastActiveAt: { $gte: d1ago } }),
        UserModel.countDocuments({ lastActiveAt: { $gte: d7ago } }),
        UserModel.countDocuments({ lastActiveAt: { $gte: d30ago } }),
        // Retention base: users created before window
        UserModel.countDocuments({ createdAt: { $lte: d1ago } }),
        UserModel.countDocuments({ createdAt: { $lte: d7ago } }),
        UserModel.countDocuments({ createdAt: { $lte: d30ago } }),
        // Retention returned: eligible users active within window
        UserModel.countDocuments({ createdAt: { $lte: d1ago },  lastActiveAt: { $gte: d1ago } }),
        UserModel.countDocuments({ createdAt: { $lte: d7ago },  lastActiveAt: { $gte: d7ago } }),
        UserModel.countDocuments({ createdAt: { $lte: d30ago }, lastActiveAt: { $gte: d30ago } }),
        // Language distribution
        UserModel.aggregate([
            { $group: { _id: "$lang", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]),
        // Top referral sources
        UserModel.aggregate([
            { $match: { referralSource: { $ne: null } } },
            { $group: { _id: "$referralSource", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 },
        ]),
        // Top VIP users by search count
        UserModel.find({ searchCount: { $gt: 0 } })
            .sort({ searchCount: -1 })
            .limit(5)
            .lean()
            .select("firstName username searchCount"),
    ]);

    const pct = (n, d) => d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "N/A";

    const silentUsers = totalUsers - wau;
    const activeRate  = pct(wau, totalUsers);

    const langLines = langAgg.length
        ? langAgg.map(l => ` ☆ ${l._id || "??"}: ${l.count}`).join("\n")
        : " ☆ Sem dados";

    const refLines = refAgg.length
        ? refAgg.map(r => ` ☆ ${r._id}: ${r.count}`).join("\n")
        : " ☆ Sem dados ainda";

    const vipLines = topUsers.length
        ? topUsers.map((u, i) => ` ${i + 1}. ${u.firstName || u.username || u._id} — ${u.searchCount} buscas`).join("\n")
        : " ☆ Sem dados ainda";

    const text =
`──❑ 「 Bot Stats 」 ❑──

👥 <b>Usuários</b>
 ☆ Total: <code>${totalUsers}</code>
 ☆ Grupos: <code>${totalChats}</code>
 ☆ Silenciosos (sem uso em 7d): <code>${silentUsers}</code>

📊 <b>Atividade</b>
 ☆ DAU (hoje): <code>${dau}</code>
 ☆ WAU (7 dias): <code>${wau}</code>
 ☆ MAU (30 dias): <code>${mau}</code>
 ☆ Taxa ativa (WAU/Total): <code>${activeRate}</code>

🔁 <b>Retenção</b>
 ☆ D1 — retornou em 24h: <code>${pct(d1Returned, d1Eligible)}</code> (${d1Returned}/${d1Eligible})
 ☆ D7 — ativo em 7 dias: <code>${pct(d7Returned, d7Eligible)}</code> (${d7Returned}/${d7Eligible})
 ☆ D30 — ativo em 30 dias: <code>${pct(d30Returned, d30Eligible)}</code> (${d30Returned}/${d30Eligible})

🌐 <b>Top idiomas</b>
${langLines}

🔗 <b>Origem (referral)</b>
${refLines}

🏆 <b>Usuários VIP (mais buscas)</b>
${vipLines}`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: "HTML" });
});

// --- User save notification ---
UserModel.on("save", (user) => {
    const message = `#Climatologia #New_User\n<b>User:</b> <a href="tg://user?id=${user.userID}">${user.firstName}</a>\n<b>ID:</b> <code>${user.userID}</code>\n<b>Username:</b> ${user.username ? `@${user.username}` : "N/A"}`;
    bot.sendMessage(groupId, message, { parse_mode: "HTML" }).catch(() => {});
});

// --- /start ---
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    const referralParam = match[1] ? match[1].trim() : null;

    let user = await UserModel.findOne({ userID: msg.from.id });
    if (!user) {
        user = new UserModel({
            firstName: msg.from.first_name,
            userID: msg.from.id,
            username: msg.from.username,
            lang: msg.from.language_code && i18n.getLocales().includes(msg.from.language_code) ? msg.from.language_code : "en",
            createdAt: new Date(),
            lastActiveAt: new Date(),
            referralSource: referralParam,
        });
        await user.save();
    } else {
        await UserModel.findOneAndUpdate({ userID: msg.from.id }, { lastActiveAt: new Date() });
    }

    const locale = user.lang || "en";
    bot.sendMessage(chatId, i18n.__({ phrase: "startMessage", locale }), {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: buildStartKeyboard(locale),
    });
});

// --- Keyboard builders ---
function buildStartKeyboard(locale) {
    return {
        inline_keyboard: [
            [{ text: i18n.__({ phrase: "inline_psq", locale }), switch_inline_query_current_chat: "" }],
            [
                { text: i18n.__({ phrase: "help", locale }), callback_data: "help" },
                { text: i18n.__({ phrase: "owner", locale }), url: "https://t.me/Kylorensbot" },
            ],
            [{ text: i18n.__({ phrase: "addGroup", locale }), url: "https://t.me/climatologiabot?startgroup=true" }],
            [
                { text: i18n.__({ phrase: "langMessage", locale }), callback_data: "choose_language" },
                { text: "📦 Github", url: "https://github.com/leviobrabo/climatologiabot" },
            ],
        ],
    };
}

function buildLangKeyboard(locale) {
    return {
        inline_keyboard: [
            [
                { text: "🇧🇷 Português", callback_data: "choose_portuguese" },
                { text: "🇺🇸 English", callback_data: "choose_english" },
                { text: "🇷🇺 Русский", callback_data: "choose_russian" },
            ],
            [
                { text: "🇪🇸 Español", callback_data: "choose_spanish" },
                { text: "🇫🇷 Français", callback_data: "choose_french" },
                { text: "🇮🇳 हिन्दी", callback_data: "choose_hindi" },
            ],
            [
                { text: "🇮🇹 Italiano", callback_data: "choose_italian" },
                { text: "🇹🇷 Türkçe", callback_data: "choose_turkish" },
                { text: "🇺🇦 Українська", callback_data: "choose_ukrainian" },
            ],
            [
                { text: "🇩🇪 Deutsch", callback_data: "choose_german" },
                { text: "🇸🇦 العربية", callback_data: "choose_arabic" },
                { text: "🇮🇩 Bahasa", callback_data: "choose_indonesian" },
            ],
            [
                { text: "🇮🇷 فارسی", callback_data: "choose_persian" },
            ],
            [{ text: i18n.__({ phrase: "back", locale }), callback_data: "back_to_start" }],
        ],
    };
}

const LANG_CHOICES = {
    choose_portuguese: "pt",
    choose_english: "en",
    choose_russian: "ru",
    choose_spanish: "es",
    choose_french: "fr",
    choose_hindi: "hi",
    choose_italian: "it",
    choose_turkish: "tr",
    choose_ukrainian: "uk",
    choose_german: "de",
    choose_arabic: "ar",
    choose_indonesian: "id",
    choose_persian: "fa",
};

// --- Single consolidated callback_query handler ---
bot.on("callback_query", async (callbackQuery) => {
    if (callbackQuery.message.chat.type !== "private") return;

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    const user = await UserModel.findOne({ userID: userId });
    const locale = user ? user.lang : "en";

    if (data === "help") {
        await bot.editMessageText(i18n.__({ phrase: "help_message", locale }), {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: i18n.__({ phrase: "inline_psq", locale }), switch_inline_query_current_chat: "" }],
                    [
                        { text: i18n.__({ phrase: "support_group_button", locale }), url: "https://t.me/climatologiaofc" },
                        { text: i18n.__({ phrase: "support_button", locale }), url: "https://t.me/kylorensbot" },
                    ],
                    [{ text: i18n.__({ phrase: "git_to_use", locale }), url: "https://t.me/+2w5cw249tXkxMWUx" }],
                    [{ text: i18n.__({ phrase: "back", locale }), callback_data: "back_to_start" }],
                ],
            },
        }).catch(() => {});
    } else if (data === "choose_language") {
        await bot.editMessageText(i18n.__({ phrase: "chooseLangMessage", locale }), {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            chat_id: chatId,
            message_id: messageId,
            reply_markup: buildLangKeyboard(locale),
        }).catch(() => {});
    } else if (LANG_CHOICES[data]) {
        const newLang = LANG_CHOICES[data];
        await UserModel.findOneAndUpdate({ userID: userId }, { lang: newLang });
        await bot.editMessageText(i18n.__({ phrase: "langChangedMessage", locale: newLang }), {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[
                    { text: i18n.__({ phrase: "back", locale: newLang }), callback_data: "back_to_start" },
                ]],
            },
        }).catch(() => {});
    } else if (data === "back_to_start") {
        await bot.editMessageText(i18n.__({ phrase: "startMessage", locale }), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            reply_markup: buildStartKeyboard(locale),
        }).catch(() => {});
    } else if (data === "commands" && is_dev(userId)) {
        const cmdList = [
            "/stats - Bot statistics (users & groups)",
            "/broadcast /bc - Send message to all users",
            "/ping - Check bot latency & uptime",
            "/sendgp - Forward message to all groups",
            "/grupos - List all groups (paginated)",
        ].join("\n");
        await bot.editMessageText(`<b>Developer Commands:</b>\n\n${cmdList}`, {
            parse_mode: "HTML",
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [[{ text: "⬅️ Back", callback_data: "back_dev" }]],
            },
        }).catch(() => {});
    } else if (data === "back_dev" && is_dev(userId)) {
        const firstName = callbackQuery.from.first_name;
        await bot.editMessageText(`Olá, <b>${firstName}</b>! Painel do desenvolvedor 🧑‍💻`, {
            parse_mode: "HTML",
            chat_id: chatId,
            message_id: messageId,
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📬 Canal Oficial", url: "https://t.me/climatologiaofc" }],
                    [{ text: "🗃 Comandos", callback_data: "commands" }],
                ],
            },
        }).catch(() => {});
    } else if (data.startsWith("groups:") && is_dev(userId)) {
        const chunks = groupsCache.get(userId);
        if (!chunks) return bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
        const index = Number(data.split(":")[1]);
        if (index < 0 || index >= chunks.length) return bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
        await bot.editMessageText(chunks[index], {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[
                    { text: `<< ${index + 1}`, callback_data: `groups:${index - 1}` },
                    { text: `>> ${index + 2}`, callback_data: `groups:${index + 1}` },
                ]],
            },
        }).catch(() => {});
        await bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
    }
});

// --- /lang ---
bot.onText(/\/lang/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        bot.sendMessage(chatId, i18n.__({ phrase: "pv_message_lang", locale: "en" }), {
            reply_markup: {
                inline_keyboard: [[
                    { text: i18n.__({ phrase: "pv_message_lang_button", locale: "en" }), url: "https://t.me/climatologiabot?start=lang" },
                ]],
            },
        });
        return;
    }
    const locale = await getUserLanguage(msg.from.id);
    bot.sendMessage(chatId, i18n.__({ phrase: "chooseLanguage", locale }), {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: buildLangKeyboard(locale),
    });
});

// --- /help ---
bot.onText(/\/help/, async (msg) => {
    if (msg.chat.type !== "private") return;
    const chatId = msg.chat.id;
    const locale = await getUserLanguage(msg.from.id);
    bot.sendPhoto(
        chatId,
        "https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/f914dc21-b453-4629-8710-ebf4ec304e49/d8gymea-76b549b0-5202-4789-899a-9c5f835e8fd8.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcL2Y5MTRkYzIxLWI0NTMtNDYyOS04NzEwLWViZjRlYzMwNGU0OVwvZDhneW1lYS03NmI1NDliMC01MjAyLTQ3ODktODk5YS05YzVmODM1ZThmZDgucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.tQYStAnWtQo_s7raGbX_T9CVmujGRY_blrcI68suz5E",
        {
            caption: i18n.__({ phrase: "help_message", locale }),
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            reply_markup: {
                inline_keyboard: [[
                    { text: i18n.__({ phrase: "support_group_button", locale }), url: "https://t.me/climatologiaofc" },
                    { text: i18n.__({ phrase: "support_button", locale }), url: "https://t.me/kylorensbot" },
                ]],
            },
        }
    );
});

// --- new_chat_members ---
bot.on("new_chat_members", async (msg) => {
    const chatId = msg.chat.id;
    const chatName = msg.chat.title;

    try {
        const existing = await ChatModel.findOne({ chatId });
        if (!existing) {
            await ChatModel.create({ chatId, chatName });
        }

        const botUser = await bot.getMe();
        const botJoined = msg.new_chat_members.some(m => m.id === botUser.id);
        if (botJoined) {
            const chatusername = msg.chat.username ? `@${msg.chat.username}` : "Private Group";
            bot.sendMessage(groupId, `#Climatologiabot #New_Group\n<b>Group:</b> ${chatName}\n<b>ID:</b> <code>${chatId}</code>\n<b>Link:</b> ${chatusername}`, {
                parse_mode: "HTML",
            }).catch(() => {});
            bot.sendMessage(chatId, "(🇧🇷) Olá! Sou Janna, bot de previsão do tempo. Use @climatologiabot cidade.\n\n(🇺🇸) Hello! I'm Janna, weather bot. Use @climatologiabot city.", {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "Canal Oficial", url: "https://t.me/climatologiaofc" },
                        { text: "Suporte", url: "https://t.me/kylorensbot" },
                    ]],
                },
            });
        }

        const devMembers = msg.new_chat_members.filter(m => !m.is_bot && is_dev(m.id));
        if (devMembers.length > 0) {
            bot.sendMessage(chatId, `👨‍💻 <b>Developer</b> <a href="tg://user?id=${devMembers[0].id}">${devMembers[0].first_name}</a> joined! 😎`, {
                parse_mode: "HTML",
            }).catch(() => {});
        }
    } catch (err) {
        console.error(err);
    }
});

// --- left_chat_member ---
bot.on("left_chat_member", async (msg) => {
    const botUser = await bot.getMe();
    if (msg.left_chat_member.id !== botUser.id) return;
    try {
        const chat = await ChatModel.findOneAndDelete({ chatId: msg.chat.id });
        if (chat) console.log(`Removed group: ${chat.chatName} (${chat.chatId})`);
    } catch (err) {
        console.error(err);
    }
});

// --- /ping ---
bot.onText(/\/ping/, async (msg) => {
    const start = Date.now();
    const replied = await bot.sendMessage(msg.chat.id, "𝚙𝚘𝚗𝚐!");
    const ms = Date.now() - start;
    await bot.editMessageText(`𝚙𝚒𝚗𝚐: \`${ms}𝚖𝚜\`\n𝚞𝚙𝚝𝚒𝚖𝚎: \`${timeFormatter(process.uptime())}\``, {
        chat_id: replied.chat.id,
        message_id: replied.message_id,
        parse_mode: "Markdown",
    });
});

// --- /broadcast ---
bot.onText(/^(\/broadcast|\/bc)\b/, async (msg, match) => {
    if (!is_dev(msg.from.id) || msg.chat.type !== "private") return;
    const query = match.input.substring(match[0].length).trim();
    if (!query) return bot.sendMessage(msg.chat.id, "<i>I need text to broadcast.</i>", { parse_mode: "HTML" });

    const sentMsg = await bot.sendMessage(msg.chat.id, "<i>Processing...</i>", { parse_mode: "HTML" });
    const web_preview = query.startsWith("-d");
    const text = web_preview ? query.substring(2).trim() : query;
    const users = await UserModel.find().lean().select("userID");
    let success = 0, failed = 0, blocked = 0;

    for (const u of users) {
        try {
            await bot.sendMessage(u.userID, text, { disable_web_page_preview: !web_preview, parse_mode: "HTML" });
            success++;
        } catch (err) {
            if (err.response?.body?.error_code === 403) blocked++;
            else failed++;
        }
    }

    await bot.editMessageText(
        `╭─❑ 「 <b>Broadcast Completed</b> 」 ❑──\n│- <i>Total:</i> <code>${users.length}</code>\n│- <i>OK:</i> <code>${success}</code>\n│- <i>Blocked:</i> <code>${blocked}</code>\n│- <i>Failed:</i> <code>${failed}</code>\n╰❑`,
        { chat_id: sentMsg.chat.id, message_id: sentMsg.message_id, parse_mode: "HTML" }
    );
});

// --- /dev ---
bot.onText(/\/dev/, (msg) => {
    if (msg.chat.type !== "private") return;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    if (!is_dev(userId)) return bot.sendMessage(msg.chat.id, "Você não é desenvolvedor.");
    bot.sendMessage(userId, `Olá, <b>${firstName}</b>! Painel do desenvolvedor 🧑‍💻\n\nUse os comandos com responsabilidade.`, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
            inline_keyboard: [
                [{ text: "📬 Canal Oficial", url: "https://t.me/climatologiaofc" }],
                [{ text: "🗃 Comandos", callback_data: "commands" }],
            ],
        },
    });
});

// --- Status cron ---
async function sendStatus() {
    if (!channelStatusId) return;
    try {
        const start = Date.now();
        const msg = await bot.sendMessage(channelStatusId, "Bot is ON");
        const ms = Date.now() - start;
        const numUsers = await UserModel.countDocuments();
        const numChats = await ChatModel.countDocuments();
        await bot.editMessageText(
            `#Climatologiabot #Status\n\nStatus: ON\nPing: \`${ms}ms\`\nUptime: \`${timeFormatter(process.uptime())}\`\nUsers: \`${numUsers}\`\nChats: \`${numChats}\``,
            { chat_id: msg.chat.id, message_id: msg.message_id, parse_mode: "Markdown" }
        );
    } catch (err) {
        console.error("sendStatus error:", err.message);
    }
}

const job = new CronJob("00 12 * * *", sendStatus, null, true, "America/Sao_Paulo");

// --- /grupos ---
bot.onText(/^\/grupos/, async (msg) => {
    if (!is_dev(msg.from.id) || msg.chat.type !== "private") return;
    try {
        const chats = await ChatModel.find({ chatId: { $lt: 0 } }).sort({ chatId: 1 });
        const chunkSize = 3800;
        const chunks = [];
        let current = "";

        chats.forEach((chat, i) => {
            const line = `<b>${i + 1}:</b> ${chat.chatName} | <code>${chat.chatId}</code>\n`;
            if (current.length + line.length > chunkSize) {
                chunks.push(current);
                current = "";
            }
            current += line;
        });
        if (current) chunks.push(current);
        if (!chunks.length) return bot.sendMessage(msg.chat.id, "No groups found.");

        groupsCache.set(msg.from.id, chunks);
        await bot.sendMessage(msg.chat.id, chunks[0], {
            parse_mode: "HTML",
            reply_markup: {
                inline_keyboard: [[
                    { text: "<< 1", callback_data: "groups:-1" },
                    { text: ">> 2", callback_data: "groups:1" },
                ]],
            },
        });
    } catch (err) {
        console.error(err);
    }
});

// --- /sendgp ---
bot.onText(/\/sendgp/, async (msg, match) => {
    if (!is_dev(msg.from.id) || msg.chat.type !== "private") return;
    const sentMsg = await bot.sendMessage(msg.chat.id, "<i>Processing...</i>", { parse_mode: "HTML" });
    const text = match.input.replace(/^\/sendgp\s*/, "").trim();
    const groups = await ChatModel.find().lean().select("chatId");
    let success = 0, failed = 0, blocked = 0;

    if (msg.reply_to_message) {
        const reply = msg.reply_to_message;
        for (const { chatId } of groups) {
            try {
                await bot.forwardMessage(chatId, reply.chat.id, reply.message_id);
                success++;
            } catch (err) {
                if (err.response?.body?.error_code === 403) blocked++;
                else failed++;
            }
        }
    } else {
        for (const { chatId } of groups) {
            try {
                await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
                success++;
            } catch (err) {
                if (err.response?.body?.error_code === 403) blocked++;
                else failed++;
            }
        }
    }

    await bot.editMessageText(
        `╭─❑ 「 <b>Group Broadcast</b> 」 ❑──\n│- <i>Total:</i> <code>${groups.length}</code>\n│- <i>OK:</i> <code>${success}</code>\n│- <i>Blocked:</i> <code>${blocked}</code>\n│- <i>Failed:</i> <code>${failed}</code>\n╰❑`,
        { chat_id: sentMsg.chat.id, message_id: sentMsg.message_id, parse_mode: "HTML" }
    );
});

// --- Bot configs per language (name, description, commands) ---
const ALL_LOCALES = ["en", "pt", "ru", "es", "fr", "hi", "it", "tr", "uk", "de", "ar", "id", "fa"];
const TG_API = `https://api.telegram.org/bot${token}`;

async function setBotConfigs() {
    for (const locale of ALL_LOCALES) {
        try {
            await axios.post(`${TG_API}/setMyCommands`, {
                commands: [
                    { command: "start", description: i18n.__({ phrase: "commands_start", locale }) },
                    { command: "help", description: i18n.__({ phrase: "commands_help", locale }) },
                    { command: "lang", description: i18n.__({ phrase: "commands_lang", locale }) },
                ],
                language_code: locale,
                scope: { type: "all_private_chats" },
            }, { timeout: 8000 });

            await axios.post(`${TG_API}/setMyName`, {
                name: i18n.__({ phrase: "bot_name", locale }),
                language_code: locale,
            }, { timeout: 8000 });

            await axios.post(`${TG_API}/setMyDescription`, {
                description: i18n.__({ phrase: "bot_description", locale }),
                language_code: locale,
            }, { timeout: 8000 });

            await axios.post(`${TG_API}/setMyShortDescription`, {
                short_description: i18n.__({ phrase: "bot_short_description", locale }),
                language_code: locale,
            }, { timeout: 8000 });

        } catch (err) {
            console.error(`setBotConfigs error [${locale}]:`, err.message);
        }
    }
    console.log("Bot configs set for all locales.");
}

// --- Online/offline ---
function sendBotOnlineMessage() {
    console.log("Janna iniciado com sucesso...");
    bot.sendMessage(groupId, "#Janna #ONLINE\n\nBot is now online...").catch(() => {});
}

function sendBotOfflineMessage() {
    console.log("Janna encerrado com sucesso...");
    bot.sendMessage(groupId, "#Janna #OFFLINE\n\nBot is now offline...")
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

process.on("SIGINT", sendBotOfflineMessage);

sendBotOnlineMessage();
setBotConfigs();
