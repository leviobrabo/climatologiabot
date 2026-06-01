const mongoose = require("mongoose");
const dotenv = require("dotenv");
const UserSchema = require("./models/users");
const ChatSchema = require("./models/groups");

dotenv.config();

mongoose.connect(process.env.DB_STRING).catch(err => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
});

mongoose.connection.on("connected", () => console.log("MongoDB connected"));
mongoose.connection.on("error", err => console.error("MongoDB error:", err.message));

const UserModel = mongoose.model("User", UserSchema);
const ChatModel = mongoose.model("Chat", ChatSchema);

module.exports = { UserModel, ChatModel };
