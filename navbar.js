// Import Preact and HTM from CDN
import { h, render, Component } from 'https://unpkg.com/preact@10.13.1/dist/preact.module.js';
import htm from 'https://unpkg.com/htm@3.1.1/dist/htm.module.js';

// Initialize htm with Preact
const html = htm.bind(h);

// Navbar component
class Navbar extends Component {
  constructor () {
    super();
    this.state = {
      isLoggedIn: false,
      publicKey: ''
    };
    this.loginWithNostr = this.loginWithNostr.bind(this);
    this.logout = this.logout.bind(this);
  }

  async loginWithNostr () {
    try {
      // Check if nostr is available in window
      if (!window.nostr) {
        alert('Nostr extension not found. Please install a Nostr extension.');
        return;
      }

      // Request public key from nostr
      const publicKey = await window.nostr.getPublicKey();

      this.setState({
        isLoggedIn: true,
        publicKey: publicKey
      });
    } catch (error) {
      console.error('Error logging in with Nostr:', error);
      alert('Failed to login with Nostr. Please try again.');
    }
  }

  logout () {
    this.setState({
      isLoggedIn: false,
      publicKey: ''
    });
  }

  render () {
    const { isLoggedIn, publicKey } = this.state;
    const truncatedKey = publicKey ? publicKey.substring(0, 8) + '...' : '';

    return html`
      <nav class="w-full bg-gradient-to-r from-blue-100 to-purple-100 shadow-md transition-all duration-300 hover:shadow-lg">
        <div class="container mx-auto px-4 py-3">
          <div class="flex justify-between items-center">
            <a 
              href="index.html" 
              class="text-blue-600 font-bold text-xl transition-all duration-300 hover:scale-105 hover:text-purple-600"
            >
              Home
            </a>
            
            <div>
              ${isLoggedIn
        ? html`<button 
                    onClick=${this.logout}
                    class="text-gray-700 font-medium px-4 py-2 rounded-lg transition-all duration-300 hover:bg-gray-200"
                  >
                    ${truncatedKey}
                  </button>`
        : html`<button 
                    onClick=${this.loginWithNostr}
                    class="bg-purple-600 text-white px-4 py-2 rounded-lg transition-all duration-300 hover:bg-blue-600"
                  >
                    Login with Nostr
                  </button>`
      }
            </div>
          </div>
        </div>
      </nav>
    `;
  }
}

// Render the navbar to a DOM element with id "navbar"
// Make sure you have a div with id="navbar" in your HTML
const navbarContainer = document.getElementById('navbar');
if (navbarContainer) {
  render(html`<${Navbar} />`, navbarContainer);
}

// Export the component for potential reuse
export default Navbar; 