const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    message: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
    },
    reason: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['PENDING', 'REVIEWED', 'DISMISSED'],
        default: 'PENDING',
    },
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
