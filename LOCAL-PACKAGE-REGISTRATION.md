# Local Package Registration Guide

This guide explains how to create and register a new local package in the ritagraph Turborepo monorepo.

## Table of Contents
1. [Creating a New Package](#creating-a-new-package)
2. [Required Registration Points](#required-registration-points)
3. [Step-by-Step Checklist](#step-by-step-checklist)
4. [Verification](#verification)

## Creating a New Package

### 1. Package Structure
Create your package following this structure:
```
packages/
└── your-package-name/
    ├── src/
    │   └── index.ts        # Main entry point
    ├── dist/               # Generated (git-ignored)
    ├── package.json
    ├── tsconfig.json
    └── README.md
```

### 2. Package.json Template
```json
{
  "name": "@the-project-b/your-package-name",
  "version": "1.0.0",
  "description": "Description of your package",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint . --ext .ts",
    "test": "jest"
  },
  "dependencies": {
    // Your dependencies
  },
  "devDependencies": {
    "@types/node": "^24.0.3",
    "typescript": "^5.8.3"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

### 3. TypeScript Configuration
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

## Required Registration Points

When adding a new local package, you MUST update ALL of the following files:

### 1. Root Configuration (REQUIRED)

#### `package.json` (root)
Add to workspaces array:
```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "packages/your-package-name"  // Add if not covered by glob
  ]
}
```

#### `turbo.json`
Add build pipeline if needed:
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

### 2. Docker Configuration (IF DEPLOYED)

#### `apps/experiments/Dockerfile`
Add package.json COPY statement:
```dockerfile
# Copy workspace package.json files for dependency resolution
COPY packages/your-package-name/package.json ./packages/your-package-name/
```

Add to build command:
```dockerfile
RUN npm run build -- --filter=@the-project-b/your-package-name
```

#### `apps/rita/Dockerfile` (if applicable)
Same pattern as experiments Dockerfile

### 3. Build Tools Configuration

#### `apps/experiments/esbuild.config.js`
Add to nodeExternalsPlugin allowList if package should be bundled:
```javascript
nodeExternalsPlugin({
  allowList: [
    '@the-project-b/rita-graphs',
    '@the-project-b/graphql',
    '@the-project-b/logging',
    '@the-project-b/your-package-name'  // Add here
  ]
})
```

### 4. CI/CD Configuration

#### `.github/workflows/deploy-experiments.yml`
Add to build step:
```yaml
- name: Build packages
  run: npm run build -- --filter=@the-project-b/graphql --filter=@the-project-b/rita-graphs --filter=@the-project-b/logging --filter=@the-project-b/your-package-name
```

### 5. Package Registry Configuration

#### `.npmrc` files
Ensure these exist with GitHub package registry configuration:
- `/packages/your-package-name/.npmrc`
```
@the-project-b:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

### 6. Dependency Management

#### `.syncpackrc.json`
Update if package has special version requirements:
```json
{
  "dependencyTypes": ["prod", "dev"],
  "filter": ".",
  "indent": "  ",
  "semverRange": "^",
  "versionGroups": [
    {
      "dependencies": ["@the-project-b/**"],
      "pinVersion": "*"
    }
  ]
}
```

### 7. Consumer Applications

#### Add as dependency where needed:
- `apps/experiments/package.json`
- `apps/rita/package.json`
- Other packages that depend on it

```json
{
  "dependencies": {
    "@the-project-b/your-package-name": "*"
  }
}
```

### 8. TypeScript Project References

#### Root `tsconfig.json`
Add to references if using project references:
```json
{
  "references": [
    { "path": "./packages/your-package-name" }
  ]
}
```

## Step-by-Step Checklist

- [ ] Create package directory structure in `packages/`
- [ ] Create `package.json` with correct name and configuration
- [ ] Create `tsconfig.json` extending root config
- [ ] Add to root `package.json` workspaces (if needed)
- [ ] Update Dockerfile(s) with COPY statements
- [ ] Update Dockerfile(s) build commands
- [ ] Add to esbuild allowList (if bundled)
- [ ] Update GitHub workflow build step
- [ ] Create `.npmrc` in package directory
- [ ] Add package as dependency in consuming apps
- [ ] Run `npm install` from root to link package
- [ ] Run `npm run build` to verify build works
- [ ] Update documentation

## Verification

### 1. Install and Link
```bash
# From monorepo root
npm install
```

### 2. Build Package
```bash
# Build only your package
npm run build -- --filter=@the-project-b/your-package-name

# Build with dependencies
npm run build
```

### 3. Test Import
In a consuming app, verify import works:
```typescript
import { something } from '@the-project-b/your-package-name';
```

### 4. Docker Build Test
```bash
# Test Docker build locally
make experiments:docker-test
```

### 5. Verify TypeScript
```bash
# Check for TypeScript errors
npm run typecheck
```

## Common Issues

### Package Not Found
- Ensure `npm install` was run from root
- Check package name matches exactly in all files
- Verify workspaces configuration

### Build Failures
- Check tsconfig extends correct base config
- Ensure all dependencies are installed
- Verify src/index.ts exists and exports correctly

### Docker Build Issues
- Verify Dockerfile COPY statements include new package
- Ensure build command includes package filter
- Check esbuild allowList if bundling

### Import Errors
- Verify package.json exports field is correct
- Check that dist/ files are generated
- Ensure TypeScript types are exported

## Best Practices

1. **Naming**: Always use `@the-project-b/` prefix for consistency
2. **Versioning**: Use `"*"` for local packages in dependencies
3. **TypeScript**: Always provide type definitions
4. **Documentation**: Include README.md in package
5. **Testing**: Add tests in package directory
6. **Exports**: Use explicit exports in package.json
7. **Building**: Ensure package builds independently

## Complete File List to Update

When adding a new package, these files typically need updates:

1. **Package Creation**
   - `/packages/[name]/package.json` ✅ Create
   - `/packages/[name]/tsconfig.json` ✅ Create
   - `/packages/[name]/src/index.ts` ✅ Create
   - `/packages/[name]/.npmrc` ✅ Create

2. **Root Configuration**
   - `/package.json` ⚠️ Update if needed
   - `/turbo.json` ⚠️ Update if custom pipeline

3. **Docker & Deployment**
   - `/apps/experiments/Dockerfile` ✅ Update
   - `/apps/rita/Dockerfile` ⚠️ Update if used by rita
   - `/.github/workflows/deploy-experiments.yml` ✅ Update

4. **Build Configuration**
   - `/apps/experiments/esbuild.config.js` ✅ Update
   - `/apps/rita/esbuild.config.js` ⚠️ Update if exists

5. **Consumer Apps**
   - `/apps/experiments/package.json` ⚠️ If used
   - `/apps/rita/package.json` ⚠️ If used
   - Other packages' package.json ⚠️ If used

6. **Documentation**
   - `/README.md` ⚠️ Update if significant
   - `/CLAUDE.md` ⚠️ Update if affects AI assistance

Legend: ✅ Always required | ⚠️ Conditional