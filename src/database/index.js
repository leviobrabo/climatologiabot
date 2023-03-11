const mongoose = require('mongoose')
const dotenv = require('dotenv')
const UserSchema = require('./models/users')

dotenv.config()

mongoose.connect(process.env.DB_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})

const UserModel = mongoose.model('User', UserSchema)

module.exports = { UserModel }
