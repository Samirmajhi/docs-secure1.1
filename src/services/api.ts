import axios from 'axios';
import { toast } from 'sonner';

// Force localhost URL regardless of environment variables
const API_URL = 'http://localhost:8000/api';
console.log('API URL configured as:', API_URL);

// Create API instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000, // 15 second timeout
  withCredentials: true // Enable sending cookies
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    const ownerToken = localStorage.getItem('ownerToken');
    
    if (ownerToken) {
      config.headers.Authorization = `Bearer ${ownerToken}`;
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    console.log('Making API request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      headers: config.headers,
      data: config.data,
      fullUrl: `${config.baseURL}${config.url}`
    });
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    });
    return response;
  },
  (error) => {
    console.error('API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        fullUrl: `${error.config?.baseURL}${error.config?.url}`
      }
    });

    // Handle network errors
    if (error.code === 'ERR_NETWORK') {
      toast.error('Network error. Please check your connection and try again.');
    } else if (error.response?.data?.message) {
      toast.error(error.response.data.message);
    } else {
      toast.error('An error occurred. Please try again.');
    }

    return Promise.reject(error);
  }
);

export default api;