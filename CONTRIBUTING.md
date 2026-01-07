# Contributing to Message Hub

Thank you for your interest in contributing to Message Hub! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment (see below)
4. Create a new branch for your changes
5. Make your changes and commit them
6. Push to your fork and submit a pull request

## Development Setup

### Prerequisites

- Node.js 16+ and npm
- Git
- For OAuth server: MariaDB/MySQL database

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/message-hub.git
cd message-hub

# Install dependencies
npm install

# Set up OAuth server (optional, for development with OAuth features)
cd oauth-server
npm install
cp .env.example .env
# Edit .env with your database credentials
npm start
cd ..

# Run the application in development mode
npm run dev
```

## How to Contribute

### Types of Contributions

We welcome various types of contributions:

- **Bug fixes**: Fix issues reported in the issue tracker
- **New features**: Implement new platform adapters or features
- **Documentation**: Improve or translate documentation
- **Tests**: Add or improve test coverage
- **Code quality**: Refactoring, performance improvements

### Development Workflow

1. **Check existing issues**: Look for existing issues or create a new one to discuss your changes
2. **Create a branch**: Use descriptive branch names (e.g., `fix/gmail-search-bug`, `feature/discord-adapter`)
3. **Make changes**: Write clean, well-documented code
4. **Test thoroughly**: Ensure all tests pass and add new tests for your changes
5. **Commit**: Write clear, descriptive commit messages
6. **Submit PR**: Create a pull request with a detailed description

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the existing code style (ESLint configuration)
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Avoid `any` types when possible

### Code Organization

- Place platform adapters in `electron/services/adapters/`
- Follow the existing adapter interface pattern
- Keep components small and focused
- Use proper TypeScript types and interfaces

### Naming Conventions

- Files: `PascalCase.ts` for classes, `camelCase.ts` for utilities
- Components: `PascalCase.tsx`
- Variables/Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces/Types: `PascalCase`

## Testing

We use Jest for testing. Please ensure:

- All new features have corresponding tests
- All tests pass before submitting a PR
- Maintain or improve code coverage

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run type-check
```

## Submitting Changes

### Pull Request Guidelines

1. **Title**: Use a clear, descriptive title
2. **Description**: Explain what changes you made and why
3. **Issue reference**: Link to related issues (e.g., "Fixes #123")
4. **Testing**: Describe how you tested your changes
5. **Screenshots**: Include screenshots for UI changes

### Commit Messages

Write clear commit messages:

```
feat: Add Discord platform adapter
fix: Resolve Gmail search pagination issue
docs: Update installation instructions
test: Add tests for Slack adapter
refactor: Simplify search service logic
```

Prefixes:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test changes
- `refactor`: Code refactoring
- `chore`: Build/tooling changes

## Reporting Bugs

When reporting bugs, please include:

- **Description**: Clear description of the issue
- **Steps to reproduce**: Detailed steps to reproduce the bug
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Environment**: OS, Node version, app version
- **Logs**: Relevant error messages or logs
- **Screenshots**: If applicable

## Feature Requests

For feature requests, please provide:

- **Use case**: Describe the problem you're trying to solve
- **Proposed solution**: How you envision the feature working
- **Alternatives**: Other solutions you've considered
- **Additional context**: Any other relevant information

## Adding New Platform Adapters

To add support for a new messaging platform:

1. Create a new adapter class in `electron/services/adapters/`
2. Implement the `PlatformAdapter` interface
3. Add OAuth configuration if needed
4. Add tests for the new adapter
5. Update documentation

See `ARCHITECTURE_GUIDE.md` for detailed architecture information.

## Questions?

If you have questions about contributing:

- Check existing documentation
- Look for similar issues or PRs
- Open a discussion in the issue tracker

## License

By contributing to Message Hub, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Message Hub! 🎉
