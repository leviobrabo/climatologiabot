'use strict';
const axios = require('axios');
const crypto = require('crypto');
const { t } = require('./alerts-locales');

function installWeatherAlerts(bot, mongoose, UserModel) {
  // Use the same language preference as the main bot, with English fallback.
  async function localeFor(id) {
    try { const u = await UserModel.findOne({ userID: id }).lean(); return u?.lang || 'en'; }
    catch { return 'en'; }
  }
  const subs = mongoose.connection.collection('weather_alert_subscriptions');
  const notices = mongoose.connection.collection('weather_alert_notices');
  const api = axios.create({ timeout: 12000 });
  const choices = new Map();
  const queue = [];
  const queued = new Set();
  const HOUR = 3600000;
  const types = ['tempestade','chuva intensa','ventos fortes'];
  const commands = (text) => esc(text).replace(/(\/\w+(?:\s+\d+)?(?:\s+(?:chuva|vento|tempestade)\s+(?:on|off))?)/g, '<code>$1</code>');
  const html = { parse_mode: 'HTML' };
  const settings = (docs, start = 1) => docs.map((d,i) =>
    '<b>'+(start+i)+'. 📍 '+esc(label(d))+'</b>\n' +
    types.map((key,j)=>['⛈️','🌧️','💨'][j]+' '+esc(t('pt', ['stormType','rainType','windType'][j]))+': <b>'+(d.preferences?.[key]===false?'OFF':'ON')+'</b>').join(' · ')
  ).join('\n\n');
  const defaultPrefs = () => ({'tempestade':true,'chuva intensa':true,'ventos fortes':true});
  const severity = h => h.type==='tempestade' ? (h.code===99?'high':'moderate') : h.type==='chuva intensa' ? (h.rain>=50?'high':'moderate') : (h.gust>=100?'high':'moderate');
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
    const lang = await localeFor(msg.from.id);
    const input = (match[1] || '').trim().slice(0, 120);
    if (input.length < 2) return say(msg.chat.id, '🌦️ <b>'+esc(t(lang,'intro'))+'</b>\n\n'+commands(t(lang,'usage'))+'\n\n🌍 '+esc(t(lang,'worldwide'))+'\n📋 '+commands(t(lang,'manage')), {parse_mode:'HTML'});
    try {
      const data = await fetch('https://geocoding-api.open-meteo.com/v1/search', {name:input.split(',')[0].trim(),count:5,language:lang,format:'json'});
      const found = (data.results || []).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
      if (!found.length) return say(msg.chat.id, '🔎 '+t(lang,'notFound'));
      const nonce = crypto.randomBytes(6).toString('hex');
      choices.set(msg.from.id + ':' + nonce, {found, expires:Date.now()+600000});
      return say(msg.chat.id, '📍 <b>'+esc(t(lang,'select'))+'</b>', {parse_mode:'HTML',reply_markup:{inline_keyboard:found.map((p,i)=>[{text:label(p).slice(0,60),callback_data:'wa:add:'+nonce+':'+i}])}});
    } catch(e) {console.error('[alertas] Geocoding:',e.message);return say(msg.chat.id,'⚠️ '+t(lang,'searchError'));}
  });
  bot.on('callback_query', async q => {
    if (!q.data || !q.data.startsWith('wa:add:')) return;
    try { await bot.answerCallbackQuery(q.id); } catch {}
    if (!q.message || q.message.chat.type !== 'private') return;
    const lang = await localeFor(q.from.id);
    const [, , nonce, index] = q.data.split(':');
    if (!/^\d$/.test(index)) return;
    const key = q.from.id+':'+nonce, pending = choices.get(key);
    if (!pending || pending.expires < Date.now()) return say(q.from.id,'⌛ '+t(lang,'expired'));
    const p = pending.found[Number(index)];
    if (!p) return;
    choices.delete(key);
    try {
      const old = await subs.findOne({userID:q.from.id,locationId:p.id});
      if (old?.enabled) return say(q.from.id,'✅ '+esc(t(lang,'already'))+' '+esc(label(p)),{parse_mode:'HTML'});
      const count = await subs.countDocuments({userID:q.from.id,enabled:true});
      if (count >= 3) return say(q.from.id,'⚠️ '+t(lang,'limit'));
      await subs.updateOne({userID:q.from.id,locationId:p.id},{$set:{userID:q.from.id,locationId:p.id,chatId:q.from.id,enabled:true,name:p.name,admin1:p.admin1||'',country:p.country||'',latitude:p.latitude,longitude:p.longitude,timezone:p.timezone||'UTC',preferences:old?.preferences||defaultPrefs(),updatedAt:new Date()}},{upsert:true});
      return say(q.from.id,'🔔 <b>'+esc(t(lang,'enabled'))+'</b>\n\n📍 '+esc(label(p))+'\n⛈️ '+esc(t(lang,'events'))+'\n\nℹ️ '+esc(t(lang,'unofficial'))+'\n📋 '+commands(t(lang,'manage')),{parse_mode:'HTML'});
    } catch(e) {console.error('[alertas] Cadastro:',e.message);return say(q.from.id,'⚠️ '+t(lang,'saveError'));}
  });
  bot.onText(/^\/alertas(?:@\w+)?\s*$/i, async msg => {
    if (msg.chat.type !== 'private') return;
    const lang = await localeFor(msg.from.id);
    try {
      const docs = await subs.find({userID:msg.from.id,enabled:true}).sort({name:1}).toArray();
      if (!docs.length) return say(msg.chat.id,'🔕 '+t(lang,'empty'));
      return say(msg.chat.id,'🔔 <b>'+esc(t(lang,'monitored'))+'</b>\n\n'+docs.map((d,i)=>(i+1)+'. 📍 '+esc(label(d))).join('\n')+'\n\n'+commands(t(lang,'removeHelp')),{parse_mode:'HTML'});
    } catch(e) {console.error('[alertas] Lista:',e.message);}
  });
  bot.onText(/^\/removeralerta(?:@\w+)?(?:\s+(\d+))?\s*$/i, async (msg,match) => {
    if (msg.chat.type !== 'private') return;
    const lang = await localeFor(msg.from.id);
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n<1 || n>3) return say(msg.chat.id,t(lang,'removeUsage'));
    try {
      const docs = await subs.find({userID:msg.from.id,enabled:true}).sort({name:1}).toArray();
      const d = docs[n-1];
      if (!d) return say(msg.chat.id,t(lang,'removeNotFound'));
      await subs.updateOne({_id:d._id,userID:msg.from.id},{$set:{enabled:false,updatedAt:new Date()}});
      return say(msg.chat.id,'🔕 <b>'+esc(t(lang,'disabled'))+'</b>\n📍 '+esc(label(d)),html);
    } catch(e) {console.error('[alertas] Remover:',e.message);}
  });
  bot.onText(/^\/configalertas(?:@\w+)?(?:\s+(\d+)(?:\s+(tempestade|chuva|vento)\s+(on|off))?)?\s*$/i, async (msg,match) => {
    if (msg.chat.type!=='private') return;
    const lang=await localeFor(msg.from.id);
    const docs=await subs.find({userID:msg.from.id,enabled:true}).sort({name:1}).toArray();
    if (!docs.length) return say(msg.chat.id,t(lang,'empty'));
    const n=Number(match[1]),type={tempestade:'tempestade',chuva:'chuva intensa',vento:'ventos fortes'}[match[2]?.toLowerCase()];
    if (type && n>=1 && n<=docs.length) {
      await subs.updateOne({_id:docs[n-1]._id,userID:msg.from.id},{$set:{['preferences.'+type]:match[3].toLowerCase()==='on',updatedAt:new Date()}});
    }
    const updated=await subs.find({userID:msg.from.id,enabled:true}).sort({name:1}).toArray();
    const valid=Number.isInteger(n)&&n>=1&&n<=updated.length;
    const shown=valid ? [updated[n-1]] : updated;
    const title='⚙️ <b>'+esc(t(lang,'monitored'))+'</b>';
    const details=shown.map((d,i)=>
      '<b>'+(valid?n:i+1)+'. 📍 '+esc(label(d))+'</b>\n'+
      types.map((key,j)=>['⛈️','🌧️','💨'][j]+' '+esc(t(lang,['stormType','rainType','windType'][j]))+': <b>'+(d.preferences?.[key]===false?'OFF':'ON')+'</b>').join(' · ')
    ).join('\n\n');
    const confirmation=type && valid
      ? '✅ <b>'+(match[3].toLowerCase()==='on' ? (lang==='pt'?'Ativado':'Enabled') : (lang==='pt'?'Desativado':'Disabled'))+'</b>: '+esc(t(lang,{tempestade:'stormType','chuva intensa':'rainType','ventos fortes':'windType'}[type]))+' — '+esc(label(updated[n-1]))+'\n\n'
      : '';
    const examples='\n\n<code>/configalertas 1 chuva off</code>\n<code>/configalertas 1 vento on</code>';
    return say(msg.chat.id,confirmation+title+'\n\n'+details+examples,html);
  });
  function detect(data) {
    const h=data.hourly||{}, now=Date.now(), hits=new Map();
    for(let i=0;i<(h.time||[]).length;i++) {
      const at=Date.parse(h.time[i].endsWith('Z') ? h.time[i] : h.time[i]+'Z');
      if (!Number.isFinite(at) || at<now-1800000 || at>now+3*HOUR) continue;
      const code=h.weather_code?.[i], rain=h.precipitation?.[i]||0, gust=h.wind_gusts_10m?.[i]||0;
      for (const x of [[ [95,96,99].includes(code),'tempestade','⛈️','Trovoadas previstas'],[rain>=20,'chuva intensa','🌧️',Math.round(rain)+' mm/h previstos'],[gust>=75,'ventos fortes','💨','Rajadas de '+Math.round(gust)+' km/h previstas']]) {
        if (x[0] && !hits.has(x[1])) hits.set(x[1],{type:x[1],emoji:x[2],detail:x[3],rain,gust,code,at});
      }
    }
    return [...hits.values()];
  }
  function message(city, h, lang, timezone) {
    const tz = timezone || 'UTC';
    let when;
    try { when = new Date(h.at).toLocaleString(lang,{timeZone:tz,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
    catch { when = new Date(h.at).toISOString().slice(0,16).replace('T',' ')+' UTC'; }
    const typeKey = {'tempestade':'stormType','chuva intensa':'rainType','ventos fortes':'windType'}[h.type];
    const detail = h.type==='tempestade' ? t(lang,'thunder') :
      h.type==='chuva intensa' ? Math.round(h.rain)+' '+t(lang,'rainUnit') :
      t(lang,'gusts')+' '+Math.round(h.gust)+' '+t(lang,'windUnit');
    return h.emoji+' <b>'+esc(t(lang,'notice'))+' — '+esc(t(lang,typeKey))+'</b> ['+(severity(h)==='high'?'🔴 HIGH':'🟠 MODERATE')+']\n\n📍 <b>'+esc(city)+'</b>\n🕒 '+esc(t(lang,'forecast'))+': '+esc(when)+' ('+esc(tz)+')\n🌦️ '+esc(detail)+'\n\n⚠️ '+esc(t(lang,'safety'))+'\n\nℹ️ '+esc(t(lang,'disclaimer'))+'\n🔕 '+esc(t(lang,'manage'));
  }
  async function scan() {
    if (scanning || mongoose.connection.readyState!==1) return;
    scanning=true;
    try {
      // Paginate cities fairly; unlike a fixed limit, no city is permanently starved.
      const locations=await subs.aggregate([{$match:{enabled:true}},{$group:{_id:'$locationId',name:{$first:'$name'},admin1:{$first:'$admin1'},country:{$first:'$country'},latitude:{$first:'$latitude'},longitude:{$first:'$longitude'},timezone:{$first:'$timezone'}}},{$sort:{_id:1}}]).toArray();
      if (!locations.length) return;
      const batch=locations.slice(cursor,cursor+300);
      cursor=cursor+batch.length>=locations.length?0:cursor+batch.length;
      console.log('[alertas] Verificando '+batch.length+' de '+locations.length+' cidades');
      for(const loc of batch) {
        try {
          const forecast=await fetch('https://api.open-meteo.com/v1/forecast',{latitude:loc.latitude,longitude:loc.longitude,hourly:'weather_code,precipitation,wind_gusts_10m',forecast_days:2,timezone:'UTC',wind_speed_unit:'kmh'});
          const hits=detect(forecast);
          if (!hits.length) continue;
          const recipients=await subs.find({locationId:loc._id,enabled:true}).project({_id:1,userID:1,chatId:1,preferences:1}).toArray();
          for(const h of hits) for(const sub of recipients) {
            if (sub.preferences?.[h.type]===false) continue;
            const bucket=Math.floor(Date.now()/(6*HOUR));
            const id=sub.userID+':'+loc._id+':'+h.type+':'+bucket;
            if(queued.has(id)) continue;
            queued.add(id);
            queue.push({id,sub,city:label(loc),hit:h,timezone:loc.timezone||'UTC'});
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
      if (!active || active.preferences?.[item.hit.type]===false) return;
      // Atomic dedup persists across restarts. A failed send is logged, never silently retried forever.
      const claim=await notices.updateOne({_id:item.id},{$setOnInsert:{createdAt:new Date()}},{upsert:true});
      if (!claim.upsertedCount) return;
      try { await bot.sendMessage(active.chatId||active.userID,message(item.city,item.hit,await localeFor(active.userID),item.timezone),{parse_mode:'HTML',disable_web_page_preview:true}); }
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
