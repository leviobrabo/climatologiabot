const { Schema } = require('mongoose');

const UserSchema = new Schema({
  firstName: { type: String },
  userID: { type: Number, required: true },
  username: { type: String },
  city: { type: String, required: false },
  name: { type: String, required: false },
  lang: { type: String, default: 'en' }, // adiciona um campo de idioma padrão
  inlineSearch: { type: String, required: false } // adiciona um novo campo para armazenar a pesquisa do usuário
});

module.exports = UserSchema;
