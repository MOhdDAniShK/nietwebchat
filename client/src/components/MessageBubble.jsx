import React, { useContext, useState, useRef, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { MoreVertical, Copy, Trash, File, Edit3, Reply, Flag, Clock, Ban, Check, Star, Smile } from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:5001' : '';
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const MessageBubble = ({ message, onDelete, onEdit, onReply, onDeleteForMe, onReact, onStar, onScrollToMessage, pollsCache, onVotePoll, fetchPoll }) => {
    const { user } = useContext(AuthContext);
    const [showMenu, setShowMenu] = useState(false);
    const [showBanOptions, setShowBanOptions] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [editContent, setEditContent] = useState(message.content);
    const [copied, setCopied] = useState(false);
    const [showEmojiQuick, setShowEmojiQuick] = useState(false);
    const menuRef = useRef(null);

    const isOwn = user._id === message.sender._id;
    const canDelete = user.role === 'OWNER' || user.role === 'MODERATOR' || isOwn;
    const canBan = (user.role === 'OWNER' || user.role === 'MODERATOR') && !isOwn && message.sender.role !== 'OWNER' && !(user.role === 'MODERATOR' && message.sender.role === 'MODERATOR');
    const canEdit = isOwn && !message.isDeletedForEveryone;

    const timeSinceSent = (Date.now() - new Date(message.createdAt).getTime()) / 1000;
    const editWindowOpen = timeSinceSent <= 120;
    const editTimeLeft = Math.max(0, Math.ceil((120 - timeSinceSent) / 60));
    const isStarred = message.starredBy?.includes(user._id);

    const reactionGroups = {};
    (message.reactions || []).forEach(r => {
        if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { count: 0, users: [], hasOwn: false };
        reactionGroups[r.emoji].count++;
        reactionGroups[r.emoji].users.push(r.username);
        if (r.user === user._id) reactionGroups[r.emoji].hasOwn = true;
    });

    // Fetch poll data if needed
    const isPoll = message.mediaType === 'POLL' && message.mediaUrl;
    const pollData = isPoll ? pollsCache?.[message.mediaUrl] : null;

    useEffect(() => {
        if (isPoll && !pollData && fetchPoll) {
            fetchPoll(message.mediaUrl);
        }
    }, [isPoll, pollData, message.mediaUrl, fetchPoll]);

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowMenu(false);
                setShowBanOptions(false);
                setShowEmojiQuick(false);
            }
        };
        if (showMenu || showEmojiQuick) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu, showEmojiQuick]);

    const handleCopy = () => {
        navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => { setCopied(false); setShowMenu(false); }, 600);
    };

    const handleEdit = async () => {
        if (!editContent.trim()) return;
        try { await onEdit(message._id, editContent); setEditMode(false); } catch {}
    };

    const handleBan = async (hours, permanent = false) => {
        const label = permanent ? 'permanently' : `for ${hours}h`;
        if (!window.confirm(`Ban ${message.sender.username} ${label}?`)) return;
        try {
            await axios.post(`${API_URL}/api/chat/ban/${message.sender._id}`, { hours, permanent }, {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            setShowBanOptions(false); setShowMenu(false);
        } catch {}
    };

    const handleReport = async () => {
        if (!reportReason.trim()) return;
        try {
            await axios.post(`${API_URL}/api/chat/report`, {
                reportedUserId: message.sender._id, messageId: message._id, reason: reportReason,
            }, { headers: { Authorization: `Bearer ${user.token}` } });
            setShowReportModal(false); setReportReason(''); setShowMenu(false);
        } catch {}
    };

    const handleReplyClick = () => {
        if (message.replyTo?._id && onScrollToMessage) onScrollToMessage(message.replyTo._id);
    };

    const renderMedia = () => {
        if (!message.mediaUrl || isPoll) return null;
        const isExternal = message.mediaUrl.startsWith('http');
        const fileUrl = isExternal ? message.mediaUrl : `${API_URL}${message.mediaUrl}`;

        switch (message.mediaType) {
            case 'IMAGE': return <div className="media-preview"><img src={fileUrl} alt="" loading="lazy" /></div>;
            case 'VIDEO': return <div className="media-preview"><video src={fileUrl} controls preload="metadata" /></div>;
            case 'GIF': return <div className="media-preview"><img src={fileUrl} alt="gif" loading="lazy" /></div>;
            case 'STICKER': return <img src={fileUrl} alt="sticker" style={{ width: 130, height: 130, objectFit: 'contain' }} />;
            case 'DOCUMENT':
                return (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 6, padding: '8px 14px', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--r)', color: 'var(--accent-color)', fontSize: 13, fontWeight: 500 }}>
                        <File size={16} /> Download
                    </a>
                );
            default: return null;
        }
    };

    // Poll rendering
    const renderPoll = () => {
        if (!isPoll) return null;
        if (!pollData) return <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>Loading poll...</div>;

        const totalVotes = pollData.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
        return (
            <div className="poll-card">
                <div className="poll-question">📊 {pollData.question}</div>
                <div className="poll-options">
                    {pollData.options.map((opt, i) => {
                        const voteCount = opt.votes?.length || 0;
                        const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                        const myVote = opt.votes?.some(v => v === user._id || v.toString?.() === user._id);
                        return (
                            <button key={i} className={`poll-option ${myVote ? 'voted' : ''}`}
                                onClick={() => onVotePoll?.(message.mediaUrl, i)}>
                                <div className="poll-option-bar" style={{ width: `${pct}%` }} />
                                <span className="poll-option-text">{opt.text}</span>
                                <span className="poll-option-pct">{pct}%</span>
                            </button>
                        );
                    })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</div>
            </div>
        );
    };

    const renderReplyPreview = () => {
        if (!message.replyTo) return null;
        const rt = message.replyTo;
        const hasMedia = rt.mediaUrl && ['IMAGE', 'VIDEO', 'GIF', 'STICKER'].includes(rt.mediaType);
        const isExt = rt.mediaUrl?.startsWith('http');
        const thumbUrl = hasMedia ? (isExt ? rt.mediaUrl : `${API_URL}${rt.mediaUrl}`) : null;

        return (
            <div className="reply-preview" onClick={handleReplyClick}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--accent-color)', fontSize: 11, marginBottom: 1 }}>↩ {rt.sender?.username || 'Unknown'}</div>
                        <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, maxWidth: 200 }}>
                            {rt.content || `📎 ${rt.mediaType}`}
                        </div>
                    </div>
                    {thumbUrl && <img src={thumbUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                </div>
            </div>
        );
    };

    if (message.isDeletedForEveryone) {
        return (
            <div className={`message ${isOwn ? 'own-message' : ''}`} data-msgid={message._id} style={{ opacity: 0.4 }}>
                <div className="message-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{message.sender.username.charAt(0)}</div>
                <div className="message-content">
                    <div className="message-bubble" style={{ fontStyle: 'italic', fontSize: 13, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>🚫 This message was deleted</div>
                </div>
            </div>
        );
    }

    const avatarUrl = message.sender.profilePic ? `${API_URL}${message.sender.profilePic}` : null;

    return (
        <>
            <div className={`message ${isOwn ? 'own-message' : ''}`} data-msgid={message._id}>
                <div className="message-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                    {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : message.sender.username.charAt(0)}
                </div>
                <div className="message-content">
                    <div className="message-header">
                        <span className="message-author">{message.sender.username}</span>
                        <span className="message-time">{format(new Date(message.createdAt), 'h:mm a')}</span>
                        {message.isEdited && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>edited</span>}
                        {isStarred && <span className="starred-icon">⭐</span>}
                        {message.sender.role !== 'USER' && (
                            <span className={`message-role ${message.sender.role.toLowerCase()}`}>{message.sender.role}</span>
                        )}
                    </div>

                    {renderReplyPreview()}

                    {editMode ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input value={editContent} onChange={e => setEditContent(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleEdit(); if (e.key === 'Escape') setEditMode(false); }}
                                autoFocus style={{ flex: 1, minWidth: 100, padding: '9px 14px', borderRadius: 'var(--r)', border: '1.5px solid var(--accent-color)', background: 'var(--input-bg)' }} />
                            <button onClick={handleEdit} style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '8px 16px', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600 }}>Save</button>
                            <button onClick={() => setEditMode(false)} style={{ padding: '8px 14px', borderRadius: 'var(--r)', fontSize: 12, border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Esc</button>
                        </div>
                    ) : (
                        <>
                            <div className="message-bubble">
                                {message.content && !isPoll && <div className="message-text">{message.content}</div>}
                                {renderMedia()}
                            </div>
                            {renderPoll()}
                        </>
                    )}

                    {Object.keys(reactionGroups).length > 0 && (
                        <div className="reactions-row">
                            {Object.entries(reactionGroups).map(([emoji, data]) => (
                                <span key={emoji} className={`reaction-chip ${data.hasOwn ? 'own' : ''}`}
                                    onClick={() => onReact?.(message._id, emoji)}
                                    title={data.users.join(', ')}>
                                    {emoji} <span className="count">{data.count}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="message-options" ref={menuRef}>
                    <button onClick={() => setShowEmojiQuick(!showEmojiQuick)}><Smile size={14} /></button>
                    <button onClick={() => setShowMenu(!showMenu)}><MoreVertical size={14} /></button>

                    {showEmojiQuick && (
                        <div className="emoji-quick" style={{ position: 'absolute', right: 0, top: -42 }}>
                            {QUICK_EMOJIS.map(e => (
                                <button key={e} onClick={() => { onReact?.(message._id, e); setShowEmojiQuick(false); }}>{e}</button>
                            ))}
                        </div>
                    )}

                    {showMenu && (
                        <div className="context-menu" style={{ position: 'absolute', right: 0, top: 34, zIndex: 20 }}>
                            <button onClick={() => { onReply(message); setShowMenu(false); }}><Reply size={14} /> Reply</button>
                            {message.content && (
                                <button onClick={handleCopy}>
                                    {copied ? <><Check size={14} color="var(--success)" /> Copied!</> : <><Copy size={14} /> Copy text</>}
                                </button>
                            )}
                            <button onClick={() => { onStar?.(message._id); setShowMenu(false); }}>
                                <Star size={14} fill={isStarred ? '#f59e0b' : 'none'} color={isStarred ? '#f59e0b' : 'currentColor'} />
                                {isStarred ? 'Unstar' : 'Star'}
                            </button>

                            {canEdit && editWindowOpen && message.content && (
                                <button onClick={() => { setEditContent(message.content); setEditMode(true); setShowMenu(false); }}>
                                    <Edit3 size={14} /> Edit <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{editTimeLeft}m</span>
                                </button>
                            )}

                            <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 6px' }} />

                            <button onClick={() => { onDeleteForMe(message._id); setShowMenu(false); }}>
                                <Trash size={14} /> Delete for me
                            </button>
                            {canDelete && (
                                <button onClick={() => { onDelete(message._id); setShowMenu(false); }} style={{ color: 'var(--danger)' }}>
                                    <Trash size={14} color="var(--danger)" /> Delete for everyone
                                </button>
                            )}

                            {!isOwn && (
                                <>
                                    <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 6px' }} />
                                    <button onClick={() => { setShowReportModal(true); setShowMenu(false); }} style={{ color: 'var(--warning)' }}>
                                        <Flag size={14} color="var(--warning)" /> Report
                                    </button>
                                </>
                            )}

                            {canBan && (
                                <div style={{ position: 'relative' }}>
                                    <button onClick={() => setShowBanOptions(!showBanOptions)} style={{ color: 'var(--danger)' }}>
                                        <Ban size={14} color="var(--danger)" /> Ban <span style={{ marginLeft: 'auto', fontSize: 10 }}>▸</span>
                                    </button>
                                    {showBanOptions && (
                                        <div className="context-menu" style={{ position: 'absolute', left: '100%', top: -4, zIndex: 30, minWidth: 120 }}>
                                            <button onClick={() => handleBan(10)}><Clock size={12} /> 10 Hours</button>
                                            <button onClick={() => handleBan(24)}><Clock size={12} /> 1 Day</button>
                                            {user.role === 'OWNER' && (
                                                <>
                                                    <button onClick={() => handleBan(360)}><Clock size={12} /> 15 Days</button>
                                                    <div style={{ height: 1, background: 'var(--border-color)', margin: '2px 6px' }} />
                                                    <button onClick={() => handleBan(0, true)} style={{ color: 'var(--danger)' }}>
                                                        <Ban size={12} color="var(--danger)" /> Lifetime
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showReportModal && (
                <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setShowReportModal(false); }}>
                    <div className="modal-content" style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Flag size={18} color="var(--warning)" /> Report {message.sender.username}
                            </h3>
                            <button onClick={() => setShowReportModal(false)} style={{ padding: 4 }}>✕</button>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>This will be sent to staff for review.</p>
                        <textarea value={reportReason} onChange={e => setReportReason(e.target.value)}
                            placeholder="Describe the issue..." rows={3}
                            style={{ width: '100%', padding: 12, borderRadius: 'var(--r)', resize: 'vertical', fontSize: 14, marginBottom: 16 }} />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowReportModal(false)} style={{ padding: '9px 20px', borderRadius: 'var(--r-full)', border: '1px solid var(--border-color)', fontSize: 13 }}>Cancel</button>
                            <button onClick={handleReport} disabled={!reportReason.trim()}
                                style={{ padding: '9px 20px', borderRadius: 'var(--r-full)', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 600, opacity: reportReason.trim() ? 1 : 0.5 }}>Submit</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default MessageBubble;
