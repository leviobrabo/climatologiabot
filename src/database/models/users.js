const { Schema } = require('mongoose');

const UserSchema = new Schema({
  firstName: { type: String },
  userID: { type: Number, required: true },
  username: { type: String },
  city: { type: String, required: false },
  name: { type: String, required: false }
});

module.exports = UserSchema;
