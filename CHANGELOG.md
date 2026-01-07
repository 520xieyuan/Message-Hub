# Changelog

This file documents all important changes to the project.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned Features
- Incremental message synchronization
- Full-text search indexing
- Enhanced caching strategies

---

## [1.1.0] - 2025-12-19

### Added

#### Lark (Feishu) Platform Support
- **Complete OAuth authentication flow** - Support for OAuth 2.0 authentication with Lark enterprise applications
- **Message search functionality** - Implemented search through "fetch messages + local filtering" approach
- **Real-time search progress** - Display search progress bar and status in frontend
- **Configurable search scope** - Support for limiting search conversation count, page count, and time range
- **Multi-platform concurrent search** - Support for simultaneous search across Gmail + Slack + Lark

#### Search Enhancements
- **Exponential backoff retry mechanism** - Intelligent handling of API rate limiting and temporary errors
- **Detailed error code handling** - Handling strategies for Lark-specific error codes
- **Early stopping mechanism** - Automatically stop search when maximum result count is reached
- **Search progress component** - `LarkSearchProgress` component for real-time search status display

### Improved

#### Performance Optimization
- **Conversation list caching** - 5-minute TTL, avoid duplicate requests
- **Message content caching** - Up to 1000 entries, avoid duplicate conversions
- **Concurrency control** - Maximum 5 concurrent conversation searches, avoid API rate limiting

#### Code Quality
- **Complete unit tests** - 52 test cases
- **Integration tests** - 18 test cases
- **End-to-end tests** - 11 test cases
- **Performance tests** - 7 test cases
- **UI tests** - 21 test cases

### Documentation

- **LARK_DEPLOYMENT.md** - Lark application deployment guide
- **LARK_SEARCH_IMPLEMENTATION.md** - Detailed search implementation documentation
- **LARK_IMPLEMENTATION_TASKS.md** - Implementation task checklist
- **Updated README.md** - Added Lark platform description
- **Updated CLAUDE.md** - Added Lark adapter description
- **Updated adapter README** - Complete LarkAdapter documentation
- **Enhanced JSDoc comments** - Improved API documentation

### Known Limitations

- **Search performance** - Lark search requires traversing all conversations, may be slow with many conversations
- **No native search** - Lark API does not support advanced query syntax (due to API limitations)
- **Initial search** - May take 10-30 seconds (depending on conversation count)

### Performance Metrics

| Scenario | Conversations | Estimated Time |
|----------|--------------|----------------|
| Light | 10 | ~5 seconds |
| Medium | 50 | ~20 seconds |
| Heavy | 100 | ~60 seconds |

### Technical Details

#### New Dependencies
- `@larksuiteoapi/node-sdk` - Lark Node.js SDK

#### New Type Definitions
- `LarkSearchConfig` - Search configuration interface
- `LarkSearchProgress` - Search progress interface

#### New Components
- `LarkSearchProgress.tsx` - Search progress display component

#### New Test Files
- `LarkAdapter.test.ts` - Unit tests
- `LarkAdapter.integration.test.ts` - Integration tests
- `LarkAdapter.performance.test.ts` - Performance tests
- `MessageCard.test.tsx` - UI tests
- `SearchPage.test.tsx` - Page tests

---

## [1.0.0] - 2025-12-01

### Added

- **Gmail platform support** - Email search and multi-account management
- **Slack platform support** - Workspace messages and channel search
- **Unified search interface** - Search multiple platforms in a single interface
- **OAuth authentication** - Secure OAuth 2.0 authentication flow
- **Chrome Profile management** - Multi-account browser isolation
- **Deep linking** - Jump directly to original messages

### Tech Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Desktop Framework**: Electron 25+
- **Build Tools**: Vite + electron-builder
- **State Management**: Zustand
- **Secure Storage**: electron-store + keytar

---

## Version Comparison

| Version | Gmail | Slack | Lark | Multi-Account | Progress Display |
|---------|-------|-------|------|---------------|------------------|
| 1.0.0 | ✅ | ✅ | ❌ | ✅ | ❌ |
| 1.1.0 | ✅ | ✅ | ✅ | ✅ | ✅ (Lark) |

---

## Upgrade Guide

### Upgrading from 1.0.0 to 1.1.0

1. **Install new dependencies**
   ```bash
   npm install @larksuiteoapi/node-sdk
   ```

2. **Update OAuth Server**
   - Add Lark OAuth application configuration in management page
   - Configure Lark application Client ID and Secret

3. **Configure Lark application**
   - Refer to [LARK_DEPLOYMENT.md](docs/LARK_DEPLOYMENT.md)

4. **Restart application**
   ```bash
   npm run dev
   ```

---

## Contributors

Thanks to all the people who have contributed to this project.

---

[Unreleased]: https://github.com/your-repo/cross-platform-message-search/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/your-repo/cross-platform-message-search/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/your-repo/cross-platform-message-search/releases/tag/v1.0.0
