'use strict';
const axios = require('axios');
const crypto = require('crypto');

function installWeatherAlerts(bot, mongoose) {
  const subs = mongoose.connection.collection('weather_alert_subscriptions');
  const notices = mongoose.connection.collection('weather_alert_notices');
  const api = axios.create({ timeout: 12000 });
  const choices = new Map();
  const queue = [];
  const queued = new Set();
  const HOUR = 3600000;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const label = p => [p.name, p.admin1, p.country].filter(Boolean).join(', ');
  let scanning = false, sending = false, lastRequest = 0, cursor = 0;
  async function fetch(url, params) {
    const delay = 1200 - (Date.now() - lastRequest);
    if (delay > 0) await wait(delay);
    lastRequest = Date.now();
    return (await api.get(url, { params })).data;
  }
  async function say(id, message, opts = {}) {
    try { return await bot.sendMessage(id, message, opts); }
    catch (e) { console.error('[alertas] Telegram:', e.message); }
  }
  bot.onText(/^\/alerta(?:@\w+)?(?:\s+(.+))?$/i, async (msg, match) => {
    if (msg.chat.type !== 'private') return;
    const input = (match[1] || '').trim().slice(0, 120);
    if (input.length < 2) return say(msg.chat.id, '🌦️ <b>Alertas opcionais</b>\n\nUse <code>/alerta Salvador</code> e escolha sua cidade.\n🌍 Disponível mundialmente.\n🔔 Somente inscritos recebem avisos.\n📋 /alertas — gerenciar inscrições.', {parse_mode:'HTML'});
    try {
      // The geocoder works best with the primary city name; region/country appear in the choices.
      const data = await fetch('https://geocoding-api.open-meteo.com/v1/search', {name:input.split(',')[0].trim(),count:5,language:'pt',format:'json'});
      const found = (data.results || []).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
      if (!found.length) return say(msg.chat.id, '🔎 Cidade não encontrada. Tente somente o nome principal.');
      const nonce = crypto.randomBytes(6).toString('hex');
      choices.set(msg.from.id + ':' + nonce, {found, expires:Date.now()+600000});
      return say(msg.chat.id, '📍 <b>Selecione a localidade correta:</b>', {parse_mode:'HTML',reply_markup:{inline_keyboard:found.map((p,i)=>[{text:label(p).slice(0,60),callback_data:'wa:add:'+nonce+':'+i}])}});
    } catch(e) {console.error('[alertas] Geocoding:',e.message);return say(msg.chat.id,'⚠️ Busca indisponível. Tente novamente mais tarde.');}
  });
  bot.on('callback_query', async q => {
    if (!q.data || !q.data.startsWith('wa:add:')) return;
    try { await bot.answerCallbackQuery(q.id); } catch {}
    if (!q.message || q.message.chat.type !== 'private') return;
    const [, , nonce, index] = q.data.split(':');
    if (!/^\d$/.test(index)) return;
    const key = q.from.id+':'+nonce, pending = choices.get(key);
    if (!pending || pending.expires < Date.now()) return say(q.from.id,'⌛ Pesquisa expirada. Use /alerta novamente.');
    const p = pending.found[Number(index)];
    if (!p) return;
    choices.delete(key);
    try {
      const old = await subs.findOne({userID:q.from.id,locationId:p.id});
      if (old?.enabled) return say(q.from.id,'✅ Você já monitora '+esc(label(p)),{parse_mode:'HTML'});
      const count = await subs.countDocuments({userID:q.from.id,enabled:true});
      if (count >= 3) return say(q.from.id,'⚠️ Limite de três cidades. Use /removeralerta.');
      await subs.updateOne({userID:q.from.id,locationId:p.id},{$set:{userID:q.from.id,locationId:p.id,chatId:q.from.id,enabled:true,name:p.name,admin1:p.admin1||'',country:p.country||'',latitude:p.latitude,longitude:p.longitude,updatedAt:new Date()}},{upsert:true});
      return say(q.from.id,'🔔 <b>Alertas ativados!</b>\n\n📍 '+esc(label(p))+'\n⛈️ Tempestades, chuva intensa e ventos fortes.\n\nℹ️ Avisos preventivos de previsão, não oficiais.\n📋 /alertas para gerenciar.',{parse_mode:'HTML'});
    } catch(e) {console.error('[alertas] Cadastro:',e.message);return say(q.from.id,'⚠️ Não consegui salvar a inscrição.');}
  });
  bot.onText(/^\/alertas(?:@\w+)?\s*$/i, async msg => {
    if (msg.chat.type !== 'private') return;
    try {
      const docs = await subs.find({userID:msg.from.id,enabled:true}).sort({name:1}).toArray();
      if (!docs.length) return say(msg.chat.id,'🔕 Nenhuma cidade monitorada.\n\nUse /alerta Salvador.');
      return say(msg.chat.id,'🔔 <b>Cidades monitoradas</b>\n\n'+docs.map((d,i)=>(i+1)+'. 📍 '+esc(label(d))).join('\n')+'\n\nCancelar: <code>/removeralerta 1</code>',{parse_mode:'HTML'});
    } catch(e) {console.error('[alertas] Lista:',e.message);}
  });
  bot.onText(/^\/removeralerta(?:@\w+)?(?:\s+(\d+))?\s*$/i, async (msg,match) => {
    if (msg.chat.type !== 'private') return;
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n<1 || n>3) return say(msg.chat.id,'Use /alertas e depois /removeralerta 1.');
    try {
      const docs = await subs.find({userID:msg.from.id,enabled:true}).sort({name:1}).toArray();
      const d = docs[n-1];
      if (!d) return say(msg.chat.id,'Cidade não encontrada. Use /alertas.');
      await subs.updateOne({_id:d._id,userID:msg.from.id},{$set:{enabled:false,updatedAt:new Date()}});
      return say(msg.chat.id,'🔕 Alertas desativados para '+d.name+'.');
    } catch(e) {console.error('[alertas] Remover:',e.message);}
  });
  function detect(data) {
    const h=data.hourly||{}, now=Date.now(), hits=new Map();
    for(let i=0;i<(h.time||[]).length;i++) {
      const at=Date.parse(h.time[i]+'Z');
      if (!Number.isFinite(at) || at<now-1800000 || at>now+3*HOUR) continue;
      const code=h.weather_code?.[i], rain=h.precipitation?.[i]||0, gust=h.wind_gusts_10m?.[i]||0;
      for (const x of [[ [95,96,99].includes(code),'tempestade','⛈️','Trovoadas previstas'],[rain>=20,'chuva intensa','🌧️',Math.round(rain)+' mm/h previstos'],[gust>=75,'ventos fortes','💨','Rajadas de '+Math.round(gust)+' km/h previstas']]) {
        if (x[0] && !hits.has(x[1])) hits.set(x[1],{type:x[1],emoji:x[2],detail:x[3],at});
      }
    }
    return [...hits.values()];
  }
  function message(city, h) {
    const when=new Date(h.at).toLocaleString('pt-BR',{timeZone:'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    return h.emoji+' <b>AVISO PREVENTIVO — '+esc(h.type.toUpperCase())+'</b>\n\n📍 <b>'+esc(city)+'</b>\n🕒 Previsão: '+when+' UTC\n🌦️ '+esc(h.detail)+'\n\n⚠️ Evite áreas de risco e acompanhe a Defesa Civil local.\n\nℹ️ Previsão automatizada Open-Meteo. <b>Não é alerta oficial.</b>\n🔕 Gerencie em /alertas';
  }
  async function scan() {
    if (scanning || mongoose.connection.readyState!==1) return;
    scanning=true;
    try {
      // Paginate cities fairly; unlike a fixed limit, no city is permanently starved.
      const locations=await subs.aggregate([{$match:{enabled:true}},{$group:{_id:'$locationId',name:{$first:'$name'},admin1:{$first:'$admin1'},country:{$first:'$country'},latitude:{$first:'$latitude'},longitude:{$first:'$longitude'}}},{$sort:{_id:1}}]).toArray();
      if (!locations.length) return;
      const batch=locations.slice(cursor,cursor+300);
      cursor=cursor+batch.length>=locations.length?0:cursor+batch.length;
      console.log('[alertas] Verificando '+batch.length+' de '+locations.length+' cidades');
      for(const loc of batch) {
        try {
          const forecast=await fetch('https://api.open-meteo.com/v1/forecast',{latitude:loc.latitude,longitude:loc.longitude,hourly:'weather_code,precipitation,wind_gusts_10m',forecast_days:2,timezone:'UTC',wind_speed_unit:'kmh'});
          const hits=detect(forecast);
          if (!hits.length) continue;
          const recipients=await subs.find({locationId:loc._id,enabled:true}).project({_id:1,userID:1,chatId:1}).toArray();
          for(const h of hits) for(const sub of recipients) {
            const bucket=Math.floor(Date.now()/(6*HOUR));
            const id=sub.userID+':'+loc._id+':'+h.type+':'+bucket;
            if(queued.has(id)) continue;
            queued.add(id);
            queue.push({id,sub,city:label(loc),hit:h});
          }
        } catch(e) {console.error('[alertas] API:',loc._id,e.message);}
      }
    } finally {scanning=false;}
  }
  async function sendOne() {
    if (sending || !queue.length) return;
    sending=true;
    const item=queue.shift();
    try {
      const active=await subs.findOne({_id:item.sub._id,enabled:true});
      if (!active) return;
      // Atomic dedup persists across restarts. A failed send is logged, never silently retried forever.
      const claim=await notices.updateOne({_id:item.id},{$setOnInsert:{createdAt:new Date()}},{upsert:true});
      if (!claim.upsertedCount) return;
      try { await bot.sendMessage(active.chatId||active.userID,message(item.city,item.hit),{parse_mode:'HTML',disable_web_page_preview:true}); }
      catch(e) {
        if(e.response?.statusCode===403) await subs.updateMany({userID:active.userID},{$set:{enabled:false}});
        console.error('[alertas] Envio:',e.message);
      }
    } catch(e) {console.error('[alertas] Fila:',e.message);}
    finally {queued.delete(item.id);sending=false;}
  }
  async function init() {
    await subs.createIndex({userID:1,locationId:1},{unique:true});
    await subs.createIndex({enabled:1,locationId:1});
    await notices.createIndex({createdAt:1},{expireAfterSeconds:8*24*3600});
    setInterval(()=>scan().catch(console.error),HOUR).unref();
    setInterval(()=>sendOne().catch(console.error),1200).unref();
    setTimeout(()=>scan().catch(console.error),15000).unref();
    console.log('[alertas] Ativo: monitor 60min, envio 1/1,2s, 300 cidades por ciclo');
  }
  if(mongoose.connection.readyState===1) init().catch(console.error);
  else mongoose.connection.once('open',()=>init().catch(console.error));
}
module.exports={installWeatherAlerts};
