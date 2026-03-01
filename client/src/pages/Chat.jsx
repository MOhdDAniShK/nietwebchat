import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import io from 'socket.io-client';
import axios from 'axios';
import EmojiPicker from 'emoji-picker-react';
import MessageBubble from '../components/MessageBubble';
import ProfileWidget from '../components/ProfileWidget';
import { Send, Paperclip, Image as ImageIcon, FileText, Video as VideoIcon, X, Menu, MessageCircle, Smile, Search, Inbox, ChevronDown, Users, Star, BarChart3, Plus, Trash2 } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:5001' : '';
const SOCKET_SERVER_URL = IS_LOCAL ? 'http://localhost:5001' : window.location.origin;
const GIPHY_API_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';

const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const addToast = (text, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };
  return { toasts, addToast };
};

const getDateLabel = (dateStr) => {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
};

const Chat = () => {
  const { user } = useContext(AuthContext);
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [replyTo, setReplyTo] = useState(null);

  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);

  const [memberSearch, setMemberSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // GIF & Sticker
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState([]);
  const [trendingGifs, setTrendingGifs] = useState([]);
  const [stickerSearch, setStickerSearch] = useState('');
  const [stickers, setStickers] = useState([]);
  const [trendingStickers, setTrendingStickers] = useState([]);
  const [savedStickers, setSavedStickers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedStickers') || '[]'); } catch { return []; }
  });

  // Starred
  const [showStarred, setShowStarred] = useState(false);
  const [starredMessages, setStarredMessages] = useState([]);

  // Reports
  const [showReports, setShowReports] = useState(false);
  const [reports, setReports] = useState([]);

  // Poll
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

  // Polls data cache
  const [pollsCache, setPollsCache] = useState({});

  const { toasts, addToast } = useToast();
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const config = { headers: { Authorization: `Bearer ${user.token}` } };
        const [msgRes, usersRes] = await Promise.all([
          axios.get(`${API_URL}/api/chat`, config),
          axios.get(`${API_URL}/api/auth/users`, config)
        ]);
        setMessages(msgRes.data);
        setUsers(usersRes.data);
        setConnectionError('');
        scrollToBottom();
      } catch {
        setConnectionError('Unable to connect to server.');
      }
    };
    fetchData();

    const newSocket = io(SOCKET_SERVER_URL, { reconnectionAttempts: 5, reconnectionDelay: 2000 });
    setSocket(newSocket);
    newSocket.emit('join', user._id);

    newSocket.on('receiveMessage', (message) => {
      setMessages(prev => [...prev, message]);
      scrollToBottom();
    });
    newSocket.on('messageDeleted', (id) => setMessages(prev => prev.filter(msg => msg._id !== id)));
    newSocket.on('messageDeletedForEveryone', (id) => {
      setMessages(prev => prev.map(msg =>
        msg._id === id ? { ...msg, isDeletedForEveryone: true, content: '🚫 This message was deleted', mediaUrl: '', mediaType: 'TEXT' } : msg
      ));
    });
    newSocket.on('messageEdited', (updated) => setMessages(prev => prev.map(msg => msg._id === updated._id ? updated : msg)));
    newSocket.on('messageReactionUpdate', (updated) => setMessages(prev => prev.map(msg => msg._id === updated._id ? updated : msg)));
    newSocket.on('pollVoteUpdate', ({ pollId, poll }) => {
      setPollsCache(prev => ({ ...prev, [pollId]: poll }));
    });

    newSocket.on('userTyping', ({ userId, username }) => {
      if (userId !== user._id) setTypingUsers(prev => prev.find(u => u.userId === userId) ? prev : [...prev, { userId, username }]);
    });
    newSocket.on('userStopTyping', ({ userId }) => setTypingUsers(prev => prev.filter(u => u.userId !== userId)));
    newSocket.on('connect_error', () => setConnectionError('Connection lost. Reconnecting...'));
    newSocket.on('connect', () => setConnectionError(''));

    return () => newSocket.close();
  }, [user]);

  // Trending
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const [g, s] = await Promise.all([
          axios.get(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`),
          axios.get(`https://api.giphy.com/v1/stickers/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`)
        ]);
        setTrendingGifs(g.data.data);
        setTrendingStickers(s.data.data);
      } catch {}
    };
    fetchTrending();
  }, []);

  const scrollToBottom = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 200);
  };

  const scrollToMessage = useCallback((messageId) => {
    const el = chatContainerRef.current?.querySelector(`[data-msgid="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlighted');
      setTimeout(() => el.classList.remove('highlighted'), 2000);
    }
  }, []);

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    if (!isTyping && socket) {
      setIsTyping(true);
      socket.emit('typing', { userId: user._id, username: user.username });
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (socket) socket.emit('stopTyping', { userId: user._id });
    }, 1500);
  };

  const onEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  // GIF/Sticker search
  const searchGifs = useCallback(async (query) => {
    if (!query.trim()) { setGifs([]); return; }
    try {
      const { data } = await axios.get(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`);
      setGifs(data.data);
    } catch {}
  }, []);

  const searchStickers = useCallback(async (query) => {
    if (!query.trim()) { setStickers([]); return; }
    try {
      const { data } = await axios.get(`https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`);
      setStickers(data.data);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (gifSearch) searchGifs(gifSearch); }, 400);
    return () => clearTimeout(t);
  }, [gifSearch, searchGifs]);

  useEffect(() => {
    const t = setTimeout(() => { if (stickerSearch) searchStickers(stickerSearch); }, 400);
    return () => clearTimeout(t);
  }, [stickerSearch, searchStickers]);

  const sendGifOrSticker = async (url, type) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const body = { mediaUrl: url, mediaType: type, content: '', replyTo: replyTo?._id || null };
      const { data } = await axios.post(`${API_URL}/api/chat`, body, config);
      socket.emit('sendMessage', data);
      setShowGifPicker(false); setShowStickerPicker(false); setReplyTo(null);
      addToast(`${type === 'GIF' ? 'GIF' : 'Sticker'} sent!`, 'success');
    } catch { addToast('Failed to send', 'error'); }
  };

  const saveSticker = (url) => {
    if (savedStickers.includes(url)) return;
    const updated = [...savedStickers, url];
    setSavedStickers(updated);
    localStorage.setItem('savedStickers', JSON.stringify(updated));
    addToast('Sticker saved! ❤️', 'success');
  };

  const removeSavedSticker = (url) => {
    const updated = savedStickers.filter(s => s !== url);
    setSavedStickers(updated);
    localStorage.setItem('savedStickers', JSON.stringify(updated));
  };

  // Reactions
  const handleReact = async (messageId, emoji) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.post(`${API_URL}/api/chat/${messageId}/react`, { emoji }, config);
      socket.emit('reactionUpdate', data);
      setMessages(prev => prev.map(msg => msg._id === messageId ? data : msg));
    } catch { addToast('Reaction failed', 'error'); }
  };

  // Star
  const handleStar = async (messageId) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.post(`${API_URL}/api/chat/${messageId}/star`, {}, config);
      setMessages(prev => prev.map(msg => {
        if (msg._id !== messageId) return msg;
        const starredBy = msg.starredBy || [];
        if (data.starred) return { ...msg, starredBy: [...starredBy, user._id] };
        return { ...msg, starredBy: starredBy.filter(id => id !== user._id) };
      }));
      addToast(data.starred ? '⭐ Message starred' : 'Star removed', 'info');
    } catch { addToast('Star failed', 'error'); }
  };

  const fetchStarred = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.get(`${API_URL}/api/chat/starred`, config);
      setStarredMessages(data);
    } catch {}
  };

  // Poll
  const handleCreatePoll = async () => {
    const validOptions = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim()) { addToast('Enter a question', 'error'); return; }
    if (validOptions.length < 2) { addToast('At least 2 options required', 'error'); return; }

    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.post(`${API_URL}/api/chat/poll`, {
        question: pollQuestion, options: validOptions, allowMultiple: pollAllowMultiple
      }, config);

      setPollsCache(prev => ({ ...prev, [data.poll._id]: data.poll }));
      socket.emit('sendMessage', data.message);
      setShowPollCreator(false);
      setPollQuestion(''); setPollOptions(['', '']); setPollAllowMultiple(false);
      addToast('📊 Poll created!', 'success');
    } catch (err) {
      addToast(err.response?.data?.message || 'Poll creation failed', 'error');
    }
  };

  const handleVotePoll = async (pollId, optionIndex) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.post(`${API_URL}/api/chat/poll/${pollId}/vote`, { optionIndex }, config);
      setPollsCache(prev => ({ ...prev, [pollId]: data }));
      socket.emit('pollVoteUpdate', { pollId, poll: data });
    } catch { addToast('Vote failed', 'error'); }
  };

  const fetchPoll = async (pollId) => {
    if (pollsCache[pollId]) return;
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.get(`${API_URL}/api/chat/poll/${pollId}`, config);
      setPollsCache(prev => ({ ...prev, [pollId]: data }));
    } catch {}
  };

  // Send message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !uploadFile) return;

    setIsTyping(false);
    if (socket) socket.emit('stopTyping', { userId: user._id });

    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const formData = new FormData();
      formData.append('content', newMessage);
      if (replyTo) formData.append('replyTo', replyTo._id);

      if (uploadFile) {
        formData.append('media', uploadFile);
        if (uploadFile.type.startsWith('image/')) formData.append('mediaType', 'IMAGE');
        else if (uploadFile.type.startsWith('video/')) formData.append('mediaType', 'VIDEO');
        else formData.append('mediaType', 'DOCUMENT');
      } else { formData.append('mediaType', 'TEXT'); }

      const { data } = await axios.post(`${API_URL}/api/chat`, formData, config);
      socket.emit('sendMessage', data);
      setNewMessage(''); setUploadFile(null); setShowAttachMenu(false); setReplyTo(null);
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to send', 'error');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      await axios.delete(`${API_URL}/api/chat/${messageId}`, config);
      socket.emit('deleteForEveryone', messageId);
      setMessages(prev => prev.map(msg =>
        msg._id === messageId ? { ...msg, isDeletedForEveryone: true, content: '🚫 This message was deleted', mediaUrl: '', mediaType: 'TEXT' } : msg
      ));
      addToast('Deleted for everyone', 'info');
    } catch (err) { addToast(err.response?.data?.message || 'Delete failed', 'error'); }
  };

  const handleDeleteForMe = async (messageId) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      await axios.post(`${API_URL}/api/chat/${messageId}/delete-for-me`, {}, config);
      setMessages(prev => prev.filter(msg => msg._id !== messageId));
      addToast('Deleted for you', 'info');
    } catch (err) { addToast(err.response?.data?.message || 'Delete failed', 'error'); }
  };

  const handleEditMessage = async (messageId, content) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.put(`${API_URL}/api/chat/${messageId}`, { content }, config);
      socket.emit('editMessage', data);
      setMessages(prev => prev.map(msg => msg._id === messageId ? data : msg));
      addToast('Message edited ✏️', 'success');
    } catch (err) { throw err.response?.data?.message || 'Edit failed'; }
  };

  const handlePromoteUser = async (userId, role) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      await axios.put(`${API_URL}/api/chat/role/${userId}`, { role }, config);
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, role } : u));
      addToast(`User ${role === 'MODERATOR' ? 'promoted' : 'demoted'}`, 'success');
    } catch (err) { addToast(err.response?.data?.message || 'Role change failed', 'error'); }
  };

  const handleFileClick = () => fileInputRef.current?.click();
  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      if (e.target.files[0].size > 10 * 1024 * 1024) { addToast('File must be under 10MB', 'error'); return; }
      setUploadFile(e.target.files[0]); setShowAttachMenu(false);
    }
  };

  const fetchReports = async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.get(`${API_URL}/api/chat/reports`, config);
      setReports(data);
    } catch {}
  };

  const updateReportStatus = async (reportId, status) => {
    try {
      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      await axios.put(`${API_URL}/api/chat/reports/${reportId}`, { status }, config);
      setReports(prev => prev.map(r => r._id === reportId ? { ...r, status } : r));
      addToast(`Report ${status.toLowerCase()}`, 'success');
    } catch { addToast('Failed to update report', 'error'); }
  };

  const closeAllPickers = () => { setShowGifPicker(false); setShowStickerPicker(false); setShowEmojiPicker(false); setShowPollCreator(false); };

  const filteredUsers = memberSearch ? users.filter(u => u.username.toLowerCase().includes(memberSearch.toLowerCase())) : users;
  const filteredMessages = messageSearch ? messages.filter(m => m.content?.toLowerCase().includes(messageSearch.toLowerCase())) : messages;

  const renderMessages = () => {
    const list = filteredMessages;
    const elements = [];
    let lastDate = null;

    list.forEach((msg, i) => {
      const d = getDateLabel(msg.createdAt);
      if (d !== lastDate) {
        lastDate = d;
        elements.push(<div key={`date-${d}-${i}`} className="date-separator"><span>{d}</span></div>);
      }
      elements.push(
        <MessageBubble key={msg._id} message={msg}
          onDelete={handleDeleteMessage} onDeleteForMe={handleDeleteForMe}
          onEdit={handleEditMessage}
          onReply={(m) => { setReplyTo(m); inputRef.current?.focus(); }}
          onReact={handleReact}
          onStar={handleStar}
          onScrollToMessage={scrollToMessage}
          pollsCache={pollsCache}
          onVotePoll={handleVotePoll}
          fetchPoll={fetchPoll}
        />
      );
    });
    return elements;
  };

  return (
    <div className="app-container">
      {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}

      {/* SIDEBAR */}
      <div className={`sidebar ${showSidebar ? 'show' : ''}`}>
        <div className="sidebar-header">
          <span>💬 NIET Chat</span>
          <button className="mobile-menu-btn" onClick={() => setShowSidebar(false)} style={{ color: '#fff', margin: 0, display: showSidebar ? 'flex' : 'none' }}>
            <X size={20} />
          </button>
        </div>

        <div className="search-bar">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members..." />
          </div>
        </div>

        <div style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={12} /> Members · {users.length}
            </div>
            <button onClick={() => { fetchStarred(); setShowStarred(true); }} title="Starred messages" style={{ padding: 4 }}>
              <Star size={14} color="var(--text-muted)" />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filteredUsers.map(u => (
              <div key={u._id} className="user-item" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r)', cursor: 'pointer' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div className="message-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
                    {u.profilePic ? <img src={`${API_URL}${u.profilePic}`} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : u.username.charAt(0)}
                  </div>
                  <div className="online-dot" />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {u.role === 'OWNER' ? 'Owner 👑' : u.role === 'MODERATOR' ? 'Mod 🛡️' : 'Member'}
                  </div>
                </div>
                {user.role === 'OWNER' && u.role !== 'OWNER' && (
                  <button onClick={() => handlePromoteUser(u._id, u.role === 'MODERATOR' ? 'USER' : 'MODERATOR')}
                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 'var(--r-full)', background: u.role === 'MODERATOR' ? 'rgba(239,68,68,0.08)' : 'rgba(124,58,237,0.08)', color: u.role === 'MODERATOR' ? 'var(--danger)' : 'var(--accent-color)', fontWeight: 600 }}
                    title={u.role === 'MODERATOR' ? 'Demote' : 'Promote'}>
                    {u.role === 'MODERATOR' ? 'Demote' : 'Promote'}
                  </button>
                )}
              </div>
            ))}
            {filteredUsers.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No members found</div>}
          </div>
        </div>

        <ProfileWidget onOpenReports={() => { fetchReports(); setShowReports(true); }} />
      </div>

      {/* MAIN CHAT */}
      <div className="main-chat">
        <div className="chat-header">
          <button className="mobile-menu-btn" onClick={() => setShowSidebar(true)}><Menu size={22} /></button>
          <MessageCircle size={20} color="var(--accent-color)" />
          <span style={{ fontWeight: 600, fontSize: 16, flex: 1 }}>Community Chat</span>
          <button onClick={() => setShowMessageSearch(!showMessageSearch)} title="Search messages" style={{ padding: 6, borderRadius: 'var(--r-full)' }}>
            <Search size={18} color="var(--text-secondary)" />
          </button>
        </div>

        {showMessageSearch && (
          <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 8, alignItems: 'center', animation: 'slideIn 0.2s ease' }}>
            <Search size={14} color="var(--text-muted)" />
            <input value={messageSearch} onChange={e => setMessageSearch(e.target.value)} placeholder="Search messages..."
              autoFocus style={{ flex: 1, border: 'none', background: 'none', padding: '6px 0', fontSize: 13 }} />
            <button onClick={() => { setShowMessageSearch(false); setMessageSearch(''); }} style={{ padding: 4 }}><X size={16} color="var(--text-secondary)" /></button>
            {messageSearch && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filteredMessages.length} found</span>}
          </div>
        )}

        {connectionError && (
          <div style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)', color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>
            ⚠️ {connectionError}
          </div>
        )}

        <div className="chat-messages" ref={chatContainerRef} onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 14, userSelect: 'none' }}>
              <div style={{ width: 80, height: 80, borderRadius: 'var(--r-full)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={36} strokeWidth={1.2} color="var(--accent-color)" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>No messages yet</div>
              <div style={{ fontSize: 14 }}>Start the conversation! Say hello 👋</div>
            </div>
          ) : renderMessages()}
          <div ref={messagesEndRef} />
        </div>

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            <div className="typing-dots"><span /><span /><span /></div>
            <span>{typingUsers.map(u => u.username).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
          </div>
        )}

        {showScrollBtn && <button className="scroll-bottom-btn" onClick={scrollToBottom}><ChevronDown size={20} /></button>}

        {/* Reply bar */}
        {replyTo && (
          <div className="reply-bar">
            <div className="reply-bar-content">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-color)' }}>↩ Replying to {replyTo.sender?.username}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                {replyTo.mediaUrl && ['IMAGE', 'VIDEO', 'GIF', 'STICKER'].includes(replyTo.mediaType) && (
                  <img src={replyTo.mediaUrl?.startsWith('http') ? replyTo.mediaUrl : `${API_URL}${replyTo.mediaUrl}`}
                    alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <span>{replyTo.content || `📎 ${replyTo.mediaType}`}</span>
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} style={{ padding: 4, borderRadius: 'var(--r-full)' }}><X size={16} color="var(--text-secondary)" /></button>
          </div>
        )}

        {/* File preview */}
        {uploadFile && (
          <div className="file-preview-bar">
            <div className="file-chip">
              <FileText size={16} color="var(--accent-color)" />
              <span style={{ fontSize: 13, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadFile.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(uploadFile.size / 1024 / 1024).toFixed(1)}MB</span>
              <button type="button" onClick={() => setUploadFile(null)} style={{ color: 'var(--danger)', padding: 2 }}><X size={14} /></button>
            </div>
          </div>
        )}

        {/* GIF Picker — with Send as Sticker option */}
        {showGifPicker && (
          <div className="picker-panel" style={{ position: 'absolute', bottom: 75, left: '50%', transform: 'translateX(-50%)', width: 360, maxWidth: '92vw', zIndex: 50 }}>
            <div className="picker-header"><span>🎬 GIFs</span><button onClick={() => setShowGifPicker(false)}><X size={16} /></button></div>
            <div className="picker-search">
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input value={gifSearch} onChange={e => setGifSearch(e.target.value)} placeholder="Search GIFs..." />
              </div>
            </div>
            <div className="picker-grid">
              {(gifSearch ? gifs : trendingGifs).map(g => (
                <div key={g.id} style={{ position: 'relative' }}>
                  <img src={g.images.fixed_height_small.url} alt={g.title}
                    onClick={() => sendGifOrSticker(g.images.original.url, 'GIF')} loading="lazy" />
                  <button onClick={() => sendGifOrSticker(g.images.original.url, 'STICKER')} title="Send as Sticker"
                    style={{ position: 'absolute', bottom: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(124,58,237,0.9)', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    S
                  </button>
                </div>
              ))}
              {(gifSearch ? gifs : trendingGifs).length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                  {gifSearch ? 'No GIFs found' : 'Loading...'}
                </div>
              )}
            </div>
            <div className="picker-footer">Powered by GIPHY · Click 'S' to send as sticker</div>
          </div>
        )}

        {/* Sticker Picker */}
        {showStickerPicker && (
          <div className="picker-panel" style={{ position: 'absolute', bottom: 75, left: '50%', transform: 'translateX(-50%)', width: 360, maxWidth: '92vw', zIndex: 50 }}>
            <div className="picker-header"><span>🎨 Stickers</span><button onClick={() => setShowStickerPicker(false)}><X size={16} /></button></div>
            {savedStickers.length > 0 && (
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>♥ Saved</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {savedStickers.map((s, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={s} alt="" onClick={() => sendGifOrSticker(s, 'STICKER')}
                        style={{ width: 54, height: 54, objectFit: 'contain', cursor: 'pointer', borderRadius: 10, background: 'var(--bg-tertiary)' }} />
                      <button onClick={() => removeSavedSticker(s)}
                        style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--danger)', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="picker-search">
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input value={stickerSearch} onChange={e => setStickerSearch(e.target.value)} placeholder="Search stickers..." />
              </div>
            </div>
            <div className="picker-grid">
              {(stickerSearch ? stickers : trendingStickers).map(s => (
                <div key={s.id} style={{ position: 'relative' }}>
                  <img src={s.images.fixed_height_small.url} alt={s.title} onClick={() => sendGifOrSticker(s.images.original.url, 'STICKER')}
                    style={{ objectFit: 'contain', background: 'var(--bg-tertiary)' }} loading="lazy" />
                  <button onClick={() => saveSticker(s.images.original.url)} title="Save"
                    style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(124,58,237,0.85)', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {savedStickers.includes(s.images.original.url) ? '♥' : '♡'}
                  </button>
                </div>
              ))}
            </div>
            <div className="picker-footer">Powered by GIPHY</div>
          </div>
        )}

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="emoji-picker-wrapper">
            <EmojiPicker theme={document.body.classList.contains('dark') ? 'dark' : 'light'}
              onEmojiClick={onEmojiClick} width={320} height={380}
              searchPlaceHolder="Search emoji..." lazyLoadEmojis />
          </div>
        )}

        {/* Poll Creator */}
        {showPollCreator && (
          <div className="picker-panel" style={{ position: 'absolute', bottom: 75, left: '50%', transform: 'translateX(-50%)', width: 380, maxWidth: '92vw', zIndex: 50 }}>
            <div className="picker-header"><span>📊 Create Poll</span><button onClick={() => setShowPollCreator(false)}><X size={16} /></button></div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                placeholder="Ask a question..." style={{ padding: '10px 14px', borderRadius: 'var(--r)', border: '1.5px solid var(--border-color)', background: 'var(--input-bg)', fontSize: 14, fontWeight: 500 }} />

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Options</div>
              {pollOptions.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={opt} onChange={e => {
                    const updated = [...pollOptions];
                    updated[i] = e.target.value;
                    setPollOptions(updated);
                  }} placeholder={`Option ${i + 1}`}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 'var(--r)', border: '1.5px solid var(--border-color)', background: 'var(--input-bg)', fontSize: 13 }} />
                  {pollOptions.length > 2 && (
                    <button onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))} style={{ padding: 4, color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}

              {pollOptions.length < 12 && (
                <button onClick={() => setPollOptions([...pollOptions, ''])}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 'var(--r)', border: '1.5px dashed var(--border-color)', color: 'var(--accent-color)', fontSize: 13, fontWeight: 500, justifyContent: 'center' }}>
                  <Plus size={14} /> Add option
                </button>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={pollAllowMultiple} onChange={e => setPollAllowMultiple(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent-color)' }} />
                Allow multiple votes
              </label>

              <button onClick={handleCreatePoll}
                style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '10px 16px', borderRadius: 'var(--r)', fontWeight: 600, fontSize: 14 }}>
                Create Poll
              </button>
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="chat-input-container" style={{ position: 'relative' }}>
          <form onSubmit={handleSendMessage} className="chat-input-box">
            <div style={{ position: 'relative' }}>
              <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} title="Attach">
                <Paperclip size={18} />
              </button>
              {showAttachMenu && (
                <div className="context-menu" style={{ position: 'absolute', bottom: 42, left: 0, zIndex: 30 }}>
                  <button type="button" onClick={handleFileClick}><ImageIcon size={14} color="var(--accent-color)" /> Image</button>
                  <button type="button" onClick={handleFileClick}><VideoIcon size={14} color="var(--accent-color)" /> Video</button>
                  <button type="button" onClick={handleFileClick}><FileText size={14} color="var(--accent-color)" /> Document</button>
                </div>
              )}
            </div>

            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

            <button type="button" onClick={() => { closeAllPickers(); setShowGifPicker(!showGifPicker); }} title="GIF"
              style={{ fontWeight: 700, fontSize: 10, padding: '3px 6px', borderRadius: 6, border: '1.5px solid var(--text-muted)', color: 'var(--text-muted)', lineHeight: 1, letterSpacing: '0.3px' }}>
              GIF
            </button>

            <button type="button" onClick={() => { closeAllPickers(); setShowStickerPicker(!showStickerPicker); }} title="Sticker">
              <Smile size={18} />
            </button>

            <button type="button" onClick={() => { closeAllPickers(); setShowPollCreator(!showPollCreator); }} title="Create Poll">
              <BarChart3 size={18} />
            </button>

            <input ref={inputRef} type="text" placeholder="Type your message here..." value={newMessage} onChange={handleInputChange} />

            <button type="button" onClick={() => { closeAllPickers(); setShowEmojiPicker(!showEmojiPicker); }} title="Emoji"
              style={{ fontSize: 20, padding: 4, lineHeight: 1 }}>
              😊
            </button>

            <button type="submit" disabled={!newMessage.trim() && !uploadFile}>
              <Send size={17} />
            </button>
          </form>
        </div>
      </div>

      {/* REPORTS MODAL */}
      {showReports && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setShowReports(false); }}>
          <div className="modal-content" style={{ maxWidth: 500, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Inbox size={20} color="var(--accent-color)" /> Reports Inbox</h3>
              <button onClick={() => setShowReports(false)} style={{ padding: 4 }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <Inbox size={40} strokeWidth={1} /><p style={{ marginTop: 12, fontSize: 14 }}>No reports yet</p>
                </div>
              ) : reports.map(r => (
                <div key={r._id} style={{ padding: 16, borderBottom: '1px solid var(--border-color)', background: r.status === 'PENDING' ? 'var(--bg-hover)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="message-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{r.reportedUser?.username?.charAt(0)}</div>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{r.reportedUser?.username}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>by {r.reporter?.username}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--r-full)',
                      background: r.status === 'PENDING' ? 'rgba(245,158,11,0.12)' : r.status === 'REVIEWED' ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                      color: r.status === 'PENDING' ? '#f59e0b' : r.status === 'REVIEWED' ? '#22c55e' : '#6b7280',
                    }}>{r.status}</span>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6, background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--r)' }}>"{r.reason}"</div>
                  {r.message?.content && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>Message: "{r.message.content}"</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{new Date(r.createdAt).toLocaleString()}</div>
                  {r.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => updateReportStatus(r._id, 'REVIEWED')} style={{ fontSize: 12, padding: '7px 16px', borderRadius: 'var(--r-full)', background: 'var(--success)', color: '#fff', fontWeight: 600 }}>✓ Reviewed</button>
                      <button onClick={() => updateReportStatus(r._id, 'DISMISSED')} style={{ fontSize: 12, padding: '7px 16px', borderRadius: 'var(--r-full)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontWeight: 600, border: '1px solid var(--border-color)' }}>Dismiss</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STARRED MESSAGES MODAL */}
      {showStarred && (
        <div className="modal-overlay" onClick={e => { if (e.target.className === 'modal-overlay') setShowStarred(false); }}>
          <div className="modal-content" style={{ maxWidth: 500, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Star size={20} color="#f59e0b" /> Starred Messages</h3>
              <button onClick={() => setShowStarred(false)} style={{ padding: 4 }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {starredMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <Star size={40} strokeWidth={1} /><p style={{ marginTop: 12, fontSize: 14 }}>No starred messages</p>
                </div>
              ) : starredMessages.map(msg => (
                <div key={msg._id} style={{ padding: 14, borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                  onClick={() => { setShowStarred(false); scrollToMessage(msg._id); }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div className="message-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{msg.sender?.username?.charAt(0)}</div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{msg.sender?.username}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(new Date(msg.createdAt), 'MMM d, h:mm a')}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 32 }}>
                    {msg.content || `📎 ${msg.mediaType}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast toast-${t.type}`}>{t.text}</div>)}
      </div>
    </div>
  );
};

export default Chat;
