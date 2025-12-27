# Release Management Guide

## Semantic Versioning

ARES Dashboard follows [Semantic Versioning 2.0.0](https://semver.org/).

Given a version number `MAJOR.MINOR.PATCH`:

- **MAJOR**: Incompatible API changes
- **MINOR**: New functionality (backwards compatible)
- **PATCH**: Bug fixes (backwards compatible)

### Version Format

- Production: `1.0.0`, `1.2.3`, `2.0.0`
- Pre-release: `1.0.0-alpha.1`, `1.0.0-beta.2`, `1.0.0-rc.1`
- Build metadata: `1.0.0+20240115`

## Current Version: 0.9.0

The project is currently in beta. Version 1.0.0 will be the first stable release with full OAuth integration and production database support.

## Release Process

### 1. Update Version

```bash
# Bump version
npm version <major|minor|patch>

# Or specify version
npm version 1.0.0
```

### 2. Update CHANGELOG.md

Document all changes in CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/) format.

### 3. Create GitHub Release

Tag and push:
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 4. Automated Release (GitHub Actions)

The `.github/workflows/release.yml` workflow automatically:
- Creates GitHub release
- Generates release notes from CHANGELOG
- Builds and uploads artifacts
- Deploys to production

## Version Strategy

- **0.x.x**: Beta releases (current)
- **1.0.0**: First stable release
- **1.x.x**: Feature additions
- **2.0.0**: Major changes

## Backwards Compatibility

ARES maintains backwards compatibility within major versions. Breaking changes are only introduced in major version bumps with migration guides provided.

## Resources

- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)
