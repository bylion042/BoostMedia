const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetToken: { type: String }, // Token for password reset
    resetTokenExpiry: { type: Date }, // Expiry date for the token
    phoneNumber: { type: String, required: true, unique: true }, // Phone number is required
    accountBalance: { type: Number, default: 0 } // Added account balance, default is 0
});

module.exports = mongoose.model('User', UserSchema);
