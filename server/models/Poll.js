const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
    },
    options: [{
        text: { type: String, required: true },
        votes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }],
    }],
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Optional: allow multiple votes
    allowMultiple: {
        type: Boolean,
        default: false,
    },
    // Message reference
    messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    },
}, { timestamps: true });

module.exports = mongoose.model('Poll', pollSchema);
