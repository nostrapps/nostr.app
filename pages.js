/**
 * pages.js - JavaScript for the Markdown-based wiki page editor
 * 
 * This file provides functionality for the page editor system, handling
 * storage and rendering of Markdown pages.
 * 
 * Referenced by: pages.html
 */

// Add a random version to prevent caching
console.log('Loading page editor v' + Math.random())

/* ---------------------------------------------------------------- */
/* -                      IMPORTS & SETUP                         - */
/* ---------------------------------------------------------------- */
// Import navbar and nosdav shim
import Navbar from './navbar.js'
import './nosdav-shim.js'
import * as secp256k1 from 'https://cdn.jsdelivr.net/npm/@noble/secp256k1@1.7.1/+esm'

// Make secp256k1 available globally (required by nosdav-shim.js)
window.secp256k1 = secp256k1

/* ---------------------------------------------------------------- */
/* -                 MARKDOWN & WIKI EXTENSIONS                   - */
/* ---------------------------------------------------------------- */
// Configure Marked to recognize wiki-links [[foo]]
const wikiLinkExtension = {
  name: 'wikiLink',
  level: 'inline',
  start (src) {
    return src.match(/\[\[/)?.index
  },
  tokenizer (src) {
    const rule = /^\[\[([^\[\]]+)\]\]/
    const match = rule.exec(src)
    if (match) {
      return {
        type: 'wikiLink',
        raw: match[0],
        text: match[1].trim(),
        tokens: []
      }
    }
    return undefined
  },
  renderer (token) {
    const pageName = token.text
    console.log('Wiki link pageName:', pageName)

    // Use the consistent utility function for safe file names
    const safePageName = PageUtils.toSafeFilename(pageName)
    console.log('Wiki link safePageName:', safePageName)

    const href = `../pages/${safePageName}.md`
    return `<a href="#" class="wiki-link" data-page="${pageName}">[[${pageName}]]</a>`
  }
}

// Add the extension to marked
marked.use({ extensions: [wikiLinkExtension] })

// Initialize the navbar
const navbarContainer = document.getElementById('navbar')
if (navbarContainer) {
  preact.render(preact.h(Navbar), navbarContainer)
}

// Initialize HTM with Preact
const html = htm.bind(preact.h)
const { useState, useEffect, useRef, useCallback } = preactHooks

/* ---------------------------------------------------------------- */
/* -                        CONSTANTS                             - */
/* ---------------------------------------------------------------- */
// View modes
const VIEW_MODES = {
  SPLIT: 'split',
  EDITOR: 'editor',
  PREVIEW: 'preview'
}

/* ---------------------------------------------------------------- */
/* -                      UTILITY FUNCTIONS                       - */
/* ---------------------------------------------------------------- */
// Storage configuration
const StorageConfig = {
  _cachedStorageRoot: null,
  _cacheExpiry: null,
  _cacheDuration: 5 * 1440 * 1000, // 5 days
  _isCustomStorage: false,

  // Get the root URL for nosdav storage
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

        // Handle case where serviceEndpoint is an array (as in the example)
        if (Array.isArray(endpoint)) {
          endpoint = endpoint[0]
        }

        // Handle case where serviceEndpoint is a JSON string (as in the example)
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
  }
}

// Utility functions for page name to file path conversion
const PageUtils = {
  // Convert a page name to a safe file path
  toSafeFilename (pageName) {
    console.log('Converting filename:', pageName)
    // IMPORTANT: Only replace slashes with triple underscores, preserve all other characters
    const result = pageName.replace(/\//g, '___')
    console.log('Result after conversion:', result)
    return result
  },

  // Get the full path for a page name
  getPagePath (pageName) {
    const safePageName = this.toSafeFilename(pageName)
    const path = `public/pages/${safePageName}.md`
    console.log('Final path:', path)
    return path
  }
}

/* ---------------------------------------------------------------- */
/* -                     STORAGE UTILITIES                        - */
/* ---------------------------------------------------------------- */
// Page storage utilities
const PageStorage = {
  getPagePath (pageName) {
    // Use the utility function for consistent path handling
    console.log('Getting path for page:', pageName)
    return PageUtils.getPagePath(pageName)
  },

  async savePage (pageName, content) {
    console.log('Saving page with name:', pageName)
    const path = this.getPagePath(pageName)
    console.log('Using file path:', path)

    try {
      // Save to nosdav
      const pubkey = localStorage.getItem('pubkey')
      if (!pubkey) {
        console.error('No pubkey found for nosdav storage')
        // Fallback to localStorage
        localStorage.setItem(`page_${pageName}`, content)
        this.updatePageIndex(pageName)
        return pageName
      }

      const url = await StorageConfig.buildUrl(path)
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/markdown'
        },
        body: content
      })

      if (!response.ok) throw new Error('Network response was not ok')
      console.log('Page saved to nosdav successfully')

      // Update index in both nosdav and localStorage
      this.updatePageIndex(pageName)
      return pageName
    } catch (e) {
      console.error('Error saving to nosdav:', e)
      // Fall back to localStorage
      localStorage.setItem(`page_${pageName}`, content)
      this.updatePageIndex(pageName)
      return pageName
    }
  },

  async getPage (pageName) {
    console.log('Getting page with name:', pageName)
    const path = this.getPagePath(pageName)
    console.log('Looking up file path:', path)

    try {
      // Try to get from nosdav
      const pubkey = localStorage.getItem('pubkey')
      if (!pubkey) {
        console.error('No pubkey found for nosdav storage')
        // Fallback to localStorage
        return localStorage.getItem(`page_${pageName}`) || ''
      }

      const url = await StorageConfig.buildUrl(path)
      console.log('Fetching from URL:', url)
      const response = await fetch(url)

      if (response.status === 404) {
        console.log('Page not found (404)')
        return ''
      }

      if (!response.ok) throw new Error('Network response was not ok')
      const content = await response.text()
      return content
    } catch (e) {
      console.error('Error loading from nosdav:', e)
      // Try to load from localStorage
      return localStorage.getItem(`page_${pageName}`) || ''
    }
  },

  async updatePageIndex (pageName) {
    let index = await this.getPageIndex()
    if (!index.includes(pageName)) {
      index.push(pageName)

      try {
        // Save index to nosdav
        const pubkey = localStorage.getItem('pubkey')
        if (pubkey) {
          const url = await StorageConfig.buildUrl('public/pages/index.json')
          await fetch(url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(index)
          })
        }
      } catch (e) {
        console.error('Error saving index to nosdav:', e)
      }

      // Also save to localStorage as backup
      localStorage.setItem('page_index', JSON.stringify(index))
    }
  },

  async getPageIndex () {
    try {
      // Try to get index from nosdav
      const pubkey = localStorage.getItem('pubkey')
      if (pubkey) {
        const url = await StorageConfig.buildUrl('public/pages/index.json')
        const response = await fetch(url)

        if (response.ok) {
          const index = await response.json()
          return index
        }
      }
    } catch (e) {
      console.error('Error loading index from nosdav:', e)
    }

    // Fallback to localStorage
    const index = localStorage.getItem('page_index')
    return index ? JSON.parse(index) : []
  }
}

/* ---------------------------------------------------------------- */
/* -                     PAGE EDITOR COMPONENT                    - */
/* ---------------------------------------------------------------- */
// Page Editor Component
function PageEditor () {
  const [currentPage, setCurrentPage] = useState('index')
  const [pageInput, setPageInput] = useState('index')
  const [content, setContent] = useState('')
  const [savedStatus, setSavedStatus] = useState('')
  const [pageEntries, setPageEntries] = useState([])
  const [storageType, setStorageType] = useState('')
  const [viewMode, setViewMode] = useState(VIEW_MODES.SPLIT)
  const editorRef = useRef(null)
  const previewContainerRef = useRef(null)
  const saveTimeoutRef = useRef(null)

  /* -------------------- LIFECYCLE & EFFECTS -------------------- */
  // Load page content
  useEffect(() => {
    const loadContent = async () => {
      const savedContent = await PageStorage.getPage(currentPage)
      setContent(savedContent)
      setPageInput(currentPage)
      const pubkey = localStorage.getItem('pubkey')
      setStorageType(pubkey ? 'nosdav' : 'local')
      await loadPageEntries()

      // Focus editor when page changes
      if (editorRef.current) {
        editorRef.current.focus()
      }
    }

    loadContent()
  }, [currentPage])

  // Check for page parameter in URL on initial load
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search)
    const pageParam = queryParams.get('page')
    if (pageParam) {
      setCurrentPage(pageParam)
    }
  }, [])

  // Load saved view mode from localStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem('page_view_mode')
    if (
      savedViewMode &&
      Object.values(VIEW_MODES).includes(savedViewMode)
    ) {
      setViewMode(savedViewMode)
    }
  }, [])

  // Set up event listener for wiki links after the preview renders
  useEffect(() => {
    if (previewContainerRef.current) {
      const handleWikiLinkClick = e => {
        // Check if the clicked element is a wiki link
        if (e.target.classList.contains('wiki-link')) {
          e.preventDefault()
          const pageName = e.target.dataset.page
          console.log('Clicked wiki link for page:', pageName)
          if (pageName) {
            setCurrentPage(pageName)
          }
        }
      }

      // Add click event listener to the preview container
      previewContainerRef.current.addEventListener(
        'click',
        handleWikiLinkClick
      )

      // Clean up the event listener
      return () => {
        if (previewContainerRef.current) {
          previewContainerRef.current.removeEventListener(
            'click',
            handleWikiLinkClick
          )
        }
      }
    }
  }, [content, viewMode])

  /* -------------------- HELPER FUNCTIONS -------------------- */
  // Load all page entries
  const loadPageEntries = async () => {
    const entries = await PageStorage.getPageIndex()
    setPageEntries(entries)
  }

  // Handle content changes and auto-save
  const handleContentChange = e => {
    const newContent = e.target.value
    setContent(newContent)

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for auto-save
    setSavedStatus('Saving...')
    saveTimeoutRef.current = setTimeout(async () => {
      await PageStorage.savePage(currentPage, newContent)
      setSavedStatus('Saved')
      await loadPageEntries()

      // Clear saved status after 2 seconds
      setTimeout(() => {
        setSavedStatus('')
      }, 2000)
    }, 1000)
  }

  // Toggle view mode
  const toggleViewMode = mode => {
    setViewMode(mode)
    localStorage.setItem('page_view_mode', mode)
  }

  // Handle page input change
  const handlePageInputChange = e => {
    setPageInput(e.target.value)
  }

  // Navigate to page
  const navigateToPage = () => {
    if (pageInput.trim()) {
      console.log('Navigating to page:', pageInput.trim())
      setCurrentPage(pageInput.trim())
    }
  }

  // Handle Enter key in page input
  const handlePageInputKeyDown = e => {
    if (e.key === 'Enter') {
      navigateToPage()
    }
  }

  // Load a specific page
  const loadPage = pageName => {
    setCurrentPage(pageName)
  }

  // Check if a page is the current one
  const isCurrentPage = pageName => {
    return pageName === currentPage
  }

  // Open the current page file in a new tab
  const openStorageFile = async () => {
    const pubkey = localStorage.getItem('pubkey')
    if (pubkey) {
      const path = PageStorage.getPagePath(currentPage)
      const url = await StorageConfig.buildUrl(path)
      window.open(url, '_blank')
    } else {
      alert('No pubkey found. Cannot open storage file.')
    }
  }

  // Helper function to insert wiki link at cursor
  const insertWikiLink = () => {
    if (!editorRef.current) return

    const textarea = editorRef.current
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = textarea.value.substring(start, end)

    // Prepare the wiki link text - either use selection or prompt for a hierarchical page name
    let linkText
    if (selectedText) {
      linkText = selectedText
    } else {
      linkText = prompt(
        'Enter page name (can use foo/bar format):',
        'page-name'
      )
      if (!linkText) return // User canceled the prompt
    }

    const wikiLink = `[[${linkText}]]`

    // Insert the wiki link at the cursor position
    const newContent =
      textarea.value.substring(0, start) +
      wikiLink +
      textarea.value.substring(end)

    setContent(newContent)

    // Focus and set cursor position after the inserted text
    setTimeout(() => {
      textarea.focus()
      const newPosition = start + wikiLink.length
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  // Main class for the editor/preview container based on view mode
  const getMainClass = () => {
    switch (viewMode) {
      case VIEW_MODES.EDITOR:
        return 'main editor-only'
      case VIEW_MODES.PREVIEW:
        return 'main preview-only'
      default:
        return 'main'
    }
  }

  /* -------------------- COMPONENT RENDERING -------------------- */
  return html`
    <div class="container">
      <div class="page-header">
        <div class="page-title">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            ></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Pages
          ${storageType === 'nosdav'
      ? html`<span class="storage-badge">Cloud</span>`
      : html`<span class="storage-badge">Local</span>`}

          <!-- View toggle icons -->
          <div class="view-toggle">
            <!-- Split view -->
            <div
              class="view-option ${viewMode === VIEW_MODES.SPLIT
      ? 'active'
      : ''}"
              onClick=${() => toggleViewMode(VIEW_MODES.SPLIT)}
              title="Split View"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                ></rect>
                <line x1="12" y1="3" x2="12" y2="21"></line>
              </svg>
            </div>

            <!-- Editor only view -->
            <div
              class="view-option ${viewMode === VIEW_MODES.EDITOR
      ? 'active'
      : ''}"
              onClick=${() => toggleViewMode(VIEW_MODES.EDITOR)}
              title="Editor View"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
                ></path>
              </svg>
            </div>

            <!-- Preview only view -->
            <div
              class="view-option ${viewMode === VIEW_MODES.PREVIEW
      ? 'active'
      : ''}"
              onClick=${() => toggleViewMode(VIEW_MODES.PREVIEW)}
              title="Preview View"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                ></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>

            <!-- Open in new tab (if using nosdav) -->
            ${storageType === 'nosdav' &&
    html`
              <div
                class="view-option"
                onClick=${openStorageFile}
                title="Open in New Tab"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                  ></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </div>
            `}

            <!-- Add Wiki Link button -->
            <div
              class="view-option"
              onClick=${insertWikiLink}
              title="Insert Wiki Link"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                ></path>
                <path
                  d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                ></path>
              </svg>
            </div>
          </div>
        </div>
        <div class="page-nav">
          <input
            type="text"
            class="page-input"
            value=${pageInput}
            onInput=${handlePageInputChange}
            onKeyDown=${handlePageInputKeyDown}
            placeholder="Enter page name..."
          />
          <button class="btn" onClick=${navigateToPage}>Go</button>
        </div>
      </div>

      <main class=${getMainClass()}>
        <div class="editor-container">
          <textarea
            ref=${editorRef}
            class="editor"
            value=${content}
            onInput=${handleContentChange}
            placeholder="Write in Markdown format..."
          ></textarea>
          ${savedStatus &&
    html`
            <div class="save-indicator">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              ${savedStatus}
            </div>
          `}
        </div>

        <div class="preview-container" ref=${previewContainerRef}>
          <div
            class="preview"
            dangerouslySetInnerHTML=${{ __html: marked.parse(content) }}
          ></div>
        </div>
      </main>

      <div class="recent-pages">
        <h3>Recent Pages</h3>
        <div class="page-list">
          ${pageEntries
      .slice(-10)
      .reverse()
      .map(pageName => {
        return html`
                <div
                  class="page-item ${isCurrentPage(pageName)
            ? 'active'
            : ''}"
                  onClick=${() => loadPage(pageName)}
                >
                  ${pageName}
                </div>
              `
      })}
        </div>
      </div>

      <footer class="footer">
        <p>Pages - A simple Markdown editor for your notes</p>
      </footer>
    </div>
  `
}

/* ---------------------------------------------------------------- */
/* -                    APPLICATION RENDERING                      - */
/* ---------------------------------------------------------------- */
// Render the app
preact.render(html`<${PageEditor} />`, document.getElementById('app')) 