const { Schema } = require("mongoose");

const UserSchema = new Schema({
    firstName: { type: String },
    userID: { type: Number, required: true },
    username: { type: String },
    city: { type: String, required: false },
    name: { type: String, required: false },
    lang: { type: String, default: "en" },
    inlineSearch: { type: String, required: false },
    is_dev: { type: Boolean, required: true, default: false },
    createdAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: null },
    referralSource: { type: String, default: null },
    searchCount: { type: Number, default: 0 },
});

module.exports = UserSchema;
