const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');

// Try to load nodemailer, but don't crash if email config is missing
let transporter = null;
try {
    const nodemailer = require('nodemailer');
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        console.log('Email transporter configured for:', process.env.EMAIL_USER);
    } else {
        console.log('⚠️  EMAIL_USER/EMAIL_PASS not set. Email features (OTP, password reset) will auto-verify.');
    }
} catch (e) {
    console.log('⚠️  Nodemailer not available. Email features disabled.');
}

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '30d' });
};

// Helper to send email (returns false if email not configured)
const sendEmail = async (to, subject, text) => {
    if (!transporter) return false;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
        return true;
    } catch (err) {
        console.error('Email send error:', err.message);
        return false;
    }
};

// @route POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        if (!email.endsWith('@niet.co.in')) {
            return res.status(400).json({ message: 'Must use a @niet.co.in email address' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        let assignedRole = 'USER';
        if (email.toLowerCase() === '0251cse274@niet.co.in') {
            assignedRole = 'OWNER';
        }

        const user = await User.create({ username, email, password, role: assignedRole });

        if (!user) {
            return res.status(400).json({ message: 'Invalid user data' });
        }

        // Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        user.otpCode = otp;
        user.otpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        // Try to send email
        const emailSent = await sendEmail(
            user.email,
            'Verify your NIET Chat App account',
            `Your OTP for registration is: ${otp}. It is valid for 10 minutes.`
        );

        if (emailSent) {
            res.status(201).json({
                message: 'OTP sent to your email. Please verify to complete registration.',
                email: user.email,
            });
        } else {
            // If email is not configured, auto-verify
            user.isVerified = true;
            user.otpCode = undefined;
            user.otpExpires = undefined;
            await user.save();
            res.status(201).json({
                message: 'Account created! (Email verification skipped — email service not configured)',
                autoVerified: true,
                _id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        }
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Username or email already taken' });
        }
        res.status(500).json({ message: error.message });
    }
});

// @route POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (user.isVerified) return res.status(400).json({ message: 'User already verified' });
        if (user.otpCode !== otp || user.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.isVerified = true;
        user.otpCode = undefined;
        user.otpExpires = undefined;
        await user.save();

        res.json({
            _id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            profilePic: user.profilePic,
            token: generateToken(user._id),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
            if (!user.isVerified && user.email !== '0251cse274@niet.co.in') {
                return res.status(403).json({ message: 'Please verify your email address before logging in.' });
            }
            if (user.bannedUntil && new Date() < new Date(user.bannedUntil)) {
                return res.status(403).json({ message: 'You are currently banned.' });
            }
            res.json({
                _id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                profilePic: user.profilePic,
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) return res.status(400).json({ message: 'Email is required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'No account found with this email' });

        const otp = crypto.randomInt(100000, 999999).toString();
        user.resetPasswordOtp = otp;
        user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000;
        await user.save();

        const emailSent = await sendEmail(
            user.email,
            'NIET Chat - Password Reset OTP',
            `Your password reset OTP is: ${otp}. It is valid for 10 minutes. If you didn't request this, please ignore.`
        );

        if (emailSent) {
            res.json({ message: 'Password reset OTP sent to your email.', email: user.email });
        } else {
            // For development: auto-log the OTP if email isn't configured
            console.log(`[DEV] Password reset OTP for ${email}: ${otp}`);
            res.json({ message: 'OTP generated (check server console in dev mode).', email: user.email, devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    try {
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: 'Email, OTP, and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.resetPasswordOtp !== otp || user.resetPasswordOtpExpires < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.password = newPassword; // Will be hashed by the pre-save hook
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpires = undefined;
        await user.save();

        res.json({ message: 'Password reset successful! You can now sign in with your new password.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @route GET /api/auth/users
router.get('/users', protect, async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Multer Config for profile pics
const profileStorage = multer.diskStorage({
    destination(req, file, cb) { cb(null, 'uploads/'); },
    filename(req, file, cb) { cb(null, `avatar-${req.user._id}-${Date.now()}${path.extname(file.originalname)}`); },
});
const profileUpload = multer({ storage: profileStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// @route PUT /api/auth/profile
router.put('/profile', protect, profileUpload.single('profilePic'), async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (req.body.username && req.body.username !== user.username) {
            // Check if new username is taken
            const existing = await User.findOne({ username: req.body.username });
            if (existing && existing._id.toString() !== user._id.toString()) {
                return res.status(400).json({ message: 'Username already taken' });
            }
            user.username = req.body.username;
        }

        if (req.file) {
            user.profilePic = `/uploads/${req.file.filename}`;
        }

        const updatedUser = await user.save();

        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            profilePic: updatedUser.profilePic,
            token: generateToken(updatedUser._id),
        });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ message: 'Username already taken' });
        } else {
            res.status(500).json({ message: error.message });
        }
    }
});

module.exports = router;
