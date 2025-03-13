#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Parse command line arguments
let port = 3313; // New default port
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--port') {
    if (i + 1 < args.length) {
      const portArg = parseInt(args[i + 1], 10);
      if (!isNaN(portArg)) {
        port = portArg;
      }
      i++; // Skip the next argument since we've used it
    }
  }
}

// Use environment variable as fallback if provided
port = process.env.PORT || port;

// MIME types for different file extensions
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf'
};

// Create the server
const server = http.createServer((req, res) => {
  // Parse the URL
  const parsedUrl = url.parse(req.url);

  // Extract the path from the URL
  let pathname = path.join(process.cwd(), parsedUrl.pathname);

  // If the path ends with '/', serve index.html
  if (pathname.endsWith('/')) {
    pathname = path.join(pathname, 'index.html');
  }

  // If the path doesn't specify a file, try to serve index.html
  if (!path.extname(pathname)) {
    pathname = path.join(pathname, 'index.html');
  }

  // Get the file extension
  const ext = path.extname(pathname);

  // Check if the file exists
  fs.stat(pathname, (err, stats) => {
    if (err) {
      // If the file doesn't exist, serve index.html
      if (err.code === 'ENOENT') {
        const indexPath = path.join(process.cwd(), 'index.html');
        fs.readFile(indexPath, (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.end(`File not found: ${indexPath}`);
            return;
          }

          res.setHeader('Content-Type', 'text/html');
          res.end(data);
        });
        return;
      }

      // For other errors, return 500
      res.statusCode = 500;
      res.end(`Error: ${err.code}`);
      return;
    }

    // If it's a directory, try to serve index.html from that directory
    if (stats.isDirectory()) {
      const indexPath = path.join(pathname, 'index.html');
      fs.readFile(indexPath, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end(`File not found: ${indexPath}`);
          return;
        }

        res.setHeader('Content-Type', 'text/html');
        res.end(data);
      });
      return;
    }

    // Read the file
    fs.readFile(pathname, (err, data) => {
      if (err) {
        res.statusCode = 500;
        res.end(`Error reading file: ${err.code}`);
        return;
      }

      // Set the content type based on the file extension
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.end(data);
    });
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
  console.log(`Serving files from: ${process.cwd()}`);
  console.log(`Use -p or --port to specify a different port (default: 3222)`);
}); 