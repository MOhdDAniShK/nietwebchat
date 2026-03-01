const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    content: {
        type: String,
        default: '',
    },
    mediaType: {
        type: String,
        enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'GIF', 'STICKER', 'POLL'],
        default: 'TEXT',
    },
    mediaUrl: {
        type: String,
        default: '',
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
    },
    isEdited: {
        type: Boolean,
        default: false,
    },
    isDeletedForEveryone: {
        type: Boolean,
        default: false,
    },
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    // Emoji reactions
    reactions: [{
        emoji: String,
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        username: String,
    }],
    // Starred by users
    starredBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    // Forwarded
    isForwarded: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
