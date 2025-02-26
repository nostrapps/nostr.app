// Import Preact and HTM from CDN
import { h, render, Component } from 'https://unpkg.com/preact@10.13.1/dist/preact.module.js';
import htm from 'https://unpkg.com/htm@3.1.1/dist/htm.module.js';

// Initialize htm with Preact
const html = htm.bind(h);

// Navbar component
class Navbar extends Component {
  render () {
    return html`
      <nav class="w-full bg-gradient-to-r from-blue-100 to-purple-100 shadow-md transition-all duration-300 hover:shadow-lg">
        <div class="container mx-auto px-4 py-3">
          <div class="flex justify-center items-center">
            <a 
              href="index.html" 
              class="text-blue-600 font-bold text-xl transition-all duration-300 hover:scale-105 hover:text-purple-600"
            >
              Home
            </a>
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