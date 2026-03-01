import React, { useState, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ThemeContext } from '../context/ThemeContext';
import { Settings, LogOut, X, Sun, Moon, Camera, Inbox } from 'lucide-react';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:5001' : '';

const ProfileWidget = ({ onOpenReports }) => {
  const { user, logout, updateProfile } = useContext(AuthContext);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleEditClick = () => {
    setNewUsername(user.username);
    setError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile(newUsername, null);
      setIsEditing(false);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }
    setSaving(true);
    try {
      await updateProfile(null, file);
      setError('');
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Failed to upload');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const avatarUrl = user.profilePic ? `${API_URL}${user.profilePic}` : null;
  const isStaff = user.role === 'OWNER' || user.role === 'MODERATOR';

  return (
    <>
      <div className="user-profile-panel">
        <div className="message-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            user.username.charAt(0)
          )}
        </div>
        <div className="user-profile-info">
          <div className="user-profile-name">{user.username}</div>
          <div className="user-profile-status">{user.role.toLowerCase()}</div>
        </div>
        {isStaff && onOpenReports && (
          <button onClick={onOpenReports} title="Reports Inbox" style={{ padding: 4, position: 'relative' }}>
            <Inbox size={18} color="var(--accent-color)" />
          </button>
        )}
        <button onClick={toggleTheme} title="Toggle Theme" style={{ padding: 4 }}>
          {theme === 'dark' ? <Sun size={18} color="var(--text-secondary)" /> : <Moon size={18} color="var(--text-secondary)" />}
        </button>
        <button onClick={() => setIsModalOpen(true)} title="Settings" style={{ padding: 4 }}>
          <Settings size={18} color="var(--text-secondary)" />
        </button>
        <button onClick={logout} title="Logout" style={{ padding: 4 }}>
          <LogOut size={18} color="var(--danger)" />
        </button>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target.className === 'modal-overlay') setIsModalOpen(false);
        }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>My Profile</h3>
              <button onClick={() => setIsModalOpen(false)}><X size={22} /></button>
            </div>

            {/* Avatar Upload */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ position: 'relative', width: 80, height: 80 }}>
                <div className="message-avatar" style={{ width: 80, height: 80, fontSize: 28 }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={user.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    user.username.charAt(0)
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--accent-color)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid var(--bg-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <Camera size={14} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleProfilePicChange}
                />
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--bg-tertiary)', padding: 16, borderRadius: 'var(--radius-sm)' }}>
              {error && <div style={{ color: 'var(--danger)', marginBottom: 8, fontSize: 13 }}>{error}</div>}
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>USERNAME</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={handleSave} disabled={saving} style={{ background: 'var(--accent-color)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setIsEditing(false)} style={{ background: 'var(--bg-secondary)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, border: '1px solid var(--border-color)' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>USERNAME</div>
                    <div style={{ fontWeight: 500 }}>{user.username}</div>
                  </div>
                  <button onClick={handleEditClick} style={{ color: 'var(--accent-color)', fontSize: 13, fontWeight: 600 }}>Edit</button>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>EMAIL</div>
                <div style={{ fontWeight: 500 }}>{user.email}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>ROLE</div>
                <span className={`message-role ${user.role.toLowerCase()}`}>{user.role}</span>
              </div>
            </div>

            {saving && <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--accent-color)', marginTop: 12 }}>Updating...</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default ProfileWidget;
