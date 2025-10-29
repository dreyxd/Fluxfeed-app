/**
 * API Base URL Configuration
 * 
 * Development: Uses localhost with Vite proxy
 * Production: Uses api.fluxfeed.news subdomain
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD 
    ? 'https://api.fluxfeed.news' 
    : 'http://localhost:8787'
  );

export default API_BASE_URL;
