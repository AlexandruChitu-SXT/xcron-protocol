# Contributing to XCron Protocol

Thank you for your interest in contributing to XCron Protocol!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/xcron-protocol.git`
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Submit a Pull Request

## Development Setup

### Smart Contracts (Rust)

```bash
cd contracts/scheduler
cargo check    # Verify compilation
cargo test     # Run unit tests
```

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev    # Start dev server at localhost:5173
```

### SDK (TypeScript)

```bash
cd sdk
npm install
```

## Code Style

- **Rust contracts** — Follow existing patterns, use CEI (Checks-Effects-Interactions)
- **TypeScript** — No `any` types without justification, use explicit types
- **Commits** — Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`

## Security

- Never commit private keys, PEM files, or mnemonics
- Never commit `.env` files (use `.env.example`)
- The pre-commit hook will scan for sensitive data automatically
- If you find a security vulnerability, please report it privately

## What to Contribute

- Bug fixes and improvements
- New test scenarios
- Documentation improvements
- SDK enhancements
- Frontend features

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
