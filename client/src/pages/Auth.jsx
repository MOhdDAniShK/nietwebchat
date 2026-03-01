import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { motion } from 'framer-motion';
import axios from 'axios';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:5001' : '';

const Auth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [showOtpForm, setShowOtpForm] = useState(false);
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [fpStep, setFpStep] = useState(1); // 1=email, 2=otp+newpass
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const { login, register, verifyOtp } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isLogin) {
                await login(email, password);
                navigate('/');
            } else {
                const res = await register(username, email, password);
                if (res.autoVerified) {
                    // Email not configured, auto-verified
                    navigate('/');
                } else {
                    setMessage(res.message || 'OTP sent to your email.');
                    setShowOtpForm(true);
                }
            }
        } catch (err) {
            setError(typeof err === 'string' ? err : err?.message || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleOtpSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await verifyOtp(email, otp);
            navigate('/');
        } catch (err) {
            setError(typeof err === 'string' ? err : err?.message || 'Verification failed.');
        } finally {
            setLoading(false);
        }
    };

    // Forgot password — step 1: send OTP
    const handleForgotSendOtp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data } = await axios.post(`${API_URL}/api/auth/forgot-password`, { email });
            setMessage(data.message || 'OTP sent!');
            setFpStep(2);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    // Forgot password — step 2: reset password
    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { data } = await axios.post(`${API_URL}/api/auth/reset-password`, { email, otp, newPassword });
            setMessage(data.message || 'Password reset successful!');
            setShowForgotPassword(false);
            setFpStep(1);
            setOtp('');
            setNewPassword('');
        } catch (err) {
            setError(err.response?.data?.message || 'Password reset failed');
        } finally {
            setLoading(false);
        }
    };

    // Forgot password UI
    if (showForgotPassword) {
        return (
            <div className="auth-container">
                <motion.div className="auth-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                    <div className="auth-header">
                        <h1 className="auth-title">Reset Password</h1>
                        <p className="auth-subtitle" style={{ marginBottom: 0 }}>
                            {fpStep === 1 ? 'Enter your email to receive a reset code' : 'Enter the OTP and your new password'}
                        </p>
                    </div>
                    <div className="auth-form-container">
                        {error && <div className="error-msg">{error}</div>}
                        {message && <div className="success-msg">{message}</div>}

                        {fpStep === 1 ? (
                            <form onSubmit={handleForgotSendOtp} className="auth-form">
                                <div className="input-group">
                                    <label>Email address</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                                        className="github-input" placeholder="you@niet.co.in" autoFocus />
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? 'Sending...' : 'Send Reset Code'}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleResetPassword} className="auth-form">
                                <div className="input-group">
                                    <label>Verification Code</label>
                                    <input type="text" value={otp} onChange={e => setOtp(e.target.value)} required
                                        className="github-input" placeholder="Enter 6-digit OTP" maxLength={6} autoFocus />
                                </div>
                                <div className="input-group">
                                    <label>New Password</label>
                                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
                                        className="github-input" placeholder="At least 6 characters" minLength={6} />
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? 'Resetting...' : 'Reset Password'}
                                </button>
                            </form>
                        )}
                    </div>
                    <div className="toggle-auth">
                        <p>
                            <span onClick={() => { setShowForgotPassword(false); setError(''); setMessage(''); setFpStep(1); }}>
                                ← Back to Sign In
                            </span>
                        </p>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <motion.div
                className="auth-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
            >
                <div className="auth-header">
                    <h1 className="auth-title">
                        {showOtpForm ? 'Verify Email' : isLogin ? 'Welcome Back' : 'Create Account'}
                    </h1>
                    <p className="auth-subtitle" style={{ marginBottom: 0 }}>
                        {showOtpForm
                            ? 'Enter the code sent to your email'
                            : isLogin
                                ? 'Sign in to NIET Chat'
                                : 'Join the NIET Chat community'}
                    </p>
                </div>

                <div className="auth-form-container">
                    {showOtpForm ? (
                        <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
                            {message && <div className="success-msg">{message}</div>}
                            {error && <div className="error-msg">{error}</div>}
                            <form onSubmit={handleOtpSubmit} className="auth-form">
                                <div className="input-group">
                                    <label>Verification Code</label>
                                    <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)}
                                        required className="github-input" placeholder="Enter 6-digit code" maxLength={6} autoFocus />
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? 'Verifying...' : 'Verify & Sign In'}
                                </button>
                            </form>
                        </motion.div>
                    ) : (
                        <motion.div key={isLogin ? 'login' : 'register'} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
                            {error && <div className="error-msg">{error}</div>}

                            <form onSubmit={handleSubmit} className="auth-form">
                                {!isLogin && (
                                    <div className="input-group">
                                        <label>Username</label>
                                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                                            required className="github-input" placeholder="Choose a username" />
                                    </div>
                                )}

                                <div className="input-group">
                                    <label>Email address</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                        required className="github-input" placeholder="you@niet.co.in" />
                                </div>

                                <div className="input-group">
                                    <label>
                                        Password
                                        {isLogin && (
                                            <span className="forgot-password" style={{ cursor: 'pointer' }}
                                                onClick={(e) => { e.preventDefault(); setShowForgotPassword(true); setError(''); setMessage(''); }}>
                                                Forgot password?
                                            </span>
                                        )}
                                    </label>
                                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                        required className="github-input" placeholder="••••••••" />
                                </div>

                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? (isLogin ? 'Signing in...' : 'Creating account...') : (isLogin ? 'Sign In' : 'Create Account')}
                                </button>
                            </form>
                        </motion.div>
                    )}
                </div>

                {!showOtpForm && (
                    <div className="toggle-auth">
                        {isLogin ? (
                            <p>New to NIET Chat? <span onClick={() => { setIsLogin(false); setError(''); }}>Create an account</span></p>
                        ) : (
                            <p>Already have an account? <span onClick={() => { setIsLogin(true); setError(''); }}>Sign in</span></p>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default Auth;
