/**
 * storage-config.js - Centralized storage configuration for nostr.app
 * 
 * This module provides sophisticated storage root discovery with DID document
 * integration, intelligent caching, and graceful fallbacks. Can be used by
 * any component that needs cloud storage capabilities.
 */

/* ---------------------------------------------------------------- */
/* -                 CENTRALIZED STORAGE CONFIG                   - */
/* ---------------------------------------------------------------- */
const StorageConfig = {
  _cachedStorageRoot: null,
  _cacheExpiry: null,
  _cacheDuration: 5 * 1440 * 1000, // 5 days
  _isCustomStorage: false,

  // Get the root URL for nosdav storage with DID document discovery
  async getStorageRoot () {
    // Check if we have a valid cached result
    if (this._cachedStorageRoot && this._cacheExpiry && Date.now() < this._cacheExpiry) {
      return this._cachedStorageRoot
    }

    const pubkey = localStorage.getItem('pubkey')
    if (!pubkey) {
      // No pubkey, fall back to default
      const fallback = 'https://nosdav.net/'
      this._cachedStorageRoot = fallback
      this._cacheExpiry = Date.now() + this._cacheDuration
      this._isCustomStorage = false
      return fallback
    }

    try {
      // Try to fetch DID document from nostr.social
      const didUrl = `https://nostr.social/.well-known/did/nostr/${pubkey}.json`
      console.log('Fetching DID document from:', didUrl)

      const response = await fetch(didUrl)
      if (!response.ok) {
        throw new Error(`DID document fetch failed: ${response.status}`)
      }

      const didDocument = await response.json()
      console.log('DID document loaded:', didDocument)

      // Look for storage service in the service array
      const storageService = didDocument.service?.find(service =>
        service.type === 'Storage'
      )

      if (storageService && storageService.serviceEndpoint) {
        let endpoint = storageService.serviceEndpoint

        // Handle case where serviceEndpoint is an array
        if (Array.isArray(endpoint)) {
          endpoint = endpoint[0]
        }

        // Handle case where serviceEndpoint is a JSON string
        if (typeof endpoint === 'string' && endpoint.startsWith('[')) {
          try {
            const parsed = JSON.parse(endpoint)
            endpoint = Array.isArray(parsed) ? parsed[0] : endpoint
          } catch (e) {
            console.warn('Failed to parse serviceEndpoint as JSON:', e)
          }
        }

        // Ensure the endpoint ends with a slash
        if (endpoint && !endpoint.endsWith('/')) {
          endpoint += '/'
        }

        console.log('Found storage endpoint:', endpoint)
        this._cachedStorageRoot = endpoint
        this._cacheExpiry = Date.now() + this._cacheDuration
        this._isCustomStorage = true
        return endpoint
      }

      console.log('No storage service found in DID document, falling back to default')
    } catch (error) {
      console.error('Error fetching DID document:', error)
    }

    // Fall back to default nosdav.net
    const fallback = 'https://nosdav.net/'
    this._cachedStorageRoot = fallback
    this._cacheExpiry = Date.now() + this._cacheDuration
    this._isCustomStorage = false
    return fallback
  },

  // Build a complete URL for a given path
  async buildUrl (path) {
    const storageRoot = await this.getStorageRoot()

    // If using custom storage (from DID), the pubkey is already included in the root
    if (this._isCustomStorage) {
      return `${storageRoot}${path}`
    }

    // If using default nosdav.net, we need to include the pubkey
    const pubkey = localStorage.getItem('pubkey')
    return `${storageRoot}${pubkey}/${path}`
  },

  // Clear the cache (useful for testing or when pubkey changes)
  clearCache () {
    this._cachedStorageRoot = null
    this._cacheExpiry = null
    this._isCustomStorage = false
  },

  // Check if using custom storage
  isCustomStorage () {
    return this._isCustomStorage
  },

  // Get cached storage root without fetching (for display purposes)
  getCachedStorageRoot () {
    return this._cachedStorageRoot
  }
}

export default StorageConfig 