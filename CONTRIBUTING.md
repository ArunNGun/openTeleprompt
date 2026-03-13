# Contributing to OpenTeleprompter

Thanks for your interest! Here's how to contribute.

## Ground rules

- **No direct pushes to `main`** — all changes go through a Pull Request
- Every PR requires **1 approving review** from [@ArunNGun](https://github.com/ArunNGun)
- Keep PRs focused — one feature or fix per PR
- Test on macOS before submitting

## Getting started

```bash
git clone https://github.com/ArunNGun/openTeleprompt
cd openTeleprompt
npm install
open node_modules/electron/dist/Electron.app --args "$(pwd)"
```

## Submitting a PR

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test thoroughly on macOS
5. Open a PR against `main` with a clear description

## What we welcome

- Bug fixes
- Performance improvements
- New features that fit the app's minimal philosophy
- Accessibility improvements
- Documentation improvements

## What we'll likely decline

- Breaking the single-file renderer architecture
- Adding heavy dependencies
- Features that compromise privacy (no cloud, no tracking — ever)
