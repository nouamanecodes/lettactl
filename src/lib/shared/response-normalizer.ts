/**
 * Normalizes different SDK response formats into consistent arrays
 * Handles: Array responses, { items: [] }, { body: [] }, and other variations
 */
export function normalizeResponse(response: any): any[] {
  if (Array.isArray(response)) {
    return response;
  }
  
  if (response && typeof response === 'object') {
    // Check for common response wrapper patterns
    if (Array.isArray(response.items)) {
      return response.items;
    }
    
    if (Array.isArray(response.body)) {
      return response.body;
    }
    
    if (Array.isArray(response.data)) {
      return response.data;
    }
  }
  
  // Fallback: return empty array for unexpected formats
  return [];
}

/**
 * Sleep utility for polling and delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}