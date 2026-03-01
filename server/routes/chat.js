const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Message = require('../models/Message');
const User = require('../models/User');
const Report = require('../models/Report');
const Poll = require('../models/Poll');
const { protect, authorize } = require('../middleware/auth');

// Multer Config
const storage = multer.diskStorage({
    destination(req, file, cb) { cb(null, 'uploads/'); },
    filename(req, file, cb) { cb(null, `${Date.now()}-${file.originalname}`); },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Populate options reused everywhere
const REPLY_POPULATE = {
    path: 'replyTo',
    populate: { path: 'sender', select: 'username' },
    select: 'content sender mediaType mediaUrl'
};

// GET /api/chat - all messages
router.get('/', protect, async (req, res) => {
    try {
        const messages = await Message.find({ deletedFor: { $ne: req.user._id } })
            .populate('sender', 'username profilePic role')
            .populate(REPLY_POPULATE)
            .sort({ createdAt: 1 });

        const processed = messages.map(msg => {
            const m = msg.toObject();
            if (m.isDeletedForEveryone) {
                m.content = '🚫 This message was deleted';
                m.mediaUrl = '';
                m.mediaType = 'TEXT';
            }
            return m;
        });

        res.json(processed);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/chat - send message
router.post('/', protect, upload.single('media'), async (req, res) => {
    try {
        const { content, mediaType, replyTo, mediaUrl: directMediaUrl, isForwarded } = req.body;
        let mediaUrl = '';

        if (req.file) {
            mediaUrl = `/uploads/${req.file.filename}`;
        } else if (directMediaUrl) {
            mediaUrl = directMediaUrl;
        }

        const msgData = {
            sender: req.user._id,
            content: content || '',
            mediaType: mediaType || 'TEXT',
            mediaUrl,
            isForwarded: isForwarded === 'true' || isForwarded === true,
        };

        if (replyTo) msgData.replyTo = replyTo;

        const message = await Message.create(msgData);
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username profilePic role')
            .populate(REPLY_POPULATE);

        res.status(201).json(populatedMessage);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/chat/:id - edit message (2-min window)
router.put('/:id', protect, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });
        if (message.sender.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'You can only edit your own messages' });

        const timeDiff = (Date.now() - new Date(message.createdAt).getTime()) / 1000;
        if (timeDiff > 120) return res.status(403).json({ message: 'Edit window expired (2 minutes)' });
        if (message.isDeletedForEveryone) return res.status(400).json({ message: 'Cannot edit a deleted message' });

        message.content = req.body.content;
        message.isEdited = true;
        await message.save();

        const populated = await Message.findById(message._id)
            .populate('sender', 'username profilePic role')
            .populate(REPLY_POPULATE);

        res.json(populated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/chat/:id - delete for everyone
router.delete('/:id', protect, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        const isSender = message.sender.toString() === req.user._id.toString();
        const isMod = req.user.role === 'MODERATOR' || req.user.role === 'OWNER';
        if (!isSender && !isMod) return res.status(403).json({ message: 'Not authorized' });

        message.isDeletedForEveryone = true;
        message.content = '';
        message.mediaUrl = '';
        await message.save();

        res.json({ message: 'Message deleted for everyone', id: req.params.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/chat/:id/delete-for-me
router.post('/:id/delete-for-me', protect, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        if (!message.deletedFor.includes(req.user._id)) {
            message.deletedFor.push(req.user._id);
            await message.save();
        }
        res.json({ message: 'Message deleted for you', id: req.params.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/chat/:id/react - add/remove reaction
router.post('/:id/react', protect, async (req, res) => {
    try {
        const { emoji } = req.body;
        if (!emoji) return res.status(400).json({ message: 'Emoji required' });

        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        // Check if user already has this reaction
        const existing = message.reactions.findIndex(
            r => r.user.toString() === req.user._id.toString() && r.emoji === emoji
        );

        if (existing > -1) {
            // Remove reaction (toggle off)
            message.reactions.splice(existing, 1);
        } else {
            // Remove any other reaction from this user first, then add new
            message.reactions = message.reactions.filter(
                r => r.user.toString() !== req.user._id.toString()
            );
            message.reactions.push({ emoji, user: req.user._id, username: req.user.username });
        }

        await message.save();

        const populated = await Message.findById(message._id)
            .populate('sender', 'username profilePic role')
            .populate(REPLY_POPULATE);

        res.json(populated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/chat/:id/star - star/unstar message
router.post('/:id/star', protect, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Message not found' });

        const idx = message.starredBy.indexOf(req.user._id);
        if (idx > -1) {
            message.starredBy.splice(idx, 1);
        } else {
            message.starredBy.push(req.user._id);
        }
        await message.save();

        res.json({ starred: idx === -1, id: req.params.id });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/chat/starred - get starred messages
router.get('/starred', protect, async (req, res) => {
    try {
        const messages = await Message.find({ starredBy: req.user._id, isDeletedForEveryone: { $ne: true } })
            .populate('sender', 'username profilePic role')
            .populate(REPLY_POPULATE)
            .sort({ createdAt: -1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// BAN
router.post('/ban/:userId', protect, authorize('MODERATOR', 'OWNER'), async (req, res) => {
    try {
        const { hours, permanent } = req.body;
        const userToBan = await User.findById(req.params.userId);
        if (!userToBan) return res.status(404).json({ message: 'User not found' });
        if (userToBan.role === 'OWNER') return res.status(403).json({ message: 'Cannot ban the owner' });

        if (req.user.role === 'MODERATOR') {
            if (userToBan.role === 'MODERATOR') return res.status(403).json({ message: 'Moderators cannot ban other moderators' });
            const banHours = Math.min(hours || 10, 24);
            userToBan.bannedUntil = new Date(Date.now() + banHours * 3600000);
            await userToBan.save();
            return res.json({ message: `User banned for ${banHours} hours` });
        }

        if (permanent) {
            userToBan.bannedUntil = new Date(Date.now() + 100 * 365 * 24 * 3600000);
        } else {
            userToBan.bannedUntil = new Date(Date.now() + (hours || 10) * 3600000);
        }
        await userToBan.save();
        res.json({ message: permanent ? 'User banned permanently' : `User banned for ${hours || 10} hours` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UNBAN
router.post('/unban/:userId', protect, authorize('OWNER'), async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.bannedUntil = null;
        await user.save();
        res.json({ message: 'User unbanned' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Role change
router.put('/role/:userId', protect, authorize('OWNER'), async (req, res) => {
    try {
        const { role } = req.body;
        if (!['USER', 'MODERATOR'].includes(role)) return res.status(400).json({ message: 'Invalid role' });

        const userToUpdate = await User.findById(req.params.userId);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });
        if (userToUpdate.role === 'OWNER') return res.status(403).json({ message: "Cannot change owner's role" });

        userToUpdate.role = role;
        await userToUpdate.save();
        res.json({ message: `User role updated to ${role}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Report
router.post('/report', protect, async (req, res) => {
    try {
        const { reportedUserId, messageId, reason } = req.body;
        if (!reportedUserId || !reason) return res.status(400).json({ message: 'Reported user and reason required' });
        if (reportedUserId === req.user._id.toString()) return res.status(400).json({ message: 'Cannot report yourself' });

        const report = await Report.create({ reporter: req.user._id, reportedUser: reportedUserId, message: messageId || null, reason });
        res.status(201).json({ message: 'Report submitted', report });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get reports
router.get('/reports', protect, authorize('MODERATOR', 'OWNER'), async (req, res) => {
    try {
        const reports = await Report.find()
            .populate('reporter', 'username email')
            .populate('reportedUser', 'username email role')
            .populate('message', 'content mediaType')
            .sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update report
router.put('/reports/:id', protect, authorize('MODERATOR', 'OWNER'), async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'Report not found' });
        report.status = req.body.status || 'REVIEWED';
        await report.save();
        res.json({ message: 'Report updated', report });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ===== POLLS =====

// POST /api/chat/poll - create a poll
router.post('/poll', protect, async (req, res) => {
    try {
        const { question, options, allowMultiple } = req.body;
        if (!question || !options || options.length < 2) {
            return res.status(400).json({ message: 'Question and at least 2 options required' });
        }
        if (options.length > 12) {
            return res.status(400).json({ message: 'Maximum 12 options allowed' });
        }

        const poll = await Poll.create({
            question,
            options: options.map(o => ({ text: o, votes: [] })),
            creator: req.user._id,
            allowMultiple: allowMultiple || false,
        });

        // Create a message that references this poll
        const message = await Message.create({
            sender: req.user._id,
            content: question,
            mediaType: 'POLL',
            mediaUrl: poll._id.toString(),
        });

        poll.messageId = message._id;
        await poll.save();

        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username profilePic role');

        res.status(201).json({ message: populatedMessage, poll });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/chat/poll/:id/vote
router.post('/poll/:id/vote', protect, async (req, res) => {
    try {
        const { optionIndex } = req.body;
        const poll = await Poll.findById(req.params.id);
        if (!poll) return res.status(404).json({ message: 'Poll not found' });

        if (optionIndex < 0 || optionIndex >= poll.options.length) {
            return res.status(400).json({ message: 'Invalid option' });
        }

        if (!poll.allowMultiple) {
            // Remove user's vote from all options first
            poll.options.forEach(opt => {
                opt.votes = opt.votes.filter(v => v.toString() !== req.user._id.toString());
            });
        }

        // Toggle vote on selected option
        const option = poll.options[optionIndex];
        const existingIdx = option.votes.findIndex(v => v.toString() === req.user._id.toString());
        if (existingIdx > -1) {
            option.votes.splice(existingIdx, 1);
        } else {
            option.votes.push(req.user._id);
        }

        await poll.save();
        res.json(poll);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/chat/poll/:id
router.get('/poll/:id', protect, async (req, res) => {
    try {
        const poll = await Poll.findById(req.params.id)
            .populate('creator', 'username');
        if (!poll) return res.status(404).json({ message: 'Poll not found' });
        res.json(poll);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
