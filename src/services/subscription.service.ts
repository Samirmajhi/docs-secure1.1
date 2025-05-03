import axios from 'axios';
import api from './api'; // Import the configured api client instead

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
  // Use a hardcoded URL to avoid any issues with baseUrl being undefined
  private baseUrl = 'http://localhost:8000/api';

  async getPlans(): Promise<SubscriptionPlan[]> {
    try {
      console.log('Fetching subscription plans...');
      
      // Use the configured api client instead of direct axios
      const response = await api.get('/subscription/plans');
      
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
      
      // First try with a direct fetch to avoid any baseUrl issues
      try {
        const timestamp = new Date().getTime(); // Cache-busting parameter
        // Direct fetch call with hardcoded URL
        const response = await fetch(`http://localhost:8000/api/subscription/user?t=${timestamp}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Validate response data
        if (!data) {
          console.warn('Empty subscription data received');
          return DEFAULT_FREE_PLAN;
        }
        
        console.log('Current subscription response (raw):', data);
        
        // Ensure numeric values are properly converted
        const storage_limit = typeof data.storage_limit === 'string' 
          ? parseInt(data.storage_limit, 10) 
          : (typeof data.storage_limit === 'number' ? data.storage_limit : DEFAULT_FREE_PLAN.storage_limit);
        
        const price = typeof data.price === 'string'
          ? parseFloat(data.price)
          : (typeof data.price === 'number' ? data.price : 0);
        
        // Ensure all required fields are present, use defaults for any missing fields
        return {
          id: typeof data.id === 'string' ? parseInt(data.id, 10) : (data.id ?? 1),
          name: data.name ?? 'Free',
          storage_limit: storage_limit,
          price: price,
          features: data.features ?? DEFAULT_FREE_PLAN.features
        };
      } catch (fetchError) {
        console.error('Error with direct fetch, trying api client:', fetchError);
        
        // If direct fetch fails, try with api client
        const response = await api.get(`/subscription/user?t=${new Date().getTime()}`);
        
        if (!response.data) {
          console.warn('Empty subscription data received');
          return DEFAULT_FREE_PLAN;
        }
        
        const data = response.data;
        console.log('Current subscription response (raw from api client):', data);
        
        // Ensure numeric values are properly converted
        const storage_limit = typeof data.storage_limit === 'string' 
          ? parseInt(data.storage_limit, 10) 
          : (typeof data.storage_limit === 'number' ? data.storage_limit : DEFAULT_FREE_PLAN.storage_limit);
        
        const price = typeof data.price === 'string'
          ? parseFloat(data.price)
          : (typeof data.price === 'number' ? data.price : 0);
        
        return {
          id: typeof data.id === 'string' ? parseInt(data.id, 10) : (data.id ?? 1),
          name: data.name ?? 'Free',
          storage_limit: storage_limit,
          price: price,
          features: data.features ?? DEFAULT_FREE_PLAN.features
        };
      }
    } catch (error) {
      console.error('Error fetching current subscription:', error);
      return DEFAULT_FREE_PLAN;
    }
  }

  async getStorageUsage(): Promise<{ used: number; limit: number }> {
    try {
      console.log('Fetching storage usage...');
      
      // First try with a direct fetch to avoid any baseUrl issues
      try {
        const timestamp = new Date().getTime(); // Cache-busting parameter
        // Direct fetch call with hardcoded URL
        const response = await fetch(`http://localhost:8000/api/subscription/storage?t=${timestamp}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data) {
          console.warn('Empty storage data received');
          return DEFAULT_STORAGE;
        }
        
        console.log('Storage usage response (raw):', data);
        
        // Ensure values are numbers, converting from strings if necessary
        return {
          used: typeof data.used === 'string' ? parseInt(data.used, 10) : (typeof data.used === 'number' ? data.used : 0),
          limit: typeof data.limit === 'string' ? parseInt(data.limit, 10) : (typeof data.limit === 'number' ? data.limit : DEFAULT_STORAGE.limit)
        };
      } catch (fetchError) {
        console.error('Error with direct fetch, trying api client:', fetchError);
        
        // If direct fetch fails, try with api client
        const response = await api.get(`/subscription/storage?t=${new Date().getTime()}`);
        
        if (!response.data) {
          console.warn('Empty storage data received');
          return DEFAULT_STORAGE;
        }
        
        const data = response.data;
        console.log('Storage usage response (raw from api):', data);
        
        // Ensure values are numbers, converting from strings if necessary
        return {
          used: typeof data.used === 'string' ? parseInt(data.used, 10) : (typeof data.used === 'number' ? data.used : 0),
          limit: typeof data.limit === 'string' ? parseInt(data.limit, 10) : (typeof data.limit === 'number' ? data.limit : DEFAULT_STORAGE.limit)
        };
      }
    } catch (error) {
      console.error('Error fetching storage usage:', error);
      return DEFAULT_STORAGE;
    }
  }

  async updateSubscription(planId: number): Promise<void> {
    try {
      console.log('Updating subscription to plan ID:', planId);
      
      if (!planId || planId <= 0) {
        throw new Error('Invalid plan ID');
      }
      
      const response = await api.post('/subscription/update', { planId });
      console.log('Update subscription response:', response.data);
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }
}

export default new SubscriptionService(); 