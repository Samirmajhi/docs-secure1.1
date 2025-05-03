import api from './api';

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  mobileNumber: string;
  pin: string;
}

export interface User {
  id: number;
  email: string;
  fullName: string;
  mobileNumber?: string;
  pin?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

const authService = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    try {
      const response = await api.post('/auth/login', data);
      
      // Save the token and user to localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw error;
      }
      console.error('Login error:', error);
      throw new Error('Network error. Please try again later.');
    }
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    try {
      const response = await api.post('/auth/register', data);
      
      // Save the token and user to localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw error;
      }
      console.error('Registration error:', error);
      throw new Error('Network error. Please try again later.');
    }
  },

  getProfile: async (): Promise<User> => {
    try {
      const response = await api.get('/user/profile');
      return response.data;
    } catch (error) {
      console.error('Profile fetch error:', error);
      throw error;
    }
  },

  updateProfile: async (data: Partial<User>): Promise<AuthResponse> => {
    try {
      const response = await api.put('/user/profile', data);
      
      // Update the user in localStorage
      const currentUser = localStorage.getItem('user');
      if (currentUser) {
        const updatedUser = { ...JSON.parse(currentUser), ...data };
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
      
      return response.data;
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  },

  verifyOwner: async (mobileNumber: string, pin: string) => {
    try {
      const response = await api.post('/access/verify', { mobileNumber, pin });
      return response.data;
    } catch (error) {
      console.error('Owner verification error:', error);
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  googleLogin: async (): Promise<void> => {
    try {
      // Force localhost URL for Google OAuth
      window.location.href = 'http://localhost:8000/auth/google';
    } catch (error) {
      console.error('Google login error:', error);
      throw new Error('Failed to initiate Google login');
    }
  },

  handleGoogleCallback: async (token: string): Promise<AuthResponse> => {
    try {
      // Save the token and user to localStorage
      localStorage.setItem('token', token);
      
      // Get user profile
      const response = await api.get('/user/profile');
      const user = response.data;
      
      localStorage.setItem('user', JSON.stringify(user));
      
      return {
        message: 'Google login successful',
        token,
        user
      };
    } catch (error) {
      console.error('Google callback error:', error);
      throw error;
    }
  },
};

export default authService;
