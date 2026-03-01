const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/@niet\.co\.in$/, 'Please use a valid @niet.co.in email address'],
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['USER', 'MODERATOR', 'OWNER'],
    default: 'USER',
  },
  bannedUntil: {
    type: Date,
    default: null,
  },
  profilePic: {
    type: String,
    default: '',
  },
  otpCode: { type: String },
  otpExpires: { type: Date },
  isVerified: { type: Boolean, default: false },

  // Forgot password
  resetPasswordOtp: { type: String },
  resetPasswordOtpExpires: { type: Date },
}, { timestamps: true });

// Hash password before saving — ONLY when password is actually modified
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
