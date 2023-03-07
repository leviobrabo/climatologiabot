const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;


const bot = new TelegramBot(token, { polling: true });// URL base da API do OpenWeatherMap
const weatherBaseUrl = 'https://api.openweathermap.org/data/2.5/weather';
// Tratamento da query do usuário
bot.on('inline_query', async (query) => {
   
    const cityName = query.query;

    
    if (!cityName) {
        // Envia mensagem com instruções de uso do bot
        await bot.answerInlineQuery(query.id, [], {
          switch_pm_text: 'Como usar o bot',
          switch_pm_parameter: 'how_to_use',
          cache_time: 0
        });
    
      return;
    }
  
    try {
      // Requisição para obter informações meteorológicas da cidade
      const response = await axios.get(`${weatherBaseUrl}?q=${cityName}&appid=${process.env.WEATHER_API_KEY}&units=metric&lang=pt&country=BR&cnt=50`);
  
  
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
      const horarioPesquisa = new Date().toLocaleString(); // cria constante com o horário da pesquisa
      
      
  
  
  
      // URL da imagem do ícone do tempo
      const weatherIconUrl = `http://openweathermap.org/img/wn/${weatherIconCode}.png`;
  
      // Mensagem de resposta com a previsão do tempo
      const message = `*Previsão do tempo para sua cidade ${emoji} * \n\n*🌡️ Temperatura:* ${temperature}°C\n*🌤️ Descrição:* ${weatherDescription} \n🏖 *Sensação térmica:* ${feelsLike}°C\n💨 *Velocidade do vento:* ${windSpeed} km/h \n💦 *Umidade relativa do ar:* ${humidity}% \n*🌎 País:* ${countryCode} \n\n*🔍 Consultado em:* ${horarioPesquisa} `;
      const message1 = `*Previsão do tempo para ${cityName.toUpperCase()} ${emoji} * \n\n*🏙️ Cidade:* ${cityName} \n*🌡️ Temperatura:* ${temperature}°C\n*🌤️ Descrição:* ${weatherDescription} \n🏖 *Sensação térmica:* ${feelsLike}°C\n💨 *Velocidade do vento:* ${windSpeed} km/h \n💦 *Umidade relativa do ar:* ${humidity}% \n*🌎 País:* ${countryCode} \n\n*🔍 Consultado em:* ${horarioPesquisa} `;
    
// Resultado da query com a mensagem e a imagem
const result = [{
    type: 'article',
    id: '1',
    title: `Previsão do tempo para sua cidade🌤️`,
    description: `Veja o clima de ${cityName} - ${weatherData.sys.country} \nObs.: NOME DA CIDADE OCULTADA`,
    input_message_content: {
      message_text: message,
      parse_mode: 'Markdown' // Adicionando parse_mode como Markdown
    },
    thumb_url: weatherIconUrl,
  },
  {  
      type: 'article',
    id: '2',
    title: `Previsão do tempo para sua cidade🌤️`,
    description: `Veja o clima de ${cityName} - ${weatherData.sys.country} \nObs.: NOME DA CIDADE VÍSIVEL`,
    input_message_content: {
      message_text: message1,
      parse_mode: 'Markdown' // Adicionando parse_mode como Markdown
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
  const errorMessage = 'Não foi possível obter a previsão do tempo. Por favor, tente novamente mais tarde.';
  const errorResult = [{
    type: 'article',
    id: '3',
    title: 'Ops! Ocorreu um erro',
    description: `Não foi possível obter a previsão do tempo.`,
    input_message_content: {
      message_text: `Não foi possível obter a previsão do tempo. Por favor, tente novamente mais tarde.`,
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

    











  // Responder ao comando /start
bot.onText(/\/start/, (msg) => {
  if (msg.chat.type === 'private') {
  const chatId = msg.chat.id;
  
    bot.sendPhoto(chatId, 'https://i1.wp.com/streamie.com.br/wp-content/uploads/2016/11/img-janna-capa.jpg', {
      caption: 'Olá, sou Janna! \n\nSou um bot que te envia os dados de previsão do tempo da sua cidade.😄! \n\n*Sou um bot INLINE, ou seja, não precisa me pôr no seu grupo.* Basta escrever meu username dessa forma `@climatologiabot` e logo em seguida o nome da sua cidade. Fique tranquilo, as informações são ocultadas para os demais. 🤝 \n\nVocê também pode pesquisar a previsão do tempo diretamente no meu privado😉 \n\nPor questões de privacidade, ocultamos o nome da sua cidade.',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Canal de figurinhas', url: 'https://t.me/lbrabo' },
            { text: '👤Dono', url: 'https://t.me/Kylorensbot' }],
          [{ text: 'Adicione-me em seu grupo', url: 'https://t.me/climatologiabot?startgroup=true' }],
          [{ text: 'Fazer uma doação 💰', callback_data: '/donate'}]
        ],
      },
      parse_mode: 'Markdown'
    });
      }
  });
  

  bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
  
    if (data === '/donate') {
      const usuario =  msg.from.first_name;
    const chavePix = '32dc79d2-2868-4ef0-a277-2c10725341d4';
    const banco = 'Picpay';
    const nome = 'Luzia';
  
    const resposta = `Olá, ${usuario}! \n\nContribua com qualquer valor para ajudar a manter o servidor do bot online e com mais recursos! Sua ajuda é fundamental para mantermos o bot funcionando de forma eficiente e com novas funcionalidades. \n\nPara fazer uma doação, utilize a chave PIX a seguir: \nPix: \`\`\`${chavePix}\`\`\` \nBanco: ${banco}\nNome: ${nome}\n\nObrigado pela sua contribuição! 🙌"`;
  
    bot.sendMessage(msg.chat.id, resposta, {reply_to_message_id: msg.message_id, parse_mode: 'Markdown'});
    }
  });





  // Comando /help
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
  
    // Enviando mensagem com uma foto e um texto explicativo
    bot.sendPhoto(chatId, 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/f914dc21-b453-4629-8710-ebf4ec304e49/d8gymea-76b549b0-5202-4789-899a-9c5f835e8fd8.png?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7InBhdGgiOiJcL2ZcL2Y5MTRkYzIxLWI0NTMtNDYyOS04NzEwLWViZjRlYzMwNGU0OVwvZDhneW1lYS03NmI1NDliMC01MjAyLTQ3ODktODk5YS05YzVmODM1ZThmZDgucG5nIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmZpbGUuZG93bmxvYWQiXX0.tQYStAnWtQo_s7raGbX_T9CVmujGRY_blrcI68suz5E', {
      caption: 'Olá! Eu sou um bot de previsão do tempo. \n\nVocê pode me usar inline digitando o nome da cidade. Tente digitar `@climatologiabot nome da sua cidade` em qualquer conversa. \n\nVocê também pode clicar nos botões abaixo para obter suporte ou acessar outro bot:',
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Grupo de Apoio', url: 'https://t.me/namoro_e_amizadesc' },
            { text: 'Suporte', url: 'https://t.me/kylorensbot' }
          ],
          [
            { text: 'Clique aqui!', callback_data: 'contact' }
          ]
        ]
      }
    });
  });

  
