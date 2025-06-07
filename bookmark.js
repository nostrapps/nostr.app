/* ================================================================ */
/* -                      IMPORTS & SETUP                         - */
/* ================================================================ */
// Preact framework imports
import {
  h,
  render,
  Component
} from 'https://unpkg.com/preact@10.13.1/dist/preact.module.js'
import htm from 'https://unpkg.com/htm@3.1.1/dist/htm.module.js'

// Local component and utility imports
import Navbar from './navbar.js'
import StorageConfig from './storage-config.js'
import './nosdav-shim.js'
import * as secp256k1 from 'https://cdn.jsdelivr.net/npm/@noble/secp256k1@1.7.1/+esm'

// Make secp256k1 available globally (required by nosdav-shim)
window.secp256k1 = secp256k1

// Initialize HTM with Preact for JSX-like syntax
const html = htm.bind(h)

/* ================================================================ */
/* -                     UTILITY FUNCTIONS                        - */
/* ================================================================ */
// Utility function to construct the bookmarks storage URL using DID discovery
const getBookmarksUrl = async (customUrl = null) => {
  if (customUrl) return customUrl

  const pubkey = localStorage.getItem('pubkey')
  if (!pubkey) return null

  try {
    return await StorageConfig.buildUrl('public/bookmark/bookmark.json')
  } catch (error) {
    console.error('Error building bookmark URL:', error)
    // Fallback to hardcoded pattern if StorageConfig fails
    return `https://nosdav.net/${pubkey}/public/bookmark/bookmark.json`
  }
}

/* ================================================================ */
/* -                        CONSTANTS                             - */
/* ================================================================ */
// Default bookmark categories available for organization
const DEFAULT_CATEGORIES = [
  'Development',
  'Apps',
  'Design',
  'Productivity',
  'Education',
  'Entertainment',
  'News',
  'Other'
]

/* ================================================================ */
/* -                   MAIN BOOKMARK APP CLASS                    - */
/* ================================================================ */
class BookmarkApp extends Component {
  constructor () {
    super()
    // Initialize application state
    this.state = {
      bookmarks: [], // Array of bookmark objects
      newBookmark: { title: '', url: '', category: 'Development' }, // Form state for new bookmark
      selectedCategory: 'All Categories', // Current category filter
      searchQuery: '', // Current search query
      availableUris: [], // Available storage URIs from TypeRegistrations
      currentUriIndex: 0, // Index of currently selected URI
      typeRegistrations: [], // TypeRegistration objects from publicTypeIndex
      storageType: 'nosdav' // Current storage type being used
    }
  }

  /* -------------------- LIFECYCLE METHODS -------------------- */
  componentDidMount () {
    // Add a small delay to ensure any URL hash login completes first
    setTimeout(async () => {
      // First check for publicTypeIndex.json to discover bookmark collections
      await this.checkPublicTypeIndex()
      // Then load bookmarks from the appropriate storage location
      this.loadBookmarks()
    }, 200)
  }

  /* -------------------- TYPE REGISTRATION METHODS -------------------- */
  // Check for publicTypeIndex.json and load TypeRegistrations using DID discovery
  async checkPublicTypeIndex () {
    try {
      const pubkey = localStorage.getItem('pubkey')
      if (!pubkey) {
        console.log('No pubkey found, skipping publicTypeIndex check')
        return
      }

      // Use StorageConfig for DID-aware URL building instead of hardcoded nosdav.net
      const typeIndexUrl = await StorageConfig.buildUrl('settings/publicTypeIndex.json')
      console.log(`🔍 Checking for publicTypeIndex at DID-discovered location: ${typeIndexUrl}`)

      const response = await fetch(typeIndexUrl)

      if (response.status === 404) {
        console.log('📭 No publicTypeIndex.json found - DID discovery will be used for storage')
        return
      }

      if (!response.ok) {
        console.error(
          'Error fetching publicTypeIndex.json:',
          response.statusText
        )
        return
      }

      const typeIndex = await response.json()
      console.log('Found publicTypeIndex.json:', typeIndex)

      // Filter for TypeRegistration objects for Bookmark class
      const bookmarkRegistrations = typeIndex.filter(
        item =>
          item.type === 'TypeRegistration' &&
          item.forClass === 'BookmarkCollection'
      )

      if (bookmarkRegistrations.length > 0) {
        console.log('✅ Found Bookmark registrations:', bookmarkRegistrations)
        console.log('📋 TypeRegistrations will override DID discovery for storage')

        // Convert instance paths to full URLs using DID-discovered storage root
        const bookmarkUris = await Promise.all(bookmarkRegistrations.map(async reg => {
          let instancePath = reg.instance

          // Handle relative paths that start with ../
          if (instancePath.startsWith('../')) {
            // Remove the publicTypeIndex.json from the path and go up one directory
            const baseUrl = new URL(typeIndexUrl)
            const pathParts = baseUrl.pathname.split('/')
            // Remove the filename (publicTypeIndex.json)
            pathParts.pop()
            // Remove one directory for each ../ at the start
            const relativeParts = instancePath.split('/')
            let dotDotCount = 0
            while (
              relativeParts.length > 0 &&
              relativeParts[0] === '..'
            ) {
              relativeParts.shift()
              dotDotCount++
            }
            // Remove that many directories from the path
            for (let i = 0; i < dotDotCount; i++) {
              pathParts.pop()
            }
            // Reconstruct the path with the remaining relative parts
            const newPath = [...pathParts, ...relativeParts].join('/')
            return `${baseUrl.origin}${newPath}`
          }

          // For absolute paths, use StorageConfig
          // Remove leading slash if present since buildUrl adds path properly
          const cleanPath = instancePath.startsWith('/')
            ? instancePath.substring(1)
            : instancePath

          return await StorageConfig.buildUrl(cleanPath)
        }))

        console.log('🎯 DID-based Bookmark URIs:', bookmarkUris)
        console.log('✅ All TypeRegistration paths now use DID-discovered storage root')

        // Update state with these URIs
        this.setState({
          availableUris: bookmarkUris,
          typeRegistrations: bookmarkRegistrations
        })
      } else {
        console.log('📭 No Bookmark TypeRegistrations found - DID discovery will be used for storage')
      }
    } catch (error) {
      console.error('❌ Error checking publicTypeIndex.json:', error)
      console.log('🔄 Falling back to DID discovery for storage')
    }
  }

  /* -------------------- URI PARSING METHODS -------------------- */
  // Parse URIs from query string for custom storage locations
  parseUrisFromQueryString () {
    const urlParams = new URLSearchParams(window.location.search)
    const uriParam = urlParams.get('uri')

    if (!uriParam) return []

    // Split by comma and trim each URI
    return uriParam
      .split(',')
      .map(uri => uri.trim())
      .filter(uri => uri)
  }

  /* -------------------- STORAGE PROVIDER METHODS -------------------- */
  // Get the appropriate storage provider with enhanced DID-based discovery
  getStorageProvider () {
    // First check if we have URIs from TypeRegistrations or query params
    let availableUris = [...this.state.availableUris]

    // If no TypeRegistration URIs, check query string
    if (availableUris.length === 0) {
      const queryUris = this.parseUrisFromQueryString()
      availableUris = queryUris

      // Store the available URIs in state for later use
      if (queryUris.length > 0 && this.state.availableUris.length === 0) {
        this.setState({ availableUris: queryUris })
      }
    }

    // Get the current URI (either the selected one or the first one)
    const customBookmarksUrl =
      availableUris[this.state.currentUriIndex] || null

    // Enhanced storage provider with DID document discovery
    console.log('=== BOOKMARK STORAGE PROVIDER DEBUG ===')
    console.log('Available URIs from TypeRegistrations:', this.state.availableUris)
    console.log('Available URIs from query/state:', availableUris)
    console.log('Current URI index:', this.state.currentUriIndex)
    console.log('Custom bookmarks URL:', customBookmarksUrl)
    console.log('Will use DID discovery:', !customBookmarksUrl)
    console.log('StorageConfig cache status:', StorageConfig.getCachedStorageRoot())
    console.log('=======================================')
    console.log('Using enhanced storage provider with DID discovery')
    return {
      type: 'nosdav',
      isPrimary: true,
      customUrl: customBookmarksUrl,
      isCustomStorage: StorageConfig.isCustomStorage(),
      save: async data => {
        try {
          let url
          if (customBookmarksUrl) {
            // Use custom URL from TypeRegistrations/query params
            url = customBookmarksUrl
            console.log('🔗 SAVE: Using custom URL from TypeRegistrations/query params:', url)
          } else {
            // Use enhanced StorageConfig for intelligent URL building
            console.log('🔍 SAVE: Using DID discovery via StorageConfig...')
            url = await getBookmarksUrl()
            console.log('🎯 SAVE: DID-discovered URL:', url)
          }

          const response = await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          })

          if (!response.ok) throw new Error('Network response was not ok')
          console.log('Bookmarks saved to storage successfully')
          return true
        } catch (e) {
          console.error('Error saving to storage:', e)
          // Fall back to localStorage if storage fails
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('bookmarks', JSON.stringify(data))
              console.log('Bookmarks saved to localStorage as fallback')
              return true
            } catch (localErr) {
              console.error('Error saving to localStorage:', localErr)
            }
          }
          return false
        }
      },
      load: async () => {
        try {
          let url
          if (customBookmarksUrl) {
            // Use custom URL from TypeRegistrations/query params
            url = customBookmarksUrl
            console.log('🔗 LOAD: Using custom URI from TypeRegistrations/query params:', url)
          } else {
            // Use enhanced StorageConfig for intelligent URL building
            console.log('🔍 LOAD: Using DID discovery via StorageConfig...')
            url = await getBookmarksUrl()
            console.log('🎯 LOAD: DID-discovered URL:', url)
          }

          const response = await fetch(url)

          if (response.status === 404) {
            return []
          }

          if (!response.ok) throw new Error('Network response was not ok')
          const bookmarks = await response.json()
          return bookmarks
        } catch (e) {
          console.error('Error loading from storage:', e)
          // Try to load from localStorage if storage fails
          if (typeof localStorage !== 'undefined') {
            try {
              const data = localStorage.getItem('bookmarks')
              if (data) {
                console.log(
                  'Loaded bookmarks from localStorage as fallback'
                )
                return JSON.parse(data)
              }
            } catch (localErr) {
              console.error('Error loading from localStorage:', localErr)
            }
          }
          return []
        }
      }
    }
  }

  async saveBookmarks () {
    const storage = this.getStorageProvider()
    await storage.save(this.state.bookmarks)
    console.log(`Bookmarks saved to ${storage.type}`)
  }

  /* -------------------- BOOKMARK DATA METHODS -------------------- */
  // Load bookmarks from storage and ensure data integrity
  async loadBookmarks () {
    const storage = this.getStorageProvider()
    const bookmarks = await storage.load()

    // Ensure all bookmarks have the @type property and a category
    const updatedBookmarks = bookmarks.map(bookmark => ({
      ...bookmark,
      '@type': bookmark['@type'] || 'Bookmark',
      category: bookmark.category || 'Development'
    }))

    this.setState({ bookmarks: updatedBookmarks })
    console.log(`Bookmarks loaded from ${storage.type}`)

    // Save if any bookmarks were updated with @type or category
    if (JSON.stringify(bookmarks) !== JSON.stringify(updatedBookmarks)) {
      this.saveBookmarks()
    }
  }

  /* -------------------- EVENT HANDLERS -------------------- */
  // Handle form input changes for new bookmark form
  handleInputChange = e => {
    const { name, value } = e.target
    this.setState({
      newBookmark: {
        ...this.state.newBookmark,
        [name]: value
      }
    })
  }

  // Handle category filter selection change
  handleCategoryChange = e => {
    this.setState({ selectedCategory: e.target.value })
  }

  // Handle search input changes
  handleSearchChange = e => {
    this.setState({ searchQuery: e.target.value })
  }

  /* -------------------- BOOKMARK CRUD OPERATIONS -------------------- */
  // Add a new bookmark to the collection
  addBookmark = e => {
    e.preventDefault()
    const { title, url, category } = this.state.newBookmark

    if (!title || !url) return

    // Add http:// if missing for proper URL formatting
    let formattedUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      formattedUrl = 'https://' + url
    }

    const newBookmarks = [
      ...this.state.bookmarks,
      {
        id: Date.now(),
        title,
        url: formattedUrl,
        category,
        createdAt: new Date().toISOString(),
        read: false,
        '@type': 'Bookmark'
      }
    ]

    this.setState(
      {
        bookmarks: newBookmarks,
        newBookmark: {
          title: '',
          url: '',
          category: this.state.newBookmark.category // Preserve selected category
        }
      },
      () => this.saveBookmarks()
    )
  }

  // Remove a bookmark by ID
  removeBookmark = id => {
    const bookmarks = this.state.bookmarks.filter(
      bookmark => bookmark.id !== id
    )
    this.setState({ bookmarks }, () => this.saveBookmarks())
  }

  // Toggle the read status of a bookmark
  toggleReadStatus = id => {
    const bookmarks = this.state.bookmarks.map(bookmark =>
      bookmark.id === id
        ? { ...bookmark, read: !bookmark.read }
        : bookmark
    )
    this.setState({ bookmarks }, () => this.saveBookmarks())
  }

  /* -------------------- UTILITY METHODS -------------------- */
  // Open the current storage file in a new browser tab
  openStorageFile = async () => {
    const availableUris = this.state.availableUris
    const customBookmarksUrl =
      availableUris[this.state.currentUriIndex] || null

    if (customBookmarksUrl) {
      window.open(customBookmarksUrl, '_blank')
    } else {
      try {
        const url = await getBookmarksUrl()
        if (url) {
          window.open(url, '_blank')
        } else {
          alert('Unable to determine storage file location.')
        }
      } catch (error) {
        console.error('Error building storage URL:', error)
        alert('Unable to determine storage file location.')
      }
    }
  }

  // Handle URI selection change from dropdown
  handleUriChange = e => {
    const newIndex = parseInt(e.target.value, 10)
    this.setState({ currentUriIndex: newIndex }, () => {
      // Reload bookmarks from the newly selected URI
      this.loadBookmarks()
    })
  }

  // Filter bookmarks based on category and search query
  getFilteredBookmarks () {
    const { bookmarks, selectedCategory, searchQuery } = this.state

    return bookmarks.filter(bookmark => {
      // Filter by category
      const categoryMatch =
        selectedCategory === 'All Categories' ||
        bookmark.category === selectedCategory

      // Filter by search query (searches both title and URL)
      const searchMatch =
        !searchQuery ||
        bookmark.title
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        bookmark.url.toLowerCase().includes(searchQuery.toLowerCase())

      return categoryMatch && searchMatch
    })
  }

  /* -------------------- COMPONENT RENDERING -------------------- */
  render () {
    const storage = this.getStorageProvider()
    const filteredBookmarks = this.getFilteredBookmarks()

    // Determine UI state based on available URIs and storage configuration
    const hasMultipleUris = this.state.availableUris.length > 1
    const showUriSelector = this.state.availableUris.length > 0
    const customBookmarksUrl =
      this.state.availableUris[this.state.currentUriIndex] || null
    const isUsingCustomUrl = !!customBookmarksUrl

    return html`
        <div class="min-h-screen flex flex-col">
          <${Navbar} />

          <main class="container mx-auto px-4 py-6 flex-grow max-w-6xl">
            <div class="text-left mb-8">
              <h1
                class="text-3xl font-bold mb-1"
                style="color: var(--text-dark);"
              >
                Bookmarks
              </h1>
              <p class="text-base text-gray-500">
                Organize and access your favorite websites
              </p>
              ${storage.type === 'nosdav'
        ? html`<div
                        class="mt-2 text-sm text-blue-600 bg-blue-50 rounded-md px-3 py-1 inline-block"
                      >
                        Using nosdav cloud storage
                        <button
                          onClick=${this.openStorageFile}
                          class="ml-2 text-blue-700 hover:text-blue-800 text-xs font-medium"
                          title="Open storage file in new tab"
                        >
                          View File
                        </button>
                      </div>`
        : html`<div
                        class="mt-2 text-sm text-yellow-600 bg-yellow-50 rounded-md px-3 py-1 inline-block"
                      >
                        Using ${storage.type} storage (nosdav not available)
                      </div>`}
            </div>

            ${showUriSelector
        ? html`
                      <div class="mb-6">
                        <div class="flex items-center">
                          <label class="mr-3 text-sm font-medium text-gray-700">
                            Bookmark List:
                          </label>
                          <div class="relative flex-grow max-w-xs">
                            <select
                              onChange=${this.handleUriChange}
                              value=${this.state.currentUriIndex}
                              class="categories-dropdown w-full appearance-none focus:outline-none focus:ring-2 focus:border-blue-500 cursor-pointer"
                            >
                              ${this.state.availableUris.map((uri, index) => {
          let displayName

          // Check if we have a TypeRegistration for this URI
          const typeReg =
            this.state.typeRegistrations[index]
          if (typeReg) {
            // Extract the name from the instance path
            const instancePath = typeReg.instance
            const pathParts = instancePath.split('/')
            // Get the filename without extension
            const filename =
              pathParts[pathParts.length - 1]
            displayName = filename.replace('.json', '')
            // Capitalize first letter
            displayName =
              displayName.charAt(0).toUpperCase() +
              displayName.slice(1)
          } else {
            // Fall back to the old method for query string URIs
            const filename = uri.split('/').pop() || uri
            displayName = filename.replace('.json', '')
          }

          return html`
                                  <option value=${index} key=${index}>
                                    ${displayName}
                                  </option>
                                `
        })}
                            </select>
                          </div>
                        </div>
                      </div>
                    `
        : ''}

            <div class="flex justify-between items-center mb-6">
              <select
                class="categories-dropdown"
                value=${this.state.selectedCategory}
                onChange=${this.handleCategoryChange}
              >
                <option value="All Categories">All Categories</option>
                ${DEFAULT_CATEGORIES.map(
          category =>
            html`<option value=${category}>${category}</option>`
        )}
              </select>

              <div class="relative">
                <input
                  type="text"
                  placeholder="Search bookmarks..."
                  class="search-input"
                  value=${this.state.searchQuery}
                  onInput=${this.handleSearchChange}
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 absolute right-3 top-2.5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              <button
                class="add-bookmark-btn"
                data-bs-toggle="modal"
                data-bs-target="#addBookmarkModal"
                onClick=${() => {
        document.getElementById('addBookmarkForm').style.display =
          document.getElementById('addBookmarkForm').style
            .display === 'none'
            ? 'block'
            : 'none'
      }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Bookmark
              </button>
            </div>

            <div id="addBookmarkForm" class="mb-8" style="display: none;">
              <div
                class="add-form rounded-lg shadow-sm p-6 border border-gray-200"
                style="border-radius: var(--radius-md);"
              >
                <div class="flex justify-between items-center mb-4">
                  <h2
                    class="text-lg font-semibold"
                    style="color: var(--text-dark);"
                  >
                    Add Bookmark
                  </h2>
                  <button
                    class="text-gray-400 hover:text-gray-600"
                    onClick=${() => {
        document.getElementById(
          'addBookmarkForm'
        ).style.display = 'none'
      }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <form onSubmit=${this.addBookmark} class="space-y-4">
                  <div>
                    <label
                      class="block text-sm font-medium text-gray-700 mb-1"
                    >Title</label
                    >
                    <input
                      type="text"
                      name="title"
                      value=${this.state.newBookmark.title}
                      onInput=${this.handleInputChange}
                      class="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Website name"
                      required
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-medium text-gray-700 mb-1"
                    >URL</label
                    >
                    <input
                      type="text"
                      name="url"
                      value=${this.state.newBookmark.url}
                      onInput=${this.handleInputChange}
                      class="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-medium text-gray-700 mb-1"
                    >Category</label
                    >
                    <select
                      name="category"
                      value=${this.state.newBookmark.category}
                      onInput=${this.handleInputChange}
                      class="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      ${DEFAULT_CATEGORIES.map(
        category =>
          html`<option value=${category}>
                                ${category}
                              </option>`
      )}
                    </select>
                  </div>
                  <div class="flex justify-end">
                    <button
                      type="button"
                      class="mr-2 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-md transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                      onClick=${() => {
        document.getElementById(
          'addBookmarkForm'
        ).style.display = 'none'
      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      class="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Save Bookmark
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div
              class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              ${filteredBookmarks.length === 0
        ? html`
                        <div
                          class="col-span-full text-center py-10 bg-white rounded-lg border border-gray-200"
                        >
                          <p class="text-gray-500">
                            No bookmarks found. Add your first one!
                          </p>
                        </div>
                      `
        : filteredBookmarks.map(
          bookmark => html`
                          <div
                            key=${bookmark.id}
                            class="bookmark-card bg-white rounded-lg overflow-hidden flex flex-col"
                          >
                            <div class="p-4">
                              <div
                                class="flex justify-between items-start mb-2"
                              >
                                <h3
                                  class="font-medium text-base truncate"
                                  style="color: var(--text-dark);"
                                >
                                  ${bookmark.title}
                                </h3>
                                <span
                                  class="ml-2 category-badge ${bookmark.category.toLowerCase()}"
                                >
                                  ${bookmark.category}
                                </span>
                              </div>
                              <a
                                href=${bookmark.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-gray-500 hover:text-blue-600 text-sm block truncate mb-3"
                              >
                                ${bookmark.url}
                              </a>
                              <div class="flex justify-between items-center">
                                <div class="flex space-x-2">
                                  <a
                                    href=${bookmark.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-gray-400 hover:text-blue-500 focus:outline-none"
                                    aria-label="Open bookmark"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-5 w-5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                    </svg>
                                  </a>
                                  <button
                                    onClick=${() =>
              this.removeBookmark(bookmark.id)}
                                    class="text-gray-400 hover:text-red-500 focus:outline-none"
                                    aria-label="Delete bookmark"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-5 w-5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        `
        )}
            </div>
          </main>

          <div class="mt-6 text-center text-sm text-gray-500">
            ${storage.type === 'nosdav'
        ? html`<div
                      class="rounded-full px-4 py-2 inline-flex items-center justify-center"
                      style="background-color: rgba(99, 192, 245, 0.1); color: var(--primary);"
                    >
                      ${isUsingCustomUrl
            ? html`
                            <span class="flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-1.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              ${this.state.typeRegistrations.length > 0
                ? 'Using registered bookmarks'
                : 'Using custom URI'}
                              ${hasMultipleUris
                ? html`<span
                                    class="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-white bg-opacity-30"
                                  >
                                    ${this.state.currentUriIndex + 1} of
                                    ${this.state.availableUris.length}
                                  </span>`
                : html`<span
                                    class="ml-1.5 text-xs opacity-80 italic"
                                    title="${customBookmarksUrl}"
                                    >(hover to see URI)</span
                                  >`}
                            </span>
                          `
            : html`
                            <span class="flex items-center">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-4 w-4 mr-1.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                                />
                              </svg>
                              ${StorageConfig.isCustomStorage()
                ? 'Using DID-discovered cloud storage'
                : 'Using nosdav cloud storage'}
                            </span>
                          `}
                      <button
                        onClick=${this.openStorageFile}
                        class="ml-3 text-white rounded-full px-2.5 py-1 text-xs flex items-center transition-all hover:bg-opacity-90"
                        style="background-color: var(--primary);"
                        title="Open storage file in new tab"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-3.5 w-3.5 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        View File
                      </button>
                    </div>`
        : html`<div
                      class="rounded-full px-4 py-2 inline-flex items-center"
                      style="background-color: rgba(255, 193, 7, 0.1); color: #b45309;"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 mr-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      Using ${storage.type} storage (nosdav not available)
                    </div>`}
          </div>

          <footer class="text-center py-4 text-gray-500 text-sm">
            <p>© ${new Date().getFullYear()} Bookmark Manager</p>
          </footer>
        </div>
        `
  }
}

/* ================================================================ */
/* -                DEFAULT BOOKMARKS & INITIALIZATION            - */
/* ================================================================ */
// Add default bookmarks if none exist to provide a better first experience
const addDefaultBookmarks = async () => {
  console.log('🎯 addDefaultBookmarks: Starting default bookmark initialization')

  try {
    // Create a temporary storage provider using DID discovery
    const storage = {
      load: async () => {
        try {
          console.log('📥 addDefaultBookmarks: Loading existing bookmarks via DID discovery')
          const url = await StorageConfig.buildUrl('public/bookmark/bookmark.json')
          console.log('🔗 addDefaultBookmarks: Using DID-discovered URL:', url)

          const response = await fetch(url)
          if (response.status === 404) {
            console.log('📭 addDefaultBookmarks: No existing bookmarks found (404)')
            return []
          }
          if (!response.ok) throw new Error('Network response was not ok')

          const bookmarks = await response.json()
          console.log('✅ addDefaultBookmarks: Found existing bookmarks:', bookmarks.length)
          return bookmarks
        } catch (e) {
          console.log('⚠️ addDefaultBookmarks: Error loading from storage, checking localStorage fallback')
          const data = localStorage.getItem('bookmarks')
          if (data) {
            console.log('💾 addDefaultBookmarks: Found localStorage backup')
            return JSON.parse(data)
          }
          console.log('📭 addDefaultBookmarks: No bookmarks found anywhere')
          return []
        }
      },
      save: async data => {
        try {
          console.log('💾 addDefaultBookmarks: Saving default bookmarks via DID discovery')
          const url = await StorageConfig.buildUrl('public/bookmark/bookmark.json')
          console.log('🔗 addDefaultBookmarks: Using DID-discovered URL:', url)

          await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.map(item => ({
              '@context': { '@vocab': 'urn:solid:' },
              ...item
            })))
          })
          console.log('✅ addDefaultBookmarks: Successfully saved default bookmarks to storage')
        } catch (e) {
          console.log('⚠️ addDefaultBookmarks: Error saving to storage, using localStorage fallback')
          localStorage.setItem('bookmarks', JSON.stringify(data))
        }
      }
    }

    const bookmarks = await storage.load()

    if (bookmarks.length === 0) {
      console.log('🆕 addDefaultBookmarks: Creating default bookmarks')
      const defaultBookmarks = [
      ]

      await storage.save(defaultBookmarks)
      console.log('✅ addDefaultBookmarks: Default bookmarks added successfully')
    } else {
      console.log('✨ addDefaultBookmarks: Existing bookmarks found, no defaults needed')
    }
  } catch (error) {
    console.error('❌ addDefaultBookmarks: Error during initialization:', error)
  }
}

/* ================================================================ */
/* -                    APPLICATION RENDERING                      - */
/* ================================================================ */
// Initialize default bookmarks and render the main application
addDefaultBookmarks().then(() => {
  render(html`<${BookmarkApp} />`, document.getElementById('app'))
})
