import axios from 'axios';

export interface SubscriptionPlan {
  id: number;
  name: string;
  storage_limit: number;
  price: number | null;
  features: string[];
}

export interface UserSubscription {
  id: number;
  user_id: string;
  plan_id: number;
  storage_used: number;
  status: string;
  start_date: string;
  end_date: string | null;
}

// Default free plan to use as fallback
const DEFAULT_FREE_PLAN: SubscriptionPlan = {
  id: 1,
  name: 'Free',
  storage_limit: 5 * 1024 * 1024, // 5MB in bytes
  price: 0,
  features: ['5MB Storage', 'Basic Document Management']
};

// Default storage usage to use as fallback
const DEFAULT_STORAGE = {
  used: 0,
  limit: 5 * 1024 * 1024 // 5MB default limit
};

class SubscriptionService {
  private baseUrl = 'http://localhost:8000/api';

  private getAuthHeaders() {
    const token = localStorage.getItem('token');
    console.log('Auth token for subscription request:', token ? 'Present' : 'Missing');
    
    if (!token) {
      console.warn('No auth token found in localStorage');
    }
    
    return {
      headers: {
        Authorization: token ? `Bearer ${token}` : ''
      }
    };
  }

  async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      console.log('Fetching subscription plans...');
      const response = await axios.get(`${this.baseUrl}/subscription/plans`, this.getAuthHeaders());
      
      if (!response.data || !Array.isArray(response.data)) {
        console.warn('Invalid plans data received:', response.data);
        return [DEFAULT_FREE_PLAN];
      }
      
      console.log('Plans response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching subscription plans:', error);
      // Return a default free plan if API call fails
      return [DEFAULT_FREE_PLAN];
    }
  }

  async getCurrentSubscription(): Promise<SubscriptionPlan> {
    try {
      console.log('Fetching current subscription...');
      
      // Check if token exists first to avoid unnecessary API calls
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token available for subscription request');
        return DEFAULT_FREE_PLAN;
      }
      
      const timestamp = new Date().getTime(); // Cache-busting parameter
      const response = await axios.get(`${this.baseUrl}/subscription/user?t=${timestamp}`, this.getAuthHeaders());
      
      // Validate response data
      if (!response.data) {
        console.warn('Empty subscription data received');
        return DEFAULT_FREE_PLAN;
      }
      
      // Validate required fields
      const data = response.data;
      if (typeof data.id === 'undefined' || !data.name || typeof data.storage_limit === 'undefined') {
        console.warn('Invalid subscription data format:', data);
        return DEFAULT_FREE_PLAN;
      }
      
      console.log('Current subscription response:', data);
      
      // Ensure all required fields are present, use defaults for any missing fields
      return {
        id: data.id || 1,
        name: data.name || 'Free',
        storage_limit: data.storage_limit || DEFAULT_FREE_PLAN.storage_limit,
        price: data.price || 0,
        features: data.features || DEFAULT_FREE_PLAN.features
      };
    } catch (error) {
      console.error('Error fetching current subscription:', error);
      // Return a default free plan if API call fails
      return DEFAULT_FREE_PLAN;
    }
  }

  async getStorageUsage(): Promise<{ used: number; limit: number }> {
    try {
      console.log('Fetching storage usage...');
      
      // Check if token exists first to avoid unnecessary API calls
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token available for storage request');
        return DEFAULT_STORAGE;
      }
      
      const timestamp = new Date().getTime(); // Cache-busting parameter
      const response = await axios.get(`${this.baseUrl}/subscription/storage?t=${timestamp}`, this.getAuthHeaders());
      
      // Validate response data
      if (!response.data) {
        console.warn('Empty storage data received');
        return DEFAULT_STORAGE;
      }
      
      const data = response.data;
      console.log('Storage usage response:', data);
      
      // Ensure all required fields are present, use defaults for any missing
      return {
        used: typeof data.used === 'number' ? data.used : 0,
        limit: typeof data.limit === 'number' ? data.limit : DEFAULT_STORAGE.limit
      };
    } catch (error) {
      console.error('Error fetching storage usage:', error);
      // Return default storage values if API call fails
      return DEFAULT_STORAGE;
    }
  }

  async updateSubscription(planId: number): Promise<void> {
    try {
      console.log('Updating subscription to plan ID:', planId);
      
      // Validate planId
      if (!planId || planId <= 0) {
        throw new Error('Invalid plan ID');
      }
      
      const response = await axios.post(`${this.baseUrl}/subscription/update`, { planId }, this.getAuthHeaders());
      console.log('Update subscription response:', response.data);
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }
}

export default new SubscriptionService(); 