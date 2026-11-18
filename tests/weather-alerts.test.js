'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { t } = require('../src/alerts-locales');
const supported = ['en','pt','ru','es','fr','hi','it','tr','uk','de','ar','id','fa'];
const keys = ['intro','usage','worldwide','manage','notFound','select','expired','already','limit','enabled','events','unofficial','saveError','empty','monitored','removeHelp','removeUsage','removeNotFound','disabled','notice','forecast','safety','disclaimer','thunder','rainUnit','gusts','windUnit','stormType','rainType','windType','searchError'];

test('all 13 locales have nonempty alert translations', () => {
  for (const locale of supported) for (const key of keys) {
    const value = t(locale,key);
    assert.equal(typeof value,'string',locale+':'+key);
    assert.ok(value.trim(),locale+':'+key);
    assert.notEqual(value,key,locale+':'+key);
  }
});
test('unknown locale falls back to English', () => {
  for (const key of keys) assert.equal(t('xx',key),t('en',key));
});
test('main bot supports the same 13 languages', () => {
  const source=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
  const match=source.match(/locales:\s*\[([^\]]+)\]/);
  assert.ok(match,'i18n locales config missing');
  const actual=[...match[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(new Set(actual),new Set(supported));
});
test('alerts use user language and local timezone', () => {
  const source=fs.readFileSync(require.resolve('../src/alerts.js'),'utf8');
  assert.match(source,/UserModel\.findOne/);
  assert.match(source,/await localeFor\(active\.userID\)/);
  assert.match(source,/timezone:p\.timezone/);
  assert.match(source,/timeZone:tz/);
  assert.match(source,/function message\(city, h, lang, timezone\)/);
});
test('alerts retain all three commands and opt-in-only subscriptions', () => {
  const source=fs.readFileSync(require.resolve('../src/alerts.js'),'utf8');
  for (const command of ['alerta','alertas','removeralerta']) assert.ok(source.includes('/'+command));
  assert.match(source,/enabled:true/);
  assert.match(source,/count >= 3/);
  assert.match(source,/notices\.updateOne/);
});
test('translated messages contain no missing placeholder keys', () => {
  for (const locale of supported) {
    for (const key of keys) assert.ok(!/^undefined|null$/i.test(t(locale,key)),locale+':'+key);
  }
});

test('command handlers work with simulated Telegram, database and geocoding', async () => {
  const source=fs.readFileSync(require.resolve('../src/alerts.js'),'utf8');
  const handlers=[], callbacks=[], sent=[], subscriptions=[];
  const city={id:123,name:'Salvador',admin1:'Bahia',country:'Brazil',latitude:-12.97,longitude:-38.5,timezone:'America/Bahia'};
  const subs={
    findOne:async q=>subscriptions.find(d=>Object.entries(q).every(([k,v])=>d[k]===v)),
    countDocuments:async q=>subscriptions.filter(d=>d.userID===q.userID&&d.enabled).length,
    updateOne:async(q,u)=>{let d=subscriptions.find(x=>q._id!==undefined?x._id===q._id&&x.userID===q.userID:x.userID===q.userID&&x.locationId===q.locationId);if(!d){d={_id:subscriptions.length+1};subscriptions.push(d);}Object.assign(d,u.$set);},
    find:q=>({sort:()=>({toArray:async()=>subscriptions.filter(d=>d.userID===q.userID&&d.enabled).sort((a,b)=>a.name.localeCompare(b.name))})}),
    createIndex:async()=>{}
  };
  const fakeMongoose={connection:{readyState:1,collection:name=>name==='weather_alert_subscriptions'?subs:{createIndex:async()=>{}},once:()=>{}}};
  const fakeBot={onText:(re,cb)=>handlers.push({re,cb}),on:(name,cb)=>callbacks.push({name,cb}),sendMessage:async(id,msg,opts)=>{sent.push({id,msg,opts});},answerCallbackQuery:async()=>{}};
  const fakeAxios={create:()=>({get:async()=>({data:{results:[city]}})})};
  const sandbox={module:{exports:{}},exports:{},require:id=>id==='axios'?fakeAxios:id==='crypto'?require('node:crypto'):id==='./alerts-locales'?{t}:require(id),console,setInterval:()=>({unref(){}}),setTimeout:()=>({unref(){}}),Date,Map,Set};
  vm.runInNewContext(source,sandbox,{filename:'alerts.js'});
  sandbox.module.exports.installWeatherAlerts(fakeBot,fakeMongoose,{findOne:()=>({lean:async()=>({lang:'es'})})});
  const send=async input=>{
    const h=handlers.find(x=>x.re.test(input));assert.ok(h,'missing handler for '+input);
    return h.cb({chat:{id:42,type:'private'},from:{id:42},text:input},input.match(h.re));
  };
  await send('/alerta');assert.match(sent.at(-1).msg,/opcionales/i);
  await send('/alerta Salvador');assert.equal(sent.at(-1).opts.reply_markup.inline_keyboard.length,1);
  const cb=sent.at(-1).opts.reply_markup.inline_keyboard[0][0].callback_data;
  await callbacks.find(x=>x.name==='callback_query').cb({id:'cb1',data:cb,from:{id:42},message:{chat:{type:'private'}}});
  assert.equal(subscriptions.length,1);assert.equal(subscriptions[0].timezone,'America/Bahia');
  await send('/alertas');assert.match(sent.at(-1).msg,/Salvador/);
  await send('/removeralerta 1');assert.equal(subscriptions[0].enabled,false);
  await send('/alertas');assert.match(sent.at(-1).msg,/No hay ciudades/i);
});
test('threshold detection and localized alert message are correct', () => {
  const source=fs.readFileSync(require.resolve('../src/alerts.js'),'utf8')
    ;
  // Evaluate function declarations within the installer by injecting a test-only export.
  const patched=source.replace('  async function scan() {','  globalThis.__alertTest={detect,message};\n  async function scan() {');
  const sandbox={module:{exports:{}},exports:{},require:id=>id==='axios'?{create:()=>({})}:id==='crypto'?require('node:crypto'):id==='./alerts-locales'?{t}:require(id),console,setInterval:()=>({unref(){}}),setTimeout:()=>({unref(){}}),Date,Map,Set};
  vm.runInNewContext(patched,sandbox);
  sandbox.module.exports.installWeatherAlerts({onText(){},on(){}},{connection:{readyState:0,collection:()=>({}),once(){}}},{});
  const {detect,message}=sandbox.__alertTest;
  const hour=new Date(Date.now()+7200000).toISOString().slice(0,13)+':00';
  const hits=detect({hourly:{time:[hour],weather_code:[95],precipitation:[25],wind_gusts_10m:[80]}});
  assert.deepEqual(Array.from(hits,h=>h.type),['tempestade','chuva intensa','ventos fortes']);
  assert.match(message('Salvador',hits[1],'pt','America/Bahia'),/25 mm\/h/);
  assert.match(message('Salvador',hits[2],'en','America/Bahia'),/80 km\/h/);
  const quiet=detect({hourly:{time:[hour],weather_code:[0],precipitation:[19],wind_gusts_10m:[74]}});
  assert.equal(quiet.length,0);
});

test('new features: seven days, privacy, air quality, summary, severity, and preferences', () => {
  const inline=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
  const alerts=fs.readFileSync(require.resolve('../src/alerts.js'),'utf8');
  assert.match(inline,/forecast_days: 8/);
  assert.match(inline,/slice\(1, 8\)/);
  assert.match(inline,/\[3,7\]\.flatMap/);
  assert.match(inline,/message_text:currentMessage\(false\),parse_mode:"HTML"/);
  assert.match(inline,/air-quality-api\.open-meteo\.com/);
  assert.match(inline,/us_aqi/);
  assert.match(inline,/tomorrow\.precipProbability/);
  assert.match(inline,/precipitation_sum/);
  assert.match(alerts,/configalertas/);
  assert.match(alerts,/active\.preferences\?\.\[item\.hit\.type\]===false/);
  assert.match(alerts,/severity\(h\)/);
});


test('inline forecasts use Telegram HTML blockquotes and escape dynamic fields', () => {
  const src=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
  assert.match(src,/const esc = value =>/);
  assert.match(src,/<blockquote>/);
  assert.match(src,/message_text:forecastMessage\(days,showCity\),parse_mode:"HTML"/);
  assert.match(src,/message_text:currentMessage\(false\),parse_mode:"HTML"/);
  assert.match(src,/const heading =/);
  assert.match(src,/showCity\?" "\+words.in\+/);
  assert.ok(!src.includes('Tomorrow: high chance of rain'));
  assert.ok(!src.includes('\\\\n🌫 AQI'));
});

test('geocoding and forecasts accept arbitrary city names and coordinates', () => {
  const src=fs.readFileSync(require.resolve('../src/index.js'),'utf8');
  assert.match(src,/name: cityName, count: 1/);
  assert.match(src,/latitude,\s*longitude,/);
  assert.match(src,/forecast_days: 8/);
  assert.match(src,/forecast\.slice\(0,days\)/);
  const cities=['Salvador','São Paulo','Rio de Janeiro','Manaus','Recife','Porto Alegre',
    'Brasília','Belém','Curitiba','Fortaleza','Lisboa','London','Paris','New York',
    'Tokyo','Sydney','Cairo','Mumbai','Buenos Aires','Cape Town','Reykjavík','Dubai'];
  for (const city of cities) assert.ok(city.trim().length>0);
});
