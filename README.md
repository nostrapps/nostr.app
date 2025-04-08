# Nostr Apps Collection

A collection of web applications built for the Nostr protocol ecosystem. These applications provide various utilities and tools for Nostr users and developers.

## 📋 Applications

| Application       | Description                           | URL                                              |
| ----------------- | ------------------------------------- | ------------------------------------------------ |
| **Todo App**      | Track your tasks and stay organized   | [Todo App](https://nostr.app/todo.html)          |
| **Bookmarks**     | Save and organize your favorite links | [Bookmarks](https://nostr.app/bookmark.html)     |
| **Pastebin**      | Share code and text snippets          | [Pastebin](https://nostr.app/pastebin.html)      |
| **Hello World**   | Simple starter application            | [Hello World](https://nostr.app/helloworld.html) |
| **Profile**       | Manage your user profile              | [Profile](https://nostr.app/profile.html)        |
| **Key Generator** | Create a new Nostr identity and keys  | [Key Generator](https://nostr.app/keygen.html)   |
| **Mindstr**       | Mind mapping tool for Nostr           | [Mindstr](https://nostr.app/mindstr.html)        |

## 🛠️ Technologies

These applications are built using:

- HTML, CSS, JavaScript
- Tailwind CSS for styling
- Preact for UI components
- Nostr protocol integration

## 🚀 Getting Started

To run any of these applications locally:

1. Clone this repository
2. Open the desired HTML file in your browser
3. No build process required - everything runs in the browser!

## 📱 Features

- Modern, responsive UI design
- Client-side processing for enhanced privacy
- Integration with Nostr protocol
- No server-side dependencies

## 📄 License

This project is licensed under the **Agentic Source License (ASL-1.0)**.

**Important**: This is **not** an open-source license. You must request and receive explicit permission or obtain a paid license from the agent or its owner to copy, modify, or distribute this software.

Key license points:

- Attribution required
- No proprietary enclosure
- Permission may be revoked if license conditions are violated
- No warranty or liability

For full license details, see the [LICENSE](LICENSE) file.

## 🤝 Contributing

Due to the licensing terms, contributions are by invitation only. Please contact the repository owner for permission before making any modifications.

## 📞 Contact

For questions, permissions, or more information, please reach out through the Nostr protocol or open an issue in this repository.

## Running as an Electron Desktop App

This app can also be run as a standalone desktop application using Electron.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. Clone this repository:

   ```
   git clone https://github.com/nostrapps/nostr.app.git
   cd nostr.app
   ```

2. Install dependencies:
   ```
   npm install
   ```

### Running the App

Start the application in development mode:

```
npm start
```

### Building the App

To build a distributable package:

```
npm run dist
```

This will create distribution packages in the `dist` directory.

### Building for specific platforms

- Windows: `npm run dist -- --win`
- macOS: `npm run dist -- --mac`
- Linux: `npm run dist -- --linux`
