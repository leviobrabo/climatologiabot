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
