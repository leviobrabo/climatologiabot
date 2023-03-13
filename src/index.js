const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios');
require('dotenv').config();
const { UserModel } = require('./database')
const i18n = require('i18n');



const token = process.env.TELEGRAM_BOT_TOKEN;


const bot = new TelegramBot(token, { polling: true });// URL base da API do OpenWeatherMap

i18n.configure({
  locales: ['en', 'pt', 'ru', 'es', 'fr', 'hi', 'it', 'tr', 'uk'], // Supported locales
  directory: __dirname + '/locales', // Path to locale files
  defaultLocale: 'en', // Default locale
  queryParameter: 'lang', // Query parameter to set locale
  cookie: 'language', // Cookie to set locale
  indent: '  '
});

const weatherBaseUrl = 'https://api.openweathermap.org/data/2.5/weather';
// Função para buscar o idioma do usuário no banco de dados
async function getUserLanguage(userId) {
  const user = await UserModel.findOne({ userID: userId });

  if (!user) {
    // Usuário não encontrado, retorna o idioma padrão
    return i18n.defaultLocale;
  }

  return user.lang;
}

// Tratamento da query do usuário
bot.on('inline_query', async (query) => {
    const userId = query.from.id;
    const userLanguage = await getUserLanguage(userId);
    const cityName = query.query;

    if (!cityName) {
        // Envia mensagem com instruções de uso do bot
        await bot.answerInlineQuery(query.id, [], {
          switch_pm_text:  i18n.__('how_to_use'),
          switch_pm_parameter: 'how_to_use',
          cache_time: 0
        });
    
      return;
    }
  
    let units = 'imperial';
    let lang = 'en';
  
    switch (userLanguage) {
      case 'pt':
      case 'es':
      case 'fr':
      case 'hi':
      case 'it':
      case 'tr':
      case 'uk':
      case 'ru':
        units = 'metric';
        lang = userLanguage;
        break;
      default:
        units = 'imperial';
        lang = 'en';
        break;
    }
  
    i18n.setLocale(lang);
  
    try {
      // Requisição para obter informações meteorológicas da cidade
      const response = await axios.get(`${weatherBaseUrl}?q=${cityName}&appid=${process.env.WEATHER_API_KEY}&units=${units}&lang=${lang}`);
      
      // Dados da resposta
      const weatherData = response.data;
      const temperature = Math.round(weatherData.main.temp);
      const weatherDescription = weatherData.weather[0].description;
      const weatherIconCode = weatherData.weather[0].icon;
      const feelsLike = Math.round(weatherData.main.feels_like);
      const windSpeed = Math.round(weatherData.wind.speed);
      const humidity = weatherData.main.humidity;
      const emoji = getTemperatureEmoji(temperature);
      const countryCode = weatherData.sys.country || "";
      const agora = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const horas = new Date(agora).getHours();
      const minutos = new Date(agora).getMinutes();
      const segundos = new Date(agora).getSeconds();

      let horarioFormatado = `${horas < 10 ? '0' : ''}${horas % 12}:${minutos < 10 ? '0' : ''}${minutos}:${segundos < 10 ? '0' : ''}${segundos} ${horas < 12 ? 'AM' : 'PM'}`;

                
          
      
      // URL da imagem do ícone do tempo
      const weatherIconUrl = `http://openweathermap.org/img/wn/${weatherIconCode}.png`;
  
      // Mensagem de resposta com a previsão do tempo
      const message = i18n.__('weather_forecast_message', { emoji, temperature, weatherDescription, feelsLike, windSpeed, humidity, countryCode, horarioFormatado });
      const message1 = i18n.__('city_weather_forecast_message', { cityName: cityName.toUpperCase(), emoji, temperature, weatherDescription, feelsLike, windSpeed, humidity, countryCode, horarioFormatado });
      const title_message_visible = i18n.__('title_message_visible');
      const description_visible = i18n.__('description_visible', { cityName: cityName, countryCode });
      const title_message_hidden = i18n.__('title_message_hidden');
      const description_hidden = i18n.__('description_hidden', { cityName: cityName, countryCode });



// Resultado da query com a mensagem e a imagem
const result = [{
  type: 'article',
  id: '1',
  title: title_message_hidden,
  description: description_hidden,
  input_message_content: {
    message_text: message,
    parse_mode: 'markdown' // Adicionando parse_mode como markdown
  },
  thumb_url: weatherIconUrl,
},
  {
    type: 'article',
    id: '2',
    title: title_message_visible,
    description: description_visible,
    input_message_content: {
      message_text: message1,
      parse_mode: 'markdown' // Adicionando parse_mode como markdown
    },
    thumb_url: weatherIconUrl,
  }

];

// Envio do resultado da query
bot.answerInlineQuery(query.id, result);
console.log(result);
} catch (error) {
console.log(error)

// Caso ocorra algum erro na requisição, envia uma mensagem de erro para o usuário
const errorMessage = i18n.__('erro_message');
const errorResult = [{
  type: 'article',
  id: '3',
  title: i18n.__('title_error'),
  description: i18n.__('description_error'),
  input_message_content: {
    message_text: errorMessage,
  },
  thumb_url: 'https://e7.pngegg.com/pngimages/804/92/png-clipart-computer-icons-error-exit-miscellaneous-trademark.png',
}];

bot.answerInlineQuery(query.id, errorResult);
}

});

function getTemperatureEmoji(temperature) {
    if (temperature < -10) {
      return '❄️';
    } else if (temperature < 0) {
      return '🥶';
    } else if (temperature < 10) {
      return '🧊';
    } else if (temperature < 20) {
      return '🌡️';
    } else if (temperature < 25) {
      return '🌤️';
    } else if (temperature < 30) {
      return '☀️';
    } else if (temperature < 35) {
      return '🔥';
    } else {
      return '🥵';
    }
  }

    

const groupId = process.env.groupId;

// Comando /stats
bot.onText(/\/stats/, async (msg, match) => {
  try {
    const totalUsers = await UserModel.countDocuments({ inlineSearch: { $exists: true } });
    const message = `\n──❑ 「 Bot Stats 」 ❑──\n\n ☆ ${totalUsers} usuários\n ☆`;

    bot.sendMessage(msg.chat.id, message, { parse_mode: 'markdown' });
  } catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, 'Ocorreu um erro ao buscar as estatísticas do bot.');
  }
});

// Enviar mensagem sempre que um novo usuário for salvo no banco de dados
UserModel.on('save', (user) => {
  const message = `#climatologia #New_User\n\n*User:* ${user.firstName} ${user.lastName}\n*ID:* ${user.userID}\n*Username:* ${user.username}`;
  bot.sendMessage(groupId, message, { parse_mode: 'markdown' });
});

bot.on('polling_error', (error) => {
  console.error(error);
});





bot.onText(/\/start/, async (msg) => {
  if (msg.chat.type !== "private") {
    return;
  }

  const chatId = msg.chat.id;

  // Check if user exists in the database
  let user = await UserModel.findOne({ userID: msg.from.id });
  if (!user) {
    // If user does not exist, create a new user
    user = new UserModel({
      firstName: msg.from.first_name,
      userID: msg.from.id,
      username: msg.from.username,
      lang: 'en' // Default language code
    });
    await user.save();
  } else {
    // If user exists, update their lang in the database (in case it has changed)
    i18n.setLocale(user.lang);
  }

  // Send message with two buttons for URL and choosing language
  bot.sendMessage(chatId, i18n.__('startMessage'), {
    parse_mode: 'markdown',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: i18n.__('addGroup'),
            url: 'https://t.me/climatologiabot?startgroup=true'
          }
        ],
        [
          {
            text: i18n.__('help'),
            callback_data: 'help'
          },
          {
            text: i18n.__('owner'),
            url: 'https://t.me/Kylorensbot'
          }
        ],
        [
          {
            text: i18n.__('langMessage'),
            callback_data: 'choose_language'
          }
        ]
      ]
    }
  });  
});

bot.on('callback_query', async (callbackQuery) => {
  if (callbackQuery.message.chat.type !== 'private') {
    return;
  }
  
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (callbackQuery.data === 'help') {
    // Send message with two buttons to choose language
    await bot.editMessageText(i18n.__('help_message'), {
      parse_mode: 'markdown',
    disable_web_page_preview: true,
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            { text: i18n.__('support_group_button'), url: 'https://t.me/climatologiaofc' },
            { text: i18n.__('support_button'), url: 'https://t.me/kylorensbot' }
          ],
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  }


  if (callbackQuery.data === 'choose_language') {
    // Send message with two buttons to choose language
    await bot.editMessageText(i18n.__('chooseLangMessage'), {
      parse_mode: 'markdown',
      disable_web_page_preview: true,
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🇧🇷 Português',
              callback_data: 'choose_portuguese'
            },
            {
              text: '🇺🇸 English',
              callback_data: 'choose_english'
            },
            {
              text: '🇷🇺 Русский',
              callback_data: 'choose_russian'
            }
          ],
          [
            {
              text: '🇪🇸 Español',
              callback_data: 'choose_spanish'
            },
            {
              text: '🇫🇷 Français',
              callback_data: 'choose_french'
            },
            {
              text: '🇮🇳 हिन्दी',
              callback_data: 'choose_hindi'
            }
          ],
          [
            {
              text: '🇮🇹 Italiano',
              callback_data: 'choose_italian'
            },
            {
              text: '🇹🇷 Türkçe',
              callback_data: 'choose_turkish'
            },
            {
              text: '🇺🇦 Українська',
              callback_data: 'choose_ukrainian'
            }
          ],
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  } else if (callbackQuery.data === 'choose_portuguese') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'pt' }, { new: true });
    i18n.setLocale(user.lang);


    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  } else if (callbackQuery.data === 'choose_english') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'en' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id: chatId,       
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  } else if (callbackQuery.data === 'choose_russian') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'ru' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  } else if (callbackQuery.data === 'choose_spanish') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'es' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  } else if (callbackQuery.data === 'choose_french') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'fr' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
} else if (callbackQuery.data === 'choose_hindi') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'hi' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
} else if (callbackQuery.data === 'choose_italian') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'it' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
} else if (callbackQuery.data === 'choose_turkish') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'tr' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
} else if (callbackQuery.data === 'choose_ukrainian') {
    // Update user language in the database
    const user = await UserModel.findOneAndUpdate({ userID: callbackQuery.from.id }, { lang: 'uk' }, { new: true });
    i18n.setLocale(user.lang);

    // Send a message to the user to confirm that their language has been changed
    await bot.editMessageText(i18n.__('langChangedMessage'), {
      chat_id:  chatId,
      message_id: messageId ,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: i18n.__('back'),
              callback_data: 'back_to_start'
            }
          ]
        ]
      }
    });
  } else if (callbackQuery.data === 'back_to_start') { 
    // Send message with two buttons for URL and choosing language
    await bot.editMessageText(i18n.__('startMessage'), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
          {
            text: i18n.__('addGroup'),
            url: 'https://t.me/climatologiabot?startgroup=true'
          }
        ],
        [
          {
            text: i18n.__('help'),
            callback_data: 'help'
          },
          {
            text: i18n.__('owner'),
            url: 'https://t.me/Kylorensbot'
          }
        ],
        [
          {
            text: i18n.__('langMessage'),
            callback_data: 'choose_language'
          }
        ]
        ]
      }
    });
  }
});




// Handle command to choose language
bot.onText(/\/lang/, (msg) => {
  if (msg.chat.type !== "private") {
    return;
  }
  const chatId = msg.chat.id;

  // Send message with language options to choose
  bot.sendMessage(chatId, i18n.__('chooseLanguage'), {
    parse_mode: 'markdown',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🇧🇷 Português',
            callback_data: 'choose_portuguese'
          },
          {
            text: '🇺🇸 English',
            callback_data: 'choose_english'
          },
          {
            text: '🇷🇺 Русский',
            callback_data: 'choose_russian'
          }
        ],
        [
          {
            text: '🇪🇸 Español',
            callback_data: 'choose_spanish'
          },
          {
            text: '🇫🇷 Français',
            callback_data: 'choose_french'
          },
          {
            text: '🇮🇳 हिन्दी',
            callback_data: 'choose_hindi'
          }
        ],
        [
          {
            text: '🇮🇹 Italiano',
            callback_data: 'choose_italian'
          },
          {
            text: '🇹🇷 Türkçe',
            callback_data: 'choose_turkish'
          },
          {
            text: '🇺🇦 Українська',
            callback_data: 'choose_ukrainian'
          }
        ],
        [
          {
            text: i18n.__('startlanguptdate'),
            callback_data: 'back_to_start'
          }
        ]
      ]
    }
  });
});




  


bot.onText(/\/help/, (msg) => {
  if (msg.chat.type !== "private") {
    return;
  } 
  const chatId = msg.chat.id;

  // Obtendo a mensagem de ajuda na língua do usuário
  const helpMessage = i18n.__('help_message');

  bot.sendPhoto(chatId, 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/f914dc21-b453-4629-8710-ebf4ec304e49/d8gymea-76b549b0-5202-4789-899a-9c5f835e8fd8.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcL2Y5MTRkYzIxLWI0NTMtNDYyOS04NzEwLWViZjRlYzMwNGU0OVwvZDhneW1lYS03NmI1NDliMC01MjAyLTQ3ODktODk5YS05YzVmODM1ZThmZDgucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.tQYStAnWtQo_s7raGbX_T9CVmujGRY_blrcI68suz5E', {
    caption: helpMessage,
    parse_mode: 'markdown',
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: i18n.__('support_group_button'), url: 'https://t.me/climatologiaofc' },
          { text: i18n.__('support_button'), url: 'https://t.me/kylorensbot' }
        ]
      ]
      
    }
  });
});



