const mongoose = require('mongoose')
const dotenv = require('dotenv')
const UserSchema = require('./models/users')
const ChatSchema = require("./models/groups");

dotenv.config()

mongoose.connect(process.env.DB_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})

const UserModel = mongoose.model('User', UserSchema)
const ChatModel = mongoose.model('Chat', ChatSchema)


module.exports = { UserModel, ChatModel  }
