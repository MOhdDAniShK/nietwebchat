import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';

export const AuthContext = createContext();

// Dynamic API URL: use localhost when on localhost, otherwise use the current origin
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = IS_LOCAL ? 'http://localhost:5001' : window.location.origin;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userInfo = Cookies.get('userInfo');
    if (userInfo) {
      setUser(JSON.parse(userInfo));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      setUser(data);
      Cookies.set('userInfo', JSON.stringify(data), { expires: 7 });
      return data;
    } catch (error) {
      throw error.response?.data?.message || 'Login failed! Make sure the backend server and MongoDB are running.';
    }
  };

  const register = async (username, email, password) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/register`, { username, email, password });
      // If server auto-verified (email not configured), set user + cookie
      if (data.autoVerified && data.token) {
        setUser(data);
        Cookies.set('userInfo', JSON.stringify(data), { expires: 7 });
      }
      return data;
    } catch (error) {
      throw error.response?.data?.message || 'Registration failed! Make sure the backend server and MongoDB are running.';
    }
  };

  const verifyOtp = async (email, otp) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/verify-otp`, { email, otp });
      setUser(data);
      Cookies.set('userInfo', JSON.stringify(data), { expires: 7 });
      return data;
    } catch (error) {
      throw error.response?.data?.message || 'OTP verification failed!';
    }
  };

  const updateProfile = async (username, profilePicFile) => {
    try {
      const formData = new FormData();
      if (username) formData.append('username', username);
      if (profilePicFile) formData.append('profilePic', profilePicFile);

      const config = { headers: { Authorization: `Bearer ${user.token}` } };
      const { data } = await axios.put(`${API_URL}/api/auth/profile`, formData, config);
      setUser(data);
      Cookies.set('userInfo', JSON.stringify(data), { expires: 7 });
      return data;
    } catch (error) {
      throw error.response?.data?.message || 'Update failed';
    }
  };

  const logout = () => {
    setUser(null);
    Cookies.remove('userInfo');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, verifyOtp, logout, updateProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
