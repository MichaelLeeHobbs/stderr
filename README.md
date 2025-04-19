# standardize-error

**Normalize any unknown thrown value into a proper Error instance with metadata.**

## Installation

```bash
pnpm add standardize-error
```

## Usage

```typescript
import { standardizeError } from 'standardize-error';

async function run() {
  try {
    // ...
  } catch (e: unknown) {
    const err = standardizeError(e);
    console.error(err);
  }
}
```

## Development
```bash
pnpm install
pnpm test 
pnpm build
```

## License
### MIT
