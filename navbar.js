// Import Preact and HTM from CDN
import { h, Component } from 'https://unpkg.com/preact@10.13.1/dist/preact.module.js';
import htm from 'https://unpkg.com/htm@3.1.1/dist/htm.module.js';
// Import SweetAlert and secp256k1 libraries
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';
import * as secp256k1 from 'https://cdn.jsdelivr.net/npm/@noble/secp256k1@1.7.1/+esm';

// Initialize htm with Preact
const html = htm.bind(h);

// Navbar component
class Navbar extends Component {
  constructor (props) {
    super(props);
    this.state = {
      isLoggedIn: localStorage.getItem('loggedIn') === 'true',
      pubkey: localStorage.getItem('pubkey') || null,
      privkey: localStorage.getItem('nostr:privkey') || null
    };
  }

  componentDidMount () {
    // Check if user is already logged in
    if (window.nostr && localStorage.getItem('pubkey')) {
      this.setState({
        isLoggedIn: true,
        pubkey: localStorage.getItem('pubkey')
      });
    }
  }

  handleLogin = async () => {
    const { value: loginMethod } = await Swal.fire({
      title: 'Login',
      html: `
        <button id="extensionLogin" class="swal2-confirm swal2-styled" style="display:block; width:100%; margin:10px auto;">Sign in with Nostr extension</button>
        <input id="privkeyInput" type="text" placeholder="Or enter your 64-character hex private key" class="swal2-input" style="display:block; width:100%; margin:10px auto;">
        <p style="margin-top: 10px; font-size: 0.9em;"><a href="https://nostrapps.github.io/extensions/" target="_blank">What is a Nostr extension?</a></p>
      `,
      showConfirmButton: false,
      showCloseButton: true,
      focusConfirm: false,
      didOpen: () => {
        const extensionButton = Swal.getPopup().querySelector('#extensionLogin');
        const privkeyInput = Swal.getPopup().querySelector('#privkeyInput');

        extensionButton.addEventListener('click', () => {
          Swal.clickConfirm();
        });

        privkeyInput.addEventListener('keyup', e => {
          if (e.key === 'Enter') {
            Swal.clickConfirm();
          }
        });

        // Add paste event listener
        privkeyInput.addEventListener('paste', e => {
          setTimeout(() => {
            if (
              privkeyInput.value.length === 64 &&
              /^[0-9a-fA-F]+$/.test(privkeyInput.value)
            ) {
              Swal.clickConfirm();
            }
          }, 0);
        });
      },
      preConfirm: () => {
        const privkey = Swal.getPopup().querySelector('#privkeyInput').value;
        if (
          privkey &&
          (privkey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privkey))
        ) {
          Swal.showValidationMessage(
            'Invalid private key format. Please enter a 64-character hex string.'
          );
          return false;
        }
        return {
          loginMethod: privkey ? 'privkey' : 'extension',
          privkey
        };
      }
    });

    if (loginMethod) {
      if (loginMethod.loginMethod === 'privkey') {
        this.loginWithPrivkey(loginMethod.privkey);
      } else {
        // Check for localStorage privkey first
        const storedPrivkey = localStorage.getItem('nostr:privkey');
        if (storedPrivkey) {
          this.loginWithPrivkey(storedPrivkey);
        } else {
          this.loginWithExtension();
        }
      }
    }
  }

  loginWithExtension = async () => {
    if (window.nostr) {
      try {
        const pubkey = await window.nostr.getPublicKey();
        this.setState({ isLoggedIn: true, pubkey }, () => {
          localStorage.setItem('loggedIn', 'true');
          localStorage.setItem('pubkey', pubkey);
          Swal.fire({
            title: 'Logged in!',
            text: 'You have successfully logged in with your Nostr extension.',
            icon: 'success',
            timer: 1000,
            showConfirmButton: false
          });
          if (this.props.onLogin) this.props.onLogin(pubkey);
        });
      } catch (error) {
        console.error('Login failed:', error);
        Swal.fire({
          title: 'Login Failed',
          text: 'There was an error logging in with your Nostr extension.',
          icon: 'error',
          timer: 1000,
          showConfirmButton: false
        });
      }
    } else {
      Swal.fire({
        title: 'Extension Not Found',
        text: 'Nostr extension not found. Please install a Nostr browser extension.',
        icon: 'warning',
        timer: 1000,
        showConfirmButton: false
      });
    }
  }

  loginWithPrivkey = async privkey => {
    if (privkey) {
      try {
        const pubkey = secp256k1.utils.bytesToHex(
          secp256k1.schnorr.getPublicKey(privkey)
        );
        this.setState({ isLoggedIn: true, pubkey, privkey }, () => {
          localStorage.setItem('loggedIn', 'true');
          localStorage.setItem('pubkey', pubkey);
          localStorage.setItem('nostr:privkey', privkey);
          Swal.fire({
            title: 'Logged in!',
            text: 'You have successfully logged in with your private key.',
            icon: 'success',
            timer: 1000,
            showConfirmButton: false
          });
          if (this.props.onLogin) this.props.onLogin(pubkey);
        });
      } catch (error) {
        console.error('Login failed:', error);
        Swal.fire({
          title: 'Login Failed',
          text: 'There was an error generating the public key from the provided private key.',
          icon: 'error',
          timer: 1000,
          showConfirmButton: false
        });
      }
    }
  }

  handleLogout = () => {
    this.setState({ isLoggedIn: false, pubkey: null, privkey: null });
    localStorage.setItem('loggedIn', 'false');
    localStorage.removeItem('pubkey');
    localStorage.removeItem('nostr:privkey');

    // Clear the textarea if it exists
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.value = '';
    }

    Swal.fire({
      title: 'Logged out!',
      text: 'You have successfully logged out.',
      icon: 'success',
      timer: 1000,
      showConfirmButton: false
    });

    // Call the onLogout prop if provided
    if (this.props.onLogout) this.props.onLogout();
  }

  render () {
    const { isLoggedIn, pubkey } = this.state;
    const displayText = isLoggedIn && pubkey ? pubkey.substring(0, 8) : 'Login';

    return html`
      <nav class="w-full py-4 bg-gradient-to-r from-blue-100 to-purple-100 shadow-md">
        <div class="container mx-auto px-4">
          <div class="flex justify-between items-center">
            <a 
              href="index.html" 
              class="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600 hover:from-purple-500 hover:to-blue-600 transition-all duration-300 transform hover:scale-105"
            >
              Home
            </a>
            <button
              onClick=${isLoggedIn ? this.handleLogout : this.handleLogin}
              class="px-4 py-2 rounded-md bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium hover:from-purple-500 hover:to-blue-600 transition-all duration-300 transform hover:scale-105"
            >
              ${isLoggedIn ? `Logout (${displayText})` : 'Login'}
            </button>
          </div>
        </div>
      </nav>
    `;
  }
}

export default Navbar; 