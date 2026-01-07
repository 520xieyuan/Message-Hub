# Cross-Platform Message Search Application

An Electron-based desktop application that provides a unified message search experience across multiple messaging platforms including Slack, Gmail, Lark, and more.

## Features

- 🔍 **Unified Search**: Search across multiple messaging platforms in a single interface
- 🚀 **Fast Response**: Return search results within 3 seconds
- 🔐 **Secure Authentication**: Support for OAuth 2.0 secure authentication
- 🎯 **Precise Filtering**: Filter by time, sender, platform, and more
- 🔗 **Deep Linking**: Jump directly to original message sources
- 💾 **Smart Caching**: Enhanced search performance and user experience

## Supported Platforms

- **Slack**: Workspace messages and channel search
- **Gmail**: Email content and attachment search
- **Lark (Feishu)**: Enterprise messaging and group search
  - Support for all conversation types (direct messages, groups)
  - Smart local filtering (due to Lark API not supporting native search)
  - Real-time search progress display
  - Configurable search scope limits

## Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Desktop Framework**: Electron 25+
- **Build Tools**: Vite + electron-builder
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Secure Storage**: electron-store + keytar

## Development Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

This will start both the Vite development server and the Electron application.

### Build Application

```bash
# Build for all platforms
npm run build:all

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## Deployment

### Desktop Application
Use the standard Electron build process:
```bash
npm run build
npm run build:win  # or build:mac, build:linux
```

Distributable files will be in the `release/` directory.

### OAuth Server (Optional)

The OAuth callback server is required for Gmail, Slack, and Lark authentication.

**Requirements:**
- Node.js 16+
- MariaDB/MySQL database

**Quick Start:**
```bash
cd oauth-server
npm install

# Configure database in .env (see .env.example)
cp .env.example .env
# Edit .env with your database credentials

# Start the server
npm start
```

The OAuth server will run on `http://localhost:3000` by default. See `oauth-server/README.md` for detailed configuration.

## Project Structure

```
├── src/                    # React frontend code
│   ├── components/         # React components
│   ├── services/          # Business logic services
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── electron/              # Electron main process code
│   ├── main.ts           # Main process entry
│   ├── preload.ts        # Preload script
│   └── utils/            # Main process utilities
├── dist/                  # Build output directory
└── release/              # Package output directory
```

## Configuration

Application configuration files are located in the user data directory:
- Windows: `%APPDATA%/cross-platform-message-search/`
- macOS: `~/Library/Application Support/cross-platform-message-search/`
- Linux: `~/.config/cross-platform-message-search/`

### Platform-Specific Configuration

#### Lark

The Lark platform requires creating an enterprise application and configuring OAuth:

1. **Create Lark App**: Go to [Lark Open Platform](https://open.larksuite.com/) to create an enterprise self-built application
2. **Configure Permissions**: Request `im:chat:readonly` and `im:message:readonly` permissions
3. **Set Callback URL**: Configure OAuth callback address (default: `http://localhost:3000/callback/lark`)
4. **Get Credentials**: Copy App ID and App Secret to the OAuth Server management page

For detailed deployment guide, please refer to [LARK_DEPLOYMENT.md](docs/LARK_DEPLOYMENT.md)

## Contributing

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter issues or have feature suggestions, please submit them in [Issues](https://github.com/your-repo/cross-platform-message-search/issues).
