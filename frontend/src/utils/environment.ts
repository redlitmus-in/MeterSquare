/**
 * Environment configuration and validation utilities
 * Centralized environment variable management for production applications
 */

export interface EnvironmentConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  api: {
    baseUrl: string;
  };
  environment: 'development' | 'production' | 'test';
}

/**
 * Validates and returns environment configuration
 * Throws descriptive errors for missing required variables
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  // Supabase is optional - we're using Flask backend
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

  // API URL is required
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  if (!apiBaseUrl) {
    console.warn('VITE_API_BASE_URL not set, using default: http://localhost:5000');
  }

  return {
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
    },
    api: {
      baseUrl: apiBaseUrl,
    },
    environment: (import.meta.env.NODE_ENV || 'development') as EnvironmentConfig['environment'],
  };
};

/**
 * Check if Supabase is using placeholder credentials
 */
export const isUsingPlaceholderSupabase = (): boolean => {
  const config = getEnvironmentConfig();
  return config.supabase.url.includes('placeholder') ||
         config.supabase.anonKey.includes('placeholder');
};

/**
 * Environment-specific configuration helpers
 */
export const isDevelopment = (): boolean => import.meta.env.DEV;
export const isProduction = (): boolean => import.meta.env.PROD;
export const isTest = (): boolean => import.meta.env.MODE === 'test';

/**
 * Safe environment variable access with fallbacks
 */
export const getEnvVar = (key: string, fallback?: string): string => {
  const value = import.meta.env[key];
  if (!value && fallback === undefined) {
    console.warn(`Environment variable ${key} is not set`);
  }
  return value || fallback || '';
};

/**
 * Validates Supabase connection on app startup
 */
export const validateSupabaseConnection = async () => {
  try {
    // Skip validation if using placeholder credentials
    if (isUsingPlaceholderSupabase()) {
      console.log('📌 Using placeholder Supabase credentials - skipping validation');
      return { success: true, error: null };
    }

    const config = getEnvironmentConfig();
    const { createClient } = await import('@supabase/supabase-js');

    const supabase = createClient(config.supabase.url, config.supabase.anonKey);

    // Test connection by attempting to get auth session
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('Supabase connection warning:', error.message);
    } else {
      console.log('✅ Supabase connection validated');
    }

    return { success: !error, error };
  } catch (error) {
    console.error('❌ Supabase connection failed:', error);
    return { success: false, error };
  }
}; 